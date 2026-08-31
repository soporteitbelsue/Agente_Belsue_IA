#!/usr/bin/env bash
#
# Arranca (o rearranca) la aplicación en el servidor de IONOS.
#
# Se puede lanzar las veces que haga falta: la primera línea retira el
# contenedor anterior, así que no se queja del nombre repetido.
#
# El puerto se publica solo en 127.0.0.1: nada expuesto a internet mientras
# no haya un dominio con HTTPS delante. Se entra por túnel SSH.
#
docker rm -f belsue-app 2>/dev/null

docker run -d --name belsue-app --restart unless-stopped \
  --network supabase_default \
  --env-file /opt/belsue/app/belsue-agente/.env.local \
  -v /opt/belsue/app/belsue-agente:/app \
  -w /app \
  -p 127.0.0.1:3000:3000 \
  node:22 npm start
