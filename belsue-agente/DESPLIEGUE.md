# Despliegue en Vercel

Guía para publicar el Agente IA de Belsué en producción con un subdominio
(p. ej. `agente.belsue.es`). Vercel despliega automáticamente desde GitHub.

---

## 1. Crear la cuenta y conectar el repo

1. Entra en **https://vercel.com** y regístrate **con GitHub** (la cuenta
   `soporteitbelsue`).
2. **Add New… → Project** → importa el repositorio
   **`soporteitbelsue/Agente_Belsue_IA`**.

## 2. Configuración del proyecto (¡importante!)

En la pantalla de importación:

- **Root Directory**: pulsa *Edit* y selecciona **`belsue-agente`**.
  ⚠️ Es imprescindible: la app de Next.js está en esa subcarpeta, no en la raíz
  del repositorio.
- **Framework Preset**: Next.js (se detecta solo).
- **Build Command** / **Output**: dejar por defecto.

## 3. Variables de entorno

En **Environment Variables**, añade estas (copia los valores de tu
`.env.local`). Marca todas para *Production* (y *Preview* si quieres):

| Variable | De dónde sale |
| --- | --- |
| `OPENAI_API_KEY` | tu clave de OpenAI |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (service_role, secreta) |
| `NEXT_PUBLIC_SUPABASE_URL` | igual que `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | igual que `SUPABASE_ANON_KEY` |
| `NEXTAUTH_SECRET` | el mismo string largo de tu `.env.local` |
| `NEXTAUTH_URL` | la URL pública (ver abajo) |

- **`NEXTAUTH_URL`**: al principio, mientras no tengas el subdominio, ponlo con
  la URL que te da Vercel (p. ej. `https://agente-belsue-ia.vercel.app`).
  Cuando conectes el subdominio, cámbialo a `https://agente.belsue.es` y
  **vuelve a desplegar**. Si el login falla en producción, casi siempre es
  porque `NEXTAUTH_URL` no coincide con la URL real.
- Ya **no** hace falta `UPLOAD_DIR` ni `ADMIN_KEY`.

## 4. Desplegar

Pulsa **Deploy**. En 1-2 minutos tendrás la app en una URL `*.vercel.app`.
A partir de aquí, **cada `git push` a `main` despliega solo**.

## 5. Conectar el subdominio `agente.belsue.es`

1. En el proyecto de Vercel: **Settings → Domains → Add** → escribe
   `agente.belsue.es`.
2. Vercel te dirá que crees un registro **CNAME** en tu proveedor de dominio
   (donde esté `belsue.es`): normalmente
   `agente` → `cname.vercel-dns.com`.
3. Cuando el DNS propague (minutos), el dominio quedará activo con HTTPS.
4. Cambia `NEXTAUTH_URL` a `https://agente.belsue.es` y **redeploya**
   (Deployments → … → Redeploy).

---

## Notas y límites

- **Documentos muy grandes**: indexar un PDF enorme puede superar el tiempo
  máximo de ejecución de las funciones en el plan **Hobby (gratis)**. Si algún
  documento grande falla al procesarse, esa es la causa; el plan **Pro** amplía
  el límite (el código ya pide `maxDuration = 300`).
- **Storage**: los documentos se guardan en el bucket privado `documentos` de
  Supabase. El plan gratis de Supabase incluye 1 GB, de sobra para condicionados.
- **Seguridad**: nunca subas el `.env.local` (está en `.gitignore`). La
  `SUPABASE_SERVICE_ROLE_KEY` solo va en las variables de Vercel, jamás en el
  cliente.
