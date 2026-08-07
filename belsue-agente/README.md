# Belsue Agente IA

Agente de IA con RAG (Retrieval-Augmented Generation) para consulta de pólizas y
documentación aseguradora. Construido con **Next.js 14 (App Router)**,
**TypeScript**, **Tailwind CSS**, **Supabase (PostgreSQL + pgvector)** y la
**API de OpenAI**.

## Características

- 💬 **Chat IA** en dos pestañas independientes, cada una con su propio
  conocimiento, historial y prompt (ver [`lib/scopes.ts`](lib/scopes.ts)):
  - **El Formador** (`/chat`): producto, compañías y condicionados.
  - **Procedimientos** (`/procedimientos`): cómo trabajamos por dentro
    (organización de la oficina, circuitos, herramientas, quién hace qué).

  Ambas responden basándose únicamente en el material indexado de su ámbito y
  citan las fuentes utilizadas. Los documentos y notas llevan una columna
  `scope` que decide en qué pestaña se usan.
- 📤 **Panel de administración** (`/admin`): subida de documentos PDF, DOCX y TXT
  con metadatos (compañía, categoría, descripción).
- 🔎 **Búsqueda semántica** mediante embeddings (`text-embedding-3-small`) y la
  función `match_chunks` de Supabase con pgvector.

## Stack

| Capa            | Tecnología                                   |
| --------------- | -------------------------------------------- |
| Framework       | Next.js 14 (App Router)                       |
| Lenguaje        | TypeScript (modo estricto)                    |
| Estilos         | Tailwind CSS                                  |
| Base de datos   | Supabase / PostgreSQL + pgvector             |
| IA              | OpenAI (`gpt-4o`, `text-embedding-3-small`)  |
| Parsing         | `unpdf`, `mammoth`                            |
| Validación      | `zod`                                         |

## Requisitos

- Node.js 18.17+ (recomendado 20+)
- Una cuenta de [Supabase](https://supabase.com)
- Una clave de API de [OpenAI](https://platform.openai.com)

## 1. Instalación

```bash
cd belsue-agente
npm install
```

## 2. Variables de entorno

Copia el ejemplo y rellena los valores:

```bash
cp .env.local.example .env.local
```

```env
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
UPLOAD_DIR=/ruta/en/servidor/documentos
```

- `SUPABASE_URL` y las claves se obtienen en **Project Settings → API**.
- La **service role key** es secreta: solo se usa en el servidor (API routes).
- `UPLOAD_DIR` es la carpeta del servidor (p. ej. IONOS) donde se guardan los
  archivos subidos. Debe existir o tener permisos de escritura.

## 3. Configuración de Supabase

1. Crea un proyecto en Supabase.
2. Abre el **SQL Editor**.
3. Copia y ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql).
   Esto:
   - Habilita la extensión `vector` (pgvector).
   - Crea las tablas `documents` y `document_chunks`.
   - Crea la función `match_chunks` para la búsqueda por similitud.
   - Crea el índice `ivfflat` para búsquedas eficientes.
4. Ejecuta después, en orden, los archivos de
   [`supabase/migrations/`](supabase/migrations/). En una base de datos ya en
   uso son la forma de incorporar los cambios posteriores al esquema base
   (notas de conocimiento, autoría y ámbitos de las pestañas).

> **Nota sobre el índice ivfflat:** funciona mejor cuando ya hay datos. Si
> insertas muchos documentos, puedes recrear el índice posteriormente para
> mejorar la precisión (`REINDEX`).

## 4. Ejecución en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) — redirige a `/chat`.

- Sube documentos en [http://localhost:3000/admin](http://localhost:3000/admin).
- Una vez indexados, pregunta en el chat.

## 5. Comprobación de tipos y build

```bash
npm run typecheck   # tsc --noEmit
npm run build       # build de producción
npm run start       # servidor de producción
```

## Estructura del proyecto

```
belsue-agente/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                 # redirige a /chat
│   ├── chat/page.tsx            # interfaz del agente IA
│   ├── admin/page.tsx           # subida de documentos
│   └── api/
│       ├── chat/route.ts        # POST /api/chat
│       └── documents/
│           ├── route.ts         # GET /api/documents
│           └── upload/route.ts  # POST /api/documents/upload
├── components/
│   ├── chat/                    # ChatWindow, MessageBubble, SourceCard
│   └── admin/                   # UploadForm, DocumentList
├── lib/
│   ├── supabase.ts              # clientes browser/server
│   ├── openai.ts                # cliente OpenAI + modelos
│   ├── parsers.ts               # extracción de texto PDF/DOCX/TXT
│   ├── embeddings.ts            # chunking, embeddings e indexado
│   └── retrieval.ts             # búsqueda por similitud (RAG)
├── types/index.ts               # tipos compartidos
└── supabase/schema.sql          # esquema SQL
```

## Flujo RAG

1. El usuario sube un documento en `/admin`.
2. `processAndStoreDocument` extrae el texto, lo divide en _chunks_ con
   solapamiento, genera un embedding por chunk y los guarda en
   `document_chunks` (en lotes de 20).
3. En el chat, `retrieveRelevantChunks` genera el embedding de la pregunta y
   llama a `match_chunks` (threshold 0.7) para recuperar los fragmentos más
   relevantes.
4. Esos fragmentos se inyectan como contexto en el prompt de `gpt-4o`, que
   responde citando las fuentes.

## Notas de despliegue (IONOS / servidor propio)

- Asegúrate de que `UPLOAD_DIR` apunta a una ruta persistente y con permisos de
  escritura del proceso de Node.
- Las API routes usan `runtime = "nodejs"` (necesario para `fs`, `unpdf` y
  `mammoth`).
- No expongas nunca `SUPABASE_SERVICE_ROLE_KEY` al cliente.
```
