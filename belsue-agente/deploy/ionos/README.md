# Copia del Agente Belsué en IONOS

Guía verificada para levantar un duplicado completo del agente en un VPS de IONOS
**sin tocar producción**. Todos los pasos de aquí se ejecutaron y funcionaron el
31 de agosto de 2026; producción siguió en Vercel + Supabase durante todo el proceso.

> **Regla que no se rompe:** esta copia usa su propia base de datos. Nunca apuntes esta
> instalación a la Supabase de producción: cualquier prueba (borrar un documento,
> reindexar, restablecer una contraseña) tocaría datos reales.

**Servidor usado:** VPS 4-4-120 de IONOS — 4 vCores, 4 GB RAM, 120 GB NVMe SSD,
Ubuntu 26.04 LTS con Docker preinstalado.

---

## Por qué el paquete recortado

Supabase autoalojado trae once servicios. Esta aplicación solo usa tres cosas —consultas
a tablas, almacenamiento de ficheros y una función de búsqueda—, así que el resto se
queda apagado. Por eso 4 GB son suficientes: el conjunto ocupa **1,3 GB**.

El inicio de sesión es propio (tabla `users` + bcrypt con NextAuth), de modo que el
sistema de usuarios de Supabase sobra por completo.

| Servicio | ¿Se arranca? | Motivo |
| --- | --- | --- |
| `db` (Postgres + pgvector) | **Sí** | El corazón de todo |
| `rest` (PostgREST) | **Sí** | Atiende las 102 consultas y la función de búsqueda |
| `storage` | **Sí** | Los 131 documentos originales |
| `imgproxy` | **Sí** | Storage lo exige como dependencia |
| `api-gw` (Envoy) | **Sí** | La puerta de entrada. En esta versión el gateway por defecto es Envoy, no Kong |
| `studio` | Se cuela | `api-gw` lo declara en su `depends_on`. Merece la pena quedárselo: son ~250 MB y da el panel web |
| `auth` (GoTrue) | No | El inicio de sesión es propio |
| `realtime` | No | Ninguna pantalla se suscribe a cambios en vivo |
| `functions` | No | No hay Edge Functions en el proyecto |
| `supavisor` | No | La aplicación entra por PostgREST, no por conexión directa |
| `analytics` / `vector` | No | Ya no vienen en el compose base; están en el overlay `docker-compose.logs.yml` |

> **Ojo con un nombre confuso:** el servicio `vector` del paquete **no** tiene nada que ver
> con `pgvector`. Es un recolector de registros. La búsqueda semántica vive dentro de
> Postgres como extensión, y esa no se toca jamás.

El recorte **no se hace editando el `docker-compose.yml`**: basta con arrancar los
servicios por su nombre y dejar que Compose resuelva las dependencias.

---

## Hito 1 — Sistema base

```bash
docker --version          # 29.7.2
docker compose version    # v5.5.0
free -h                   # ~3,7 GB
df -h /                   # ~116 GB
```

El VPS viene **sin espacio de intercambio**, lo que deja al servidor sin red de seguridad:
ante un pico de memoria, el sistema mata procesos en vez de tirar de disco un momento.

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
tail -2 /etc/fstab        # comprobar que la línea quedó en su propio renglón

