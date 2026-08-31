#!/usr/bin/env bash
#
# Genera los secretos de la instalación autoalojada de Supabase y los escribe
# en el .env. Se ejecuta DENTRO del servidor, en la carpeta que contiene el
# .env (normalmente /opt/belsue/supabase).
#
# Los tokens ANON_KEY y SERVICE_ROLE_KEY son JWT firmados con JWT_SECRET; se
# firman aquí con un contenedor de Node de usar y tirar, para no tener que
# pegar el secreto en ninguna página web.
#
# Uso:  bash generar-secretos.sh
#
set -euo pipefail

ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: no encuentro $ENV_FILE en $(pwd)."
  echo "Ejecuta el script desde la carpeta donde está el .env de Supabase."
  exit 1
fi

BACKUP=".env.backup.$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$BACKUP"
echo "Copia de seguridad del .env en $BACKUP"
echo ""

# --- Valores aleatorios -----------------------------------------------------
# Se usa hexadecimal a propósito: no lleva caracteres que rompan las cadenas
# de conexión (@ : / +) ni que haya que escapar en el .env.
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
JWT_SECRET="$(openssl rand -hex 32)"          # 64 caracteres, mínimo exigido 32
SECRET_KEY_BASE="$(openssl rand -hex 32)"
VAULT_ENC_KEY="$(openssl rand -hex 16)"       # tiene que medir exactamente 32
DASHBOARD_USERNAME="belsue"
DASHBOARD_PASSWORD="$(openssl rand -hex 12)"
POOLER_TENANT_ID="belsue"

# --- Firma de los JWT -------------------------------------------------------
firmar_jwt() {
  local rol="$1"
  docker run --rm -e JWT_SECRET="$JWT_SECRET" -e ROL="$rol" node:22-alpine node -e '
    const crypto = require("crypto");
    const b64 = (o) =>
      Buffer.from(typeof o === "string" ? o : JSON.stringify(o))
        .toString("base64")
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 60 * 60 * 24 * 365 * 10;   // diez años
    const cuerpo = b64({ role: process.env.ROL, iss: "supabase", iat, exp });
    const cabecera = b64({ alg: "HS256", typ: "JWT" });
    const datos = cabecera + "." + cuerpo;
    const firma = crypto
      .createHmac("sha256", process.env.JWT_SECRET)
      .update(datos)
      .digest("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    process.stdout.write(datos + "." + firma);
  '
}

echo "Firmando los tokens de acceso..."
ANON_KEY="$(firmar_jwt anon)"
SERVICE_ROLE_KEY="$(firmar_jwt service_role)"
echo "Firmados."
echo ""

# --- Escritura en el .env ---------------------------------------------------
poner() {
  local clave="$1" valor="$2"
  if grep -qE "^${clave}=" "$ENV_FILE"; then
    awk -v k="$clave" -v v="$valor" \
      '{ if (index($0, k "=") == 1) print k "=" v; else print }' \
      "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
    printf "  %-22s actualizada\n" "$clave"
  else
    echo "${clave}=${valor}" >> "$ENV_FILE"
    printf "  %-22s añadida\n" "$clave"
  fi
}

echo "Escribiendo en $ENV_FILE:"
poner POSTGRES_PASSWORD  "$POSTGRES_PASSWORD"
poner JWT_SECRET         "$JWT_SECRET"
poner ANON_KEY           "$ANON_KEY"
poner SERVICE_ROLE_KEY   "$SERVICE_ROLE_KEY"
poner SECRET_KEY_BASE    "$SECRET_KEY_BASE"
poner VAULT_ENC_KEY      "$VAULT_ENC_KEY"
poner DASHBOARD_USERNAME "$DASHBOARD_USERNAME"
poner DASHBOARD_PASSWORD "$DASHBOARD_PASSWORD"
poner POOLER_TENANT_ID   "$POOLER_TENANT_ID"
echo ""

# --- Revisión ---------------------------------------------------------------
echo "Valores de ejemplo que siguen en el fichero (deberían ser solo URLs):"
if grep -nE "your-super-secret|your-tenant|super-secret-jwt|this_password_is_insecure|supabase-admin" "$ENV_FILE"; then
  echo ""
  echo "  ^ revisa esas líneas: si alguna es una contraseña o una clave, avisa."
else
  echo "  ninguno."
fi
echo ""

echo "Longitudes (para comprobar sin enseñar los valores):"
for c in POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY VAULT_ENC_KEY; do
  printf "  %-22s %s caracteres\n" "$c" "$(grep -E "^${c}=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\n' | wc -c)"
done
echo ""
echo "VAULT_ENC_KEY tiene que medir exactamente 32 y JWT_SECRET 32 o más."
echo ""
echo "Guarda la contraseña del panel en tu gestor de contraseñas:"
echo "  usuario:    $DASHBOARD_USERNAME"
echo "  contraseña: $DASHBOARD_PASSWORD"
