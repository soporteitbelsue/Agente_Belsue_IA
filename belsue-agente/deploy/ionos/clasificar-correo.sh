#!/usr/bin/env bash
#
# Reubica el correo nuevo de la bandeja de entrada en las carpetas de
# Siniestros, Administración y Producción (lo decide el agente con IA).
#
# Llama al endpoint /api/correo/clasificar de la aplicación, que corre en este
# mismo servidor. El secreto se lee de MAIL_SORT_SECRET en .env.local.
#
# Instalación (una vez):
#   scp "...\deploy\ionos\clasificar-correo.sh" root@31.70.134.101:/opt/belsue/
#   chmod +x /opt/belsue/clasificar-correo.sh
#   crontab -e    y añadir la línea:
#   */5 * * * * flock -n /tmp/clasificar-correo.lock /opt/belsue/clasificar-correo.sh >> /var/log/belsue-correo.log 2>&1
#
# Probar a mano sin mover nada:
#   bash /opt/belsue/clasificar-correo.sh --simular
#
set -uo pipefail

ENV_FILE="/opt/belsue/app/belsue-agente/.env.local"
SECRET="$(grep -E '^MAIL_SORT_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d "\"' \r")"

if [ -z "$SECRET" ]; then
  echo "$(date '+%F %T') ERROR: falta MAIL_SORT_SECRET en $ENV_FILE"
  exit 1
fi

URL="http://127.0.0.1:3000/api/correo/clasificar"
[ "${1:-}" = "--simular" ] && URL="$URL?simular=1"

RESPUESTA="$(curl -s -m 280 -X POST -H "Authorization: Bearer $SECRET" -w '\n%{http_code}' "$URL")"
CODIGO="$(echo "$RESPUESTA" | tail -1)"
CUERPO="$(echo "$RESPUESTA" | sed '$d')"

if [ "$CODIGO" != "200" ]; then
  echo "$(date '+%F %T') ERROR HTTP $CODIGO: $CUERPO"
  exit 1
fi

# Una línea por pasada con algo que contar; las pasadas vacías no ensucian el log.
if ! echo "$CUERPO" | grep -q '"revisados":0'; then
  echo "$(date '+%F %T') $CUERPO"
fi
