/**
 * Copia los documentos originales del almacenamiento de Supabase (producción)
 * al de la instalación autoalojada. No van en el volcado de la base de datos:
 * ahí solo están sus metadatos.
 *
 * Se ejecuta dentro del servidor, en un contenedor de Node conectado a la red
 * de Supabase, para poder llegar al gateway por su nombre interno.
 *
 * Variables necesarias:
 *   ORIGEN_URL     https://<ref>.supabase.co
 *   ORIGEN_KEY     service_role de producción
 *   DESTINO_URL    http://envoy:8000
 *   DESTINO_KEY    SERVICE_ROLE_KEY del .env de esta instalación
 *
 * Es idempotente: se puede volver a lanzar sin duplicar nada, y sirve para la
 * segunda pasada del día del cambio.
 */

const { createClient } = require("@supabase/supabase-js");

const BUCKET = "documentos";
const OPCIONES = { auth: { persistSession: false, autoRefreshToken: false } };

for (const v of ["ORIGEN_URL", "ORIGEN_KEY", "DESTINO_URL", "DESTINO_KEY"]) {
  if (!process.env[v]) {
    console.error(`Falta la variable ${v}.`);
    process.exit(1);
  }
}

const origen = createClient(process.env.ORIGEN_URL, process.env.ORIGEN_KEY, OPCIONES);
const destino = createClient(process.env.DESTINO_URL, process.env.DESTINO_KEY, OPCIONES);

/**
 * Recorre el bucket entero. La API devuelve como máximo 100 entradas por
 * llamada y trata las carpetas como elementos sin `id`, así que hay que
 * paginar y bajar por cada carpeta.
 */
async function listarTodo(prefijo = "") {
  const encontrados = [];
  let desplazamiento = 0;

  for (;;) {
    const { data, error } = await origen.storage
      .from(BUCKET)
      .list(prefijo, { limit: 100, offset: desplazamiento, sortBy: { column: "name", order: "asc" } });

    if (error) throw new Error(`Listando "${prefijo}": ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entrada of data) {
      const ruta = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
      if (entrada.id === null) {
        encontrados.push(...(await listarTodo(ruta)));   // es una carpeta
      } else {
        encontrados.push({ ruta, tipo: entrada.metadata?.mimetype, bytes: entrada.metadata?.size });
      }
    }

    if (data.length < 100) break;
    desplazamiento += data.length;
  }

  return encontrados;
}

async function asegurarBucket() {
  const { data } = await destino.storage.getBucket(BUCKET);
  if (data) {
    console.log(`El bucket "${BUCKET}" ya existe en destino.`);
    return;
  }
  const { error } = await destino.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`No se pudo crear el bucket: ${error.message}`);
  }
  console.log(`Bucket "${BUCKET}" creado (privado).`);
}

async function copiar(fichero, indice, total) {
  const etiqueta = `[${String(indice).padStart(3, " ")}/${total}] ${fichero.ruta}`;

  const { data: blob, error: errorBajada } = await origen.storage.from(BUCKET).download(fichero.ruta);
  if (errorBajada) throw new Error(`descargando: ${errorBajada.message}`);

  const buffer = Buffer.from(await blob.arrayBuffer());

  const { error: errorSubida } = await destino.storage.from(BUCKET).upload(fichero.ruta, buffer, {
    contentType: fichero.tipo || blob.type || "application/octet-stream",
    upsert: true,
  });
  if (errorSubida) throw new Error(`subiendo: ${errorSubida.message}`);

  const kb = Math.round(buffer.length / 1024);
  console.log(`${etiqueta}  ${kb} KB`);
  return buffer.length;
}

(async () => {
  await asegurarBucket();

  console.log("Listando el almacenamiento de origen...");
  const ficheros = await listarTodo();
  console.log(`Encontrados ${ficheros.length} ficheros.\n`);

  let copiados = 0;
  let bytes = 0;
  const fallos = [];

  for (let i = 0; i < ficheros.length; i++) {
    try {
      bytes += await copiar(ficheros[i], i + 1, ficheros.length);
      copiados++;
    } catch (err) {
      console.error(`      FALLO en ${ficheros[i].ruta}: ${err.message}`);
      fallos.push({ ruta: ficheros[i].ruta, motivo: err.message });
    }
  }

  console.log("\n─────────────────────────────────");
  console.log(`Copiados: ${copiados} de ${ficheros.length}`);
  console.log(`Volumen:  ${(bytes / 1024 / 1024).toFixed(1)} MB`);

  if (fallos.length) {
    console.log(`\nFallaron ${fallos.length}:`);
    for (const f of fallos) console.log(`  - ${f.ruta}: ${f.motivo}`);
    process.exit(1);
  }

  console.log("\nSin fallos. Vuelve a lanzarlo cuando quieras: no duplica nada.");
})().catch((err) => {
  console.error("\nError general:", err.message);
  process.exit(1);
});
