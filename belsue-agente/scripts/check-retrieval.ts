/**
 * Comprueba la calidad de la búsqueda de documentos.
 *
 *   npm run check-retrieval
 *
 * Lanza preguntas reales contra el buscador y mira si aparece el documento que
 * debería. Compilar no dice nada sobre si el agente responde bien: esto sí, y
 * es lo que hay que ejecutar después de tocar el troceado, el umbral, el
 * modelo de embeddings o la construcción de la consulta.
 *
 * Las preguntas salen del historial real de conversaciones; el documento
 * esperado lo hemos decidido a mano (el que un corredor habría querido ver).
 */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Deben coincidir con lib/retrieval.ts. Si cambian allí, cambian aquí.
const MATCH_THRESHOLD = 0.3;
const MATCH_COUNT = 8;
const OVERFETCH = 3;
const EMBEDDING_MODEL = "text-embedding-3-small";
const SHORT_MESSAGE = 80;

interface Caso {
  pregunta: string;
  /** Cualquiera de estos documentos se da por bueno. */
  esperado: string[];
  scope?: "seguros" | "procedimientos";
  /** Contexto previo, para las preguntas que continúan una conversación. */
  anterior?: string;
}

const CASOS: Caso[] = [
  // --- Compañía concreta: lo que más falla ---
  {
    pregunta: "¿Qué cubre el seguro de hogar de Mapfre?",
    esperado: ["COMBINADO_HOGAR_MAPFRE_CONDICIONADO", "HOGAR.PLATINO_MAPFRE_CONDICIONADO"],
  },
  {
    pregunta: "qué coberturas tiene el seguro de moto de Allianz",
    esperado: ["MOTO_ALLIANZ_CONDICIONADO"],
  },
  {
    pregunta: "condicionado del seguro de auto de Zurich",
    esperado: ["AUTO_ZURICH_CONDICIONADO"],
  },
  {
    pregunta: "qué cubre el seguro de hogar de Reale",
    esperado: ["HOGAR_REALE_CONDICIONADO"],
  },
  {
    pregunta: "coberturas del seguro de hogar de Mussap",
    esperado: ["HOGAR_MUSSAP_CONDICIONADO"],
  },
  // --- Trámites y notas: aquí funciona bien ---
  {
    pregunta: "¿Cómo cambio la fecha de cobro de un recibo en Zurich?",
    esperado: ["CAMBIAR FECHA DE COBRO DE UN RECIBO EN ZURICH"],
  },
  { pregunta: "cómo cotizo en onlygal", esperado: ["CÓMO COTIZAR EN ONLYGAL"] },
  {
    pregunta: "dónde cotizo una autocaravana",
    esperado: ["COTIZAR CARAVANAS EN VARIAS COMPAÑIAS", "TARIFAS AUTOCARAVANAS Y CAMPERS MAPFRE"],
  },
  {
    pregunta: "cómo solicito la baja de una póliza de Active",
    esperado: ["SOLICITUD BAJA ACTIVE"],
  },
  {
    pregunta: "requisitos para asegurar un taxi en Allianz",
    esperado: ["REQUISITOS TAXIS EN ALLIANZ"],
  },
  {
    pregunta: "franquicias de todo riesgo de Mapfre",
    esperado: ["Franquicias_TodoRiesgo_PVP MAPFRE"],
  },
  {
    pregunta: "talleres recomendados en Zaragoza de Allianz",
    esperado: ["TALLERES EXCELENTE ZARAGOZA ALLIANZ"],
  },
  {
    pregunta: "cuadro médico de CH Salud de Active",
    esperado: ["CH SALUD CUADRO MÉDICO ACTIVE", "TARIFAS CUADRO MÉDICO CH SALUD ACTIVE"],
  },
  {
    pregunta: "teléfonos y contactos de Mapfre",
    esperado: ["CONTACTOS_MAPFRE"],
  },
  {
    pregunta: "cómo se asegura un taxi en Mapfre",
    esperado: ["PÓLIZA TAXI EN MAPFRE"],
  },
  // --- Continuaciones: la consulta corta no se sostiene sola ---
  {
    pregunta: "Rellenarla contigo",
    anterior: "pásame la plantilla de recogida de datos de autos",
    esperado: ["Plantilla_autos_datos"],
  },
  // --- Procedimientos internos ---
  {
    pregunta: "cómo guardo una contraseña en Aunna Pass",
    esperado: ["GUIA AUNNA PASS"],
    scope: "procedimientos",
  },
];

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Igual que buildSearchQuery en app/api/chat: los mensajes cortos se amplían. */
function consultaDeBusqueda(caso: Caso): string {
  if (caso.pregunta.trim().length > SHORT_MESSAGE || !caso.anterior) {
    return caso.pregunta;
  }
  return `${caso.anterior}\n${caso.pregunta}`;
}

async function buscar(caso: Caso): Promise<string[]> {
  const emb = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: consultaDeBusqueda(caso).replace(/\n/g, " "),
  });

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: emb.data[0]!.embedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT * OVERFETCH,
    filter_scope: caso.scope ?? "seguros",
  });
  if (error) throw new Error(error.message);

  // Mismo descarte de repetidos que hace la aplicación.
  const vistos = new Set<string>();
  const documentos: string[] = [];
  for (const fila of (data ?? []) as { content: string; document_name: string }[]) {
    const clave = fila.content.trim();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    if (!documentos.includes(fila.document_name)) {
      documentos.push(fila.document_name);
    }
    if (vistos.size === MATCH_COUNT) break;
  }
  return documentos;
}

async function main() {
  let primeros = 0;
  let entreLosTres = 0;
  let ausentes = 0;

  console.log(`Comprobando ${CASOS.length} preguntas…\n`);

  for (const caso of CASOS) {
    const documentos = await buscar(caso);
    const posicion = documentos.findIndex((d) => caso.esperado.includes(d));

    let marca: string;
    if (posicion === 0) {
      marca = "  OK  ";
      primeros++;
      entreLosTres++;
    } else if (posicion > 0 && posicion < 3) {
      marca = " CASI ";
      entreLosTres++;
    } else if (posicion >= 3) {
      marca = " LEJOS";
      ausentes++;
    } else {
      marca = " FALLA";
      ausentes++;
    }

    console.log(`[${marca}] ${caso.pregunta}`);
    console.log(`          espera: ${caso.esperado[0]}`);
    console.log(
      `          obtiene: ${documentos.slice(0, 3).join(" | ") || "(nada)"}`,
    );
    if (posicion > 0) console.log(`          (aparece en la posición ${posicion + 1})`);
    console.log();
  }

  const total = CASOS.length;
  console.log("─".repeat(60));
  console.log(`Primero:        ${primeros}/${total}`);
  console.log(`En los 3 mejores: ${entreLosTres}/${total}`);
  console.log(`Mal:            ${ausentes}/${total}`);

  // Falla si menos de dos tercios aciertan de pleno: sirve de aviso al tocar
  // el troceado o el umbral.
  if (primeros / total < 0.66) {
    console.log("\n⚠ Por debajo del mínimo aceptable (2/3 en primera posición).");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
