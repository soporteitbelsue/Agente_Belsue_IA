#!/usr/bin/env node
/**
 * Sube en bloque los manuales de eBroker al portal de Procedimientos.
 *
 * Hace exactamente lo mismo que el formulario de subida de la app, PDF a PDF:
 *   1. POST /api/documents/upload-url   → registra el documento y da una URL firmada
 *   2. Sube el archivo a Supabase Storage con esa URL firmada
 *   3. POST /api/documents/{id}/process → extrae el texto (o lo lee con visión) e indexa
 *
 * Lee títulos, categorías y descripciones de
 *   manuales_ebroker/Manuales_ebroker/clasificacion_ebroker.csv
 * y se salta los documentos que ya existen en la app con el mismo título, así
 * que se puede relanzar sin miedo a duplicar.
 *
 * Uso (desde la carpeta belsue-agente):
 *   node scripts/subir-manuales-ebroker.mjs --prueba   → solo 3 PDFs pequeños
 *   node scripts/subir-manuales-ebroker.mjs            → todos los pendientes
 *   node scripts/subir-manuales-ebroker.mjs --simular  → lista lo que haría, sin subir nada
 *
 * Variables opcionales:
 *   APP_URL            (por defecto https://panelformacion.belsueseguros.es)
 *   BELSUE_EMAIL       (por defecto soporteit@belsue.es)
 *   BELSUE_PASSWORD    si no está, se pide por teclado (sin mostrarla)
 *   SUPABASE_ANON_KEY  si no está, se busca en .env.local o se pide por teclado
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
// En el VPS el script va junto a los PDFs (/opt/belsue/manuales_ebroker/);
// en el PC, dentro de belsue-agente/scripts/.
const CARPETA = existsSync(join(AQUI, "Manuales_ebroker"))
  ? join(AQUI, "Manuales_ebroker")
  : join(RAIZ, "manuales_ebroker", "Manuales_ebroker");
const CSV = join(CARPETA, "clasificacion_ebroker.csv");

const APP_URL = (process.env.APP_URL ?? "https://panelformacion.belsueseguros.es").replace(/\/$/, "");
const EMAIL = process.env.BELSUE_EMAIL ?? "soporteit@belsue.es";
const BUCKET = "documentos";
const PORTAL = "procedimientos";
const COMPANIA = "eBroker";

// Archivos que NO se suben (obsoletos o repetidos).
const EXCLUIR = new Set(["Separatas/EBROKER_NOTIFICACIONES_TWITTER.pdf"]);

// Para --prueba: uno con texto, una guía reciente y uno escaneado (visión).
const PRUEBA = [
  "Separatas/SEPA_IBAN_BIC.pdf",
  "Separatas/Medio_cobro_Tarjeta_bancaria_TPV_Guia_rapida.pdf",
  "Separatas/separata_abreviaturas_es_es.pdf",
];

const args = new Set(process.argv.slice(2));
const MODO_PRUEBA = args.has("--prueba");
const SIMULAR = args.has("--simular");

// ---------------------------------------------------------------- utilidades

function preguntar(texto, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      rl._writeToOutput = (s) => {
        // Solo deja ver el propio texto de la pregunta, no lo que se teclea.
        if (s.startsWith(texto)) rl.output.write(texto);
      };
    }
    rl.question(texto, (r) => {
      rl.close();
      if (oculto) process.stdout.write("\n");
      resolve(r.trim());
    });
  });
}

function leerCsv() {
  const lineas = readFileSync(CSV, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const [cabecera, ...filas] = lineas;
  const cols = cabecera.split(";");
  return filas.map((l) => {
    const v = l.split(";");
    return Object.fromEntries(cols.map((c, i) => [c, (v[i] ?? "").trim()]));
  });
}

function claveAnonDeEnvLocal() {
  const ruta = join(RAIZ, ".env.local");
  if (!existsSync(ruta)) return null;
  const env = Object.fromEntries(
    readFileSync(ruta, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
  // Solo vale si ese .env.local apunta al mismo servidor (el de este PC podía
  // seguir apuntando a la Supabase antigua, que ya no existe).
  if (env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !== APP_URL) return null;
  return env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
}

const tamanoMB = (b) => (b / 1024 / 1024).toFixed(1) + " MB";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ sesión NextAuth

const cookies = new Map();
function guardarCookies(res) {
  for (const c of res.headers.getSetCookie()) {
    const [par] = c.split(";");
    const i = par.indexOf("=");
    cookies.set(par.slice(0, i), par.slice(i + 1));
  }
}
const cabeceraCookie = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");

async function api(ruta, opciones = {}) {
  const res = await fetch(APP_URL + ruta, {
    ...opciones,
    redirect: "manual",
    headers: { ...(opciones.headers ?? {}), cookie: cabeceraCookie() },
  });
  guardarCookies(res);
  return res;
}

async function iniciarSesion(password) {
  const csrfRes = await api("/api/auth/csrf");
  if (!csrfRes.ok) throw new Error(`No se pudo contactar con ${APP_URL} (${csrfRes.status}).`);
  const { csrfToken } = await csrfRes.json();

  await api("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password, callbackUrl: APP_URL, json: "true" }),
  });

  const sesion = await (await api("/api/auth/session")).json();
  if (!sesion?.user) throw new Error("Usuario o contraseña incorrectos.");
  if (sesion.user.mustChangePassword) {
    throw new Error("Este usuario tiene una contraseña temporal: cámbiala antes en la web.");
  }
  return sesion.user;
}

// --------------------------------------------------------------- subir un PDF

async function esperarIndexado(id) {
  // Por si la petición de procesado se corta (los escaneados tardan): la app
  // sigue trabajando en el servidor, así que se mira el estado cada 15 s.
  for (let i = 0; i < 80; i++) {
    await espera(15000);
    const r = await api(`/api/documents/${id}/status`);
    if (r.ok) {
      const s = await r.json();
      if (s.status === "ready") return s.chunkCount;
    }
  }
  throw new Error("Sigue sin indexar después de 20 minutos.");
}

async function subir(fila, supabase) {
  const ruta = join(CARPETA, ...fila.archivo.split("/"));
  const buffer = readFileSync(ruta);

  // 1. Registrar el documento y pedir URL firmada.
  const r1 = await api("/api/documents/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: fila.titulo,
      ext: extname(ruta).toLowerCase(),
      fileSize: buffer.length,
      description: fila.descripcion || undefined,
      company: COMPANIA,
      category: fila.categoria,
      scopes: [PORTAL],
    }),
  });
  const d1 = await r1.json().catch(() => ({}));
  if (!r1.ok) throw new Error(d1.error ?? `upload-url respondió ${r1.status}`);
  const { documentId, path, token } = d1;

  // 2. Subir el archivo a Storage.
  const { error: errSubida } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(path, token, buffer, { contentType: "application/pdf" });
  if (errSubida) {
    throw new Error(`Error al subir a Storage: ${errSubida.message} (doc ${documentId} queda sin archivo: bórralo desde la web)`);
  }

  // 3. Indexar.
  try {
    const r3 = await api(`/api/documents/${documentId}/process`, { method: "POST" });
    const d3 = await r3.json().catch(() => ({}));
    if (!r3.ok) throw new Error(d3.error ?? `process respondió ${r3.status}`);
  } catch (err) {
    // Si es un corte de red/timeout, puede que el servidor siga indexando.
    if (/fetch failed|timeout|terminated|socket/i.test(String(err?.message ?? err))) {
      process.stdout.write(" (tarda, esperando al servidor…)");
      return esperarIndexado(documentId);
    }
    throw err;
  }
  const s = await (await api(`/api/documents/${documentId}/status`)).json().catch(() => ({}));
  return s.chunkCount ?? "?";
}

// ---------------------------------------------------------------------- main

async function main() {
  console.log(`\nManuales eBroker → ${APP_URL} (portal ${PORTAL})\n`);

  let filas = leerCsv().filter((f) => !EXCLUIR.has(f.archivo));
  if (MODO_PRUEBA) filas = filas.filter((f) => PRUEBA.includes(f.archivo));

  // Comprobar que los archivos existen antes de empezar.
  const faltan = filas.filter((f) => !existsSync(join(CARPETA, ...f.archivo.split("/"))));
  if (faltan.length) {
    console.error("No encuentro estos archivos:\n  " + faltan.map((f) => f.archivo).join("\n  "));
    process.exit(1);
  }

  const password = process.env.BELSUE_PASSWORD || (await preguntar(`Contraseña de ${EMAIL}: `, true));
  const usuario = await iniciarSesion(password);
  console.log(`Sesión iniciada como ${usuario.email ?? EMAIL}.`);

  // Títulos que ya están en la app → no se repiten.
  const rLista = await api(`/api/documents?scope=${PORTAL}`);
  if (!rLista.ok) throw new Error(`No se pudo leer la lista de documentos (${rLista.status}). ¿El usuario es admin?`);
  const existentes = new Set((await rLista.json()).documents.map((d) => d.name.trim().toLowerCase()));

  const pendientes = filas.filter((f) => !existentes.has(f.titulo.toLowerCase()));
  const yaEstan = filas.length - pendientes.length;
  console.log(`${filas.length} en la lista · ${yaEstan} ya subidos · ${pendientes.length} pendientes\n`);

  if (SIMULAR) {
    for (const f of pendientes) console.log(`  [${f.categoria}] ${f.titulo}  ←  ${f.archivo}`);
    console.log("\n(Simulación: no se ha subido nada.)");
    return;
  }
  if (!pendientes.length) return console.log("Nada que subir.");

  // En el VPS llega por --env-file con el .env.local de la app.
  const anonDelEntorno =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") === APP_URL
      ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : null;
  let anonKey = process.env.SUPABASE_ANON_KEY || anonDelEntorno || claveAnonDeEnvLocal();
  if (!anonKey) {
    console.log("Falta la clave pública (anon) de Supabase del VPS: NEXT_PUBLIC_SUPABASE_ANON_KEY en su .env.local.");
    anonKey = await preguntar("Pégala aquí: ");
  }
  const supabase = createClient(APP_URL, anonKey, { auth: { persistSession: false } });

  const fallos = [];
  for (const [i, f] of pendientes.entries()) {
    const tam = tamanoMB(statSync(join(CARPETA, ...f.archivo.split("/"))).size);
    process.stdout.write(`[${i + 1}/${pendientes.length}] ${f.titulo} (${tam})…`);
    const t0 = Date.now();
    try {
      const chunks = await subir(f, supabase);
      console.log(` ✔ ${chunks} fragmentos, ${Math.round((Date.now() - t0) / 1000)} s`);
    } catch (err) {
      console.log(` ✘ ${err.message}`);
      fallos.push(`${basename(f.archivo)}: ${err.message}`);
    }
  }

  console.log(`\nTerminado: ${pendientes.length - fallos.length} subidos, ${fallos.length} con error.`);
  if (fallos.length) {
    console.log("Errores:\n  " + fallos.join("\n  "));
    console.log("Puedes relanzar el script: se salta los que ya están subidos.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
