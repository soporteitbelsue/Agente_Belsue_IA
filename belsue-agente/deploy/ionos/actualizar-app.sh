#!/usr/bin/env bash
#
# Sube al servidor de IONOS la última versión publicada en GitHub.
#
# Hace lo mismo que se hacía a mano en el Hito 7 del README, en un solo paso:
# traer los cambios, instalar lo que falte, compilar y relanzar la aplicación.
#
# Instalación (una vez):
#   scp "...\deploy\ionos\actualizar-app.sh" root@31.70.134.101:/opt/belsue/
#   chmod +x /opt/belsue/actualizar-app.sh
#
# Uso:
#   bash /opt/belsue/actualizar-app.sh
#
# Es seguro relanzarlo: si no hay nada nuevo lo dice y se para sin tocar nada.
#
# Lo que NO hace, a propósito: no toca la base de datos ni los documentos, y no
# escribe en .env.local. Las variables se cambian a mano (ver README, "Variables
# al dominio"); este script solo mueve código.
#
set -uo pipefail

APP="/opt/belsue/app"
DIR="$APP/belsue-agente"
NODE="node:22"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') — actualizando la aplicación ==="

# --- Comprobaciones previas -------------------------------------------------
if [ ! -d "$DIR" ]; then
  echo "ERROR: no encuentro $DIR. ¿Está clonado el repositorio en $APP?"
  exit 1
fi
if [ ! -f "$DIR/.env.local" ]; then
  echo "ERROR: falta $DIR/.env.local. Sin él la compilación no arranca."
  exit 1
fi

cd "$APP" || exit 1

# Un cambio hecho a mano SOBRE UN FICHERO DEL REPOSITORIO haría fallar el pull a
# mitad y dejaría el código descuadrado. Mejor pararse antes y que se decida qué
# hacer con él.
#
# Los ficheros que git no sigue (--untracked-files=no) no se miran: un resto
# suelto en la carpeta no estorba a un fast-forward, y plantarse por eso deja el
# despliegue bloqueado por algo que no tiene nada que ver.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ERROR: hay cambios sin guardar en ficheros del repositorio, en $APP:"
  git status --short --untracked-files=no
  echo ""
  echo "Descártalos (git checkout -- .) o guárdalos antes de actualizar."
  exit 1
fi

# Los sueltos solo se avisan, para que no se queden ahí para siempre sin que
# nadie repare en ellos.
SUELTOS="$(git status --porcelain --untracked-files=normal | grep '^??' || true)"
if [ -n "$SUELTOS" ]; then
  echo "Aviso: hay ficheros sueltos que no son del repositorio (no estorban):"
  echo "$SUELTOS" | sed 's/^/  /'
  echo ""
fi

ANTES="$(git rev-parse HEAD)"

# --- Traer los cambios ------------------------------------------------------
echo "--- git pull"
if ! git pull --ff-only; then
  echo "ERROR: el pull ha fallado. La aplicación sigue como estaba."
  exit 1
fi

DESPUES="$(git rev-parse HEAD)"
if [ "$ANTES" = "$DESPUES" ]; then
  echo ""
  echo "No hay nada nuevo que publicar ($(git log -1 --format='%h %s'))."
  echo "La aplicación sigue en marcha sin tocarla."
  exit 0
fi

echo ""
echo "Cambios que entran:"
git log --oneline "$ANTES..$DESPUES"
echo ""

# --- Dependencias -----------------------------------------------------------
# Solo si package-lock.json ha cambiado: un npm ci tarda varios minutos y la
# mayoría de los despliegues no tocan las dependencias.
if git diff --name-only "$ANTES" "$DESPUES" | grep -q "belsue-agente/package-lock.json"; then
  echo "--- npm ci (han cambiado las dependencias)"
  if ! docker run --rm -v "$DIR:/app" -w /app "$NODE" npm ci; then
    echo "ERROR: npm ci ha fallado. La aplicación sigue con la versión anterior."
    exit 1
  fi
else
  echo "--- npm ci: no hace falta, las dependencias no cambian"
fi

# --- Compilar ---------------------------------------------------------------
# Se compila ANTES de tocar el contenedor: si el build falla, la versión que
# está sirviendo sigue en pie y nadie se entera de nada.
echo ""
echo "--- npm run build"
if ! docker run --rm --network supabase_default --env-file "$DIR/.env.local" \
      -v "$DIR:/app" -w /app "$NODE" npm run build; then
  echo ""
  echo "ERROR: la compilación ha fallado."
  echo "La aplicación en marcha NO se ha tocado: sigue sirviendo la versión anterior."
  echo "Para volver el código atrás:  cd $APP && git reset --hard $ANTES"
  exit 1
fi

# --- Relanzar ---------------------------------------------------------------
echo ""
echo "--- relanzando el contenedor"
bash /opt/belsue/arrancar-app.sh

# Next tarda un par de segundos en escuchar; preguntar antes da un falso error.
sleep 5

CODIGO="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login)"
echo ""
if [ "$CODIGO" = "200" ]; then
  echo "=== Listo. La aplicación responde (HTTP $CODIGO) en $(git log -1 --format='%h %s')."
else
  echo "=== AVISO: la aplicación responde HTTP $CODIGO, se esperaba 200."
  echo "Mira qué dice:  docker logs --tail 50 belsue-app"
  exit 1
fi