# Que solo recurra al intercambio cuando de verdad haga falta: con Postgres
# delante, irse al disco por gusto lo ralentiza.
sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' >> /etc/sysctl.conf
```

**Consejo de terminal:** si al pegar aparecen cosas como `^[[200~docker`, desactiva el
pegado entre corchetes o pelearás con esto todo el rato:

```bash
bind 'set enable-bracketed-paste off'
echo "set enable-bracketed-paste off" >> ~/.inputrc
```

---

## Hito 2 — El paquete de Supabase

```bash
mkdir -p /opt/belsue && cd /opt/belsue
git clone --depth 1 https://github.com/supabase/supabase.git tmp-supabase
mv tmp-supabase/docker ./supabase
rm -rf tmp-supabase
cd supabase && cp .env.example .env
```

---

## Hito 3 — Secretos

`setup.sh` **no** genera secretos: es el instalador que clona el repositorio y prepara la
carpeta, o sea el paso que ya hicimos a mano. Los secretos los genera
`generar-secretos.sh`, que está en esta misma carpeta.

Súbelo desde tu equipo (en PowerShell, con rutas de Windows):

```powershell
scp "...\deploy\ionos\generar-secretos.sh" root@IP_DEL_SERVIDOR:/opt/belsue/supabase/
```

Y ejecútalo en el servidor:

```bash
cd /opt/belsue/supabase && bash generar-secretos.sh
chmod 600 .env
```

Genera contraseñas con `openssl` y **firma los tokens `ANON_KEY` y `SERVICE_ROLE_KEY` en
el propio servidor**, con un contenedor de Node de usar y tirar. La alternativa habitual
es pegar el `JWT_SECRET` en la calculadora web de Supabase, y no hace falta exponerlo.

Los valores van en hexadecimal a propósito: sin `@`, `:` ni `/`, que romperían las
cadenas de conexión.

Comprobaciones que tienen que salir bien:

- `VAULT_ENC_KEY` mide **exactamente 32** caracteres, o Postgres no arranca
- `JWT_SECRET` mide 32 o más
- Los únicos valores de ejemplo que pueden quedar son los de `LOGFLARE_*`, que no se usan

**Guarda en tu gestor de contraseñas** el usuario y contraseña del panel que imprime al
final: no se vuelven a mostrar.

---

## Hito 4 — Cerrar el puerto y arrancar

El compose publica el gateway como `${API_GW_HTTP_PORT:-8000}:8000`, es decir **abierto a
internet**. Sin HTTPS todavía, las claves viajarían en claro. Docker acepta una dirección
dentro de esa variable, así que basta con esto para que solo escuche en local:

```bash
cd /opt/belsue/supabase
echo 'API_GW_HTTP_PORT=127.0.0.1:8000' >> .env
chmod 600 .env
```

```bash
docker compose up -d db rest storage imgproxy api-gw
docker compose ps      # seis contenedores, todos healthy
free -h                # ~1,3 GB usados
```

---

## Hito 5 — La base de datos

```bash
docker compose exec db psql -U postgres -c "create extension if not exists vector;"
docker compose exec db psql -U postgres -c "select extversion from pg_extension where extname='vector';"
```

En destino salió `0.8.2` frente al `0.8.0` de origen. No es problema: es una versión de
parche superior y lee el formato antiguo tal cual.

### Volcado

Se hace **desde el servidor**, que ya tiene Docker: así no hace falta instalar Postgres en
Windows ni subir después un fichero de 59 MB.

La contraseña de la base de datos de Supabase no se puede consultar; si no la tienes,
resetéala en *Project Settings → Database → Reset password*. **Es seguro**: la aplicación
habla con Supabase por la API REST con la `SERVICE_ROLE_KEY`, no con esta contraseña, así
que producción no se entera.

La cadena de conexión está en el botón **Connect** de la barra superior, no en los ajustes
de base de datos. Usa la de **Session pooler (puerto 5432)**; la de *Transaction pooler*
(6543) no sirve para `pg_dump`.

Se pasa la contraseña por variable de entorno y no dentro de la URI: así no hay que
escapar caracteres como `@`, `/` o `#`, que si no rompen la conexión con un error confuso.

```bash
cd /opt/belsue
docker run --rm -e PGPASSWORD='LA_CONTRASEÑA' postgres:17 pg_dump \
  -h aws-0-eu-west-1.pooler.supabase.com -p 5432 \
  -U postgres.hdichdfttboegujcwmih -d postgres \
  --schema=public --no-owner --no-privileges -Fc > belsue.dump
ls -lh belsue.dump        # unos 59 MB
```

### Restauración

```bash
cd /opt/belsue/supabase
docker compose exec -T db pg_restore -U postgres -d postgres --no-owner --clean --if-exists < /opt/belsue/belsue.dump
```

Saldrán errores por pantalla y son normales: `--clean` intenta borrar objetos que todavía
no existen.

### Permisos (imprescindible)

El volcado se hizo con `--no-privileges`, así que las tablas llegan sin permisos para los
roles internos y PostgREST no podría leerlas:

```bash
docker compose exec -T db psql -U postgres -c "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;"
```

Que `anon` aparezca no abre nada: las tablas tienen RLS activo sin políticas desde la
migración `009`, así que deniegan todo salvo a la clave de servicio.

### Comprobación

```bash
docker compose exec db psql -U postgres -c "select (select count(*) from documents) as documentos, (select count(*) from document_chunks) as fragmentos, (select count(*) from users) as usuarios;"
docker compose exec db psql -U postgres -c "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace left join pg_depend d on d.objid=p.oid and d.deptype='e' where n.nspname='public' and d.objid is null order by 1;"
```

Salieron **344** documentos, **8591** fragmentos, **6** usuarios y las tres funciones
propias: `match_chunks`, `match_chunks_by_company` y `set_updated_at`.

> **No recrees el índice `ivfflat`.** Se eliminó a propósito en julio de 2026 porque
> destrozaba la calidad de los resultados. La búsqueda hace un barrido exacto y a esta
> escala tarda menos de un segundo. Si algún día hiciera falta un índice, sería HNSW, y
> midiendo la calidad antes de darlo por bueno.

---

## Hito 6 — Los documentos originales

No van en el volcado: viven en el almacenamiento, aparte. Sube `copiar-storage.js` y
ejecútalo. Necesita la `SERVICE_ROLE_KEY` **de producción** (Supabase → *Project Settings
→ API Keys*); la del destino la saca sola del `.env`.

```bash
cd /opt/belsue
DESTINO_KEY=$(grep -E '^SERVICE_ROLE_KEY=' supabase/.env | cut -d= -f2-)
docker run --rm --network supabase_default -v /opt/belsue:/app -w /app \
  -e ORIGEN_URL="https://hdichdfttboegujcwmih.supabase.co" \
  -e ORIGEN_KEY="LA_SERVICE_ROLE_DE_PRODUCCION" \
  -e DESTINO_URL="http://envoy:8000" \
  -e DESTINO_KEY="$DESTINO_KEY" \
  node:22-alpine sh -c "npm i --silent @supabase/supabase-js && node copiar-storage.js"
```

Copió **131 de 131 ficheros, 92,8 MB**. Es idempotente: se puede relanzar sin duplicar
nada, y eso mismo sirve para la segunda pasada del día del cambio.

---

## Hito 7 — La aplicación

### Acceso al repositorio

Con una **deploy key** de solo lectura, no con un token personal: acceso mínimo y
revocable.

```bash
ssh-keygen -t ed25519 -C "vps-ionos-agente-belsue" -f /root/.ssh/id_ed25519_belsue -N ""
printf 'Host github.com\n  HostName github.com\n  User git\n  IdentityFile /root/.ssh/id_ed25519_belsue\n  IdentitiesOnly yes\n' >> /root/.ssh/config
chmod 600 /root/.ssh/config
cat /root/.ssh/id_ed25519_belsue.pub
```

Esa clave pública se añade en *Settings → Deploy keys* del repositorio, **sin marcar**
"Allow write access". Va sin contraseña a propósito: con ella, cada `git pull` la pediría.

```bash
ssh -T git@github.com
cd /opt/belsue
git clone git@github.com:soporteitbelsue/Agente_Belsue_IA.git app
```

### Variables

```bash
cd /opt/belsue
ANON=$(grep -E '^ANON_KEY=' supabase/.env | cut -d= -f2-)
SERVICE=$(grep -E '^SERVICE_ROLE_KEY=' supabase/.env | cut -d= -f2-)
cat > app/belsue-agente/.env.local <<EOF
OPENAI_API_KEY=UNA_CLAVE_APARTE_PARA_NO_MEZCLAR_EL_GASTO
SUPABASE_URL=http://envoy:8000
SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000
EOF
chmod 600 app/belsue-agente/.env.local
```

Las dos URL distintas no son una errata: `SUPABASE_URL` la usa el servidor y va por la red
interna de Docker; `NEXT_PUBLIC_SUPABASE_URL` la usa el navegador y apunta al túnel.

El `NEXTAUTH_SECRET` es nuevo a propósito: si fuera el mismo que en producción, una sesión
iniciada en una instalación valdría en la otra.

### Compilar y arrancar

```bash
cd /opt/belsue/app/belsue-agente
docker run --rm -v /opt/belsue/app/belsue-agente:/app -w /app node:22 npm ci
docker run --rm --network supabase_default --env-file .env.local -v /opt/belsue/app/belsue-agente:/app -w /app node:22 npm run build
```

El arranque está en `arrancar-app.sh`, que se puede relanzar las veces que haga falta:

```bash
bash /opt/belsue/arrancar-app.sh
docker logs belsue-app
```

---

## Hito 8 — Dominio y HTTPS

`panelformacion.belsueseguros.es` apunta a este servidor desde el 1 de septiembre de
2026. **Es la dirección de producción.**

### Cortafuegos

En el Cloud Panel de IONOS, la política de firewall del servidor debe permitir **TCP 22,
80 y 443**. El 80 hace falta para emitir el certificado aunque después todo vaya por el
443. Los puertos 3000 y 8000 siguen escuchando solo en `127.0.0.1` y no se abren nunca.

Ojo: esa política es **compartida con el VPS de belchat**, así que un cambio ahí afecta a
los dos servidores.

### DNS

El registro era un CNAME hacia Vercel. Un CNAME no puede apuntar a una IP, así que hay que
**borrarlo y crear un registro A** con nombre `panelformacion` y valor `31.70.134.101`.

### El proxy

Un único dominio sirve para todo: Caddy manda `/rest/v1` y `/storage/v1` a Supabase y el
resto a la aplicación. Eso es lo que hace que el navegador y el servidor vean Supabase en
la **misma** dirección, que era la causa de que los PDF no cargaran.

```bash
printf '%s\n' 'panelformacion.belsueseguros.es {' '  encode gzip' '  handle /rest/v1/* {' '    reverse_proxy 127.0.0.1:8000' '  }' '  handle /storage/v1/* {' '    reverse_proxy 127.0.0.1:8000' '  }' '  handle {' '    reverse_proxy 127.0.0.1:3000 {' '      header_up Host {host}' '      header_up X-Forwarded-Host {host}' '      header_up X-Forwarded-Proto {scheme}' '    }' '  }' '}' > /opt/belsue/Caddyfile

docker run -d --name belsue-caddy --restart unless-stopped --network host \
  -v /opt/belsue/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v /opt/belsue/caddy-data:/data -v /opt/belsue/caddy-config:/config caddy:2
```

Caddy pide el certificado a Let's Encrypt él solo en cuanto el dominio resuelve aquí.

> Se usa `printf` en vez de `nano` porque es fácil salir del editor sin guardar
> (`Ctrl+O`, `Enter`, `Ctrl+X`). Si el fichero no existe, Docker crea una **carpeta** con
> ese nombre al montarlo y el contenedor se queda en estado `Created` sin registros.

### Variables al dominio

```bash
cd /opt/belsue/app/belsue-agente
sed -i -e 's|^SUPABASE_URL=.*|SUPABASE_URL=https://panelformacion.belsueseguros.es|' \
       -e 's|^NEXT_PUBLIC_SUPABASE_URL=.*|NEXT_PUBLIC_SUPABASE_URL=https://panelformacion.belsueseguros.es|' \
       -e 's|^NEXTAUTH_URL=.*|NEXTAUTH_URL=https://panelformacion.belsueseguros.es|' .env.local
bash /opt/belsue/arrancar-app.sh
```

Las variables se leen al **crear** el contenedor: cambiar el fichero no basta, hay que
relanzarlo. Para comprobar lo que tiene por dentro: `docker exec belsue-app env | grep SUPABASE`.

### El middleware y el proxy

Detrás de un proxy, `request.url` devuelve la dirección de escucha de Next
(`localhost:3000`) y no el dominio público — **incluso recibiendo la cabecera `Host`
correcta**. Todas las redirecciones sacaban al usuario fuera del sitio.

No tiene arreglo desde Caddy. Se corrigió en `middleware.ts` (commit `b31b76f`)
construyendo la URL desde `x-forwarded-host` y `x-forwarded-proto`. En Vercel no cambia
nada, porque allí esas cabeceras ya llegaban bien.

Prueba que aísla el problema, por si vuelve a pasar con otra ruta:

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
  -H "Host: panelformacion.belsueseguros.es" -H "X-Forwarded-Proto: https" \
  http://127.0.0.1:3000/
```

Si con el `Host` correcto sigue respondiendo `localhost`, es la aplicación y no el proxy.

### Detalle al parar la aplicación

`docker stop belsue-app` deja el contenedor como `Exited (1)`, no `(0)`: npm no traduce
bien la señal de parada. **No es un fallo.** Y `--restart unless-stopped` no la relanza
después, porque se paró a mano — hay que arrancarla explícitamente.

---

## Acceso por túnel (ya no hace falta)

Los puertos 3000 y 8000 están cerrados a internet. Se entra por túnel SSH, **desde tu PC**
(el prompt tiene que empezar por `PS C:\`, no por `root@ubuntu`):

```powershell
ssh -L 3000:localhost:3000 -L 8000:localhost:8000 root@IP_DEL_SERVIDOR
```

Con esa ventana abierta: **http://localhost:3000**

---

## Verificación final

Contar filas no basta. Hay que comprobar tres cosas en el navegador:

- [ ] **Entrar** con un usuario real — valida `users`, bcrypt y NextAuth
- [ ] **Preguntar al chat** algo que esté en los documentos — es *la* prueba: valida que
      los 8591 fragmentos y la búsqueda vectorial sobrevivieron al viaje
- [ ] **Abrir un documento** del portal — valida los 131 ficheros y las URL firmadas

---

## Lo que queda pendiente

- [ ] **Contratar las copias de seguridad del VPS.** En IONOS van aparte. Ahora que esto es
      producción, es lo único que separa a la correduría de perder 344 documentos.
      Restaurar una y comprobar que el chat encuentra cosas: una copia sin probar no es
      una copia
- [ ] **Cerrar la instalación antigua.** `agente-belsue-ia.vercel.app` sigue viva y
      apuntando a la Supabase en la nube, con datos que ya no son los buenos. Quien entre
      por ahí trabajará sobre la base equivocada sin enterarse. Quitar el dominio del
      proyecto de Vercel y pausar el despliegue
- [ ] **Rotar la `SERVICE_ROLE_KEY` de producción**, que quedó expuesta durante el montaje
- [ ] **Revisar el plan de Vercel** si se mantiene algo allí: el plan Hobby prohíbe el uso
      comercial
