#!/usr/bin/env bash
#
# Copia de seguridad diaria del Agente Belsué.
#
# Guarda dos ficheros por día en /opt/belsue/copias:
#   bd-AAAAMMDD-HHMM.dump         la base de datos entera
#   ficheros-AAAAMMDD-HHMM.tar.gz los documentos originales
#
# Conserva los últimos DIAS y borra los anteriores.
#
# Instalación (una vez):
#   chmod +x /opt/belsue/copia-diaria.sh
#   crontab -e
#   30 3 * * * /opt/belsue/copia-diaria.sh >> /opt/belsue/copias/registro.log 2>&1
#
# IMPORTANTE: esto vive en el mismo servidor que los datos, así que NO protege
# de perder la máquina. Es la segunda red, no la primera: hace falta además el
# servicio de copias de IONOS, o bajarse los ficheros a otro sitio.
#
set -uo pipefail

DESTINO="/opt/belsue/copias"
SUPABASE="/opt/belsue/supabase"
VOLUMENES="$SUPABASE/volumes"
DIAS=7
FECHA="$(date +%Y%m%d-%H%M)"

mkdir -p "$DESTINO"
echo "=== $(date '+%Y-%m-%d %H:%M:%S') — empieza la copia ==="

fallos=0

# --- Base de datos --------------------------------------------------------
bd="$DESTINO/bd-$FECHA.dump"
if (cd "$SUPABASE" && docker compose exec -T db pg_dump -U postgres -d postgres \
      --schema=public --no-owner --no-privileges -Fc) > "$bd" 2>/dev/null; then
  tam=$(stat -c%s "$bd" 2>/dev/null || echo 0)
  # Un volcado bueno pasa de 10 MB. Menos que eso es que algo salió mal.
  if [ "$tam" -gt 10000000 ]; then
    echo "  base de datos:  $(du -h "$bd" | cut -f1)"
  else
    echo "  ERROR: el volcado salió demasiado pequeño ($tam bytes). Se descarta."
    rm -f "$bd"
    fallos=1
  fi
else
  echo "  ERROR: falló pg_dump."
  rm -f "$bd"
  fallos=1
fi

# --- Documentos originales ------------------------------------------------
ficheros="$DESTINO/ficheros-$FECHA.tar.gz"
if tar czf "$ficheros" -C "$VOLUMENES" storage 2>/dev/null; then
  cuantos=$(find "$VOLUMENES/storage" -type f | wc -l)
  echo "  documentos:     $(du -h "$ficheros" | cut -f1) ($cuantos ficheros)"
else
  echo "  ERROR: falló el empaquetado de los documentos."
  rm -f "$ficheros"
  fallos=1
fi

# --- Rotación -------------------------------------------------------------
# Solo se borran copias viejas si las de hoy salieron bien: más vale acumular
# ficheros que quedarse sin ninguno porque el proceso lleva días fallando.
if [ "$fallos" -eq 0 ]; then
  borradas=$(find "$DESTINO" -maxdepth 1 -type f \( -name 'bd-*.dump' -o -name 'ficheros-*.tar.gz' \) -mtime +$DIAS -print -delete | wc -l)
  echo "  rotación:       $borradas copias de más de $DIAS días borradas"
else
  echo "  rotación:       omitida, porque la copia de hoy falló"
fi

echo "  espacio libre:  $(df -h / | awk 'NR==2{print $4}')"
echo "=== fin ==="
exit "$fallos"
