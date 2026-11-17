import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
import { unzipSync } from "fflate";
import { openai, CHAT_MODEL } from "@/lib/openai";
import type { FileType } from "@/types";

/** Normaliza el texto extraído: colapsa espacios y líneas vacías repetidas. */
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    // Elimina el byte nulo (0x00) y demás caracteres de control C0/C1
    // (excepto \n y \t), que PostgreSQL rechaza en columnas text.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/[ \t]+/g, " ") // espacios/tabs múltiples -> uno
    .replace(/ *\n */g, "\n") // recorta espacios alrededor de saltos
    .replace(/\n{3,}/g, "\n\n") // máx. una línea en blanco consecutiva
    .trim();
}

/**
 * Reconstruye el texto de una página a partir de los "text items" de pdf.js.
 * Muchos PDFs no incluyen espacios explícitos entre palabras; los inferimos
 * (junto con los saltos de línea) a partir de la posición (coordenadas) de
 * cada fragmento.
 */
// eslint-disable-next-line
function itemsToText(items: any[]): string {
  let text = "";
  let lastX: number | null = null;
  let lastY: number | null = null;
  let lastWidth = 0;

  for (const item of items) {
    // pdf.js intercala marcadores de fin de línea sin `str`.
    if (item.str === undefined && item.hasEOL) {
      if (!text.endsWith("\n")) text += "\n";
      lastX = null;
      continue;
    }

    const str: string = item.str ?? "";
    const x: number = item.transform?.[4] ?? 0;
    const y: number = item.transform?.[5] ?? 0;
    const fontHeight: number = item.height || 8;

    if (lastY !== null && Math.abs(y - lastY) > fontHeight * 0.5) {
      // Cambio de línea vertical.
      if (!text.endsWith("\n")) text += "\n";
    } else if (lastX !== null) {
      // Mismo renglón: si hay hueco horizontal, falta un espacio.
      const gap = x - (lastX + lastWidth);
      if (
        gap > fontHeight * 0.2 &&
        !text.endsWith(" ") &&
        !text.endsWith("\n") &&
        !str.startsWith(" ")
      ) {
        text += " ";
      }
    }

    text += str;
    lastX = x;
    lastY = y;
    lastWidth = item.width ?? 0;

    if (item.hasEOL) {
      if (!text.endsWith("\n")) text += "\n";
      lastX = null;
    }
  }
  return text;
}

/**
 * El pdf.js que empaqueta `unpdf` llama a `Math.sumPrecise`, un builtin de
 * JS que todavía no existe en Node (tampoco en el 24). Sin este parche, subir
 * ciertos PDFs revienta con "Math.sumPrecise is not a function".
 *
 * Se puede borrar cuando Node incorpore el builtin.
 */

/** Suma compensada de Neumaier sobre una lista de números finitos. */
function neumaierSum(values: number[]): number {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const next = sum + value;
    // Recupera el error de redondeo que se pierde en cada suma parcial.
    compensation +=
      Math.abs(sum) >= Math.abs(value)
        ? sum - next + value
        : value - next + sum;
    sum = next;
  }
  return sum + compensation;
}

function ensureSumPrecise(): void {
  const math = Math as typeof Math & {
    sumPrecise?: (values: Iterable<number>) => number;
  };
  if (typeof math.sumPrecise === "function") return;

  math.sumPrecise = (values: Iterable<number>): number => {
    const list: number[] = [];
    for (const value of values) {
      if (typeof value !== "number") {
        throw new TypeError("Math.sumPrecise: todos los valores deben ser números.");
      }
      list.push(value);
    }

    if (list.length === 0) return -0; // lo que exige la especificación
    // Con Infinity o NaN de por medio la compensación no vale: manda la suma directa.
    if (!list.every(Number.isFinite)) return list.reduce((a, b) => a + b, 0);

    const total = neumaierSum(list);
    if (Number.isFinite(total)) return total;

    // Desbordamiento intermedio: las entradas son finitas pero alguna suma
    // parcial se sale de rango. Reescalamos (dividir entre una potencia de dos
    // es exacto), sumamos y deshacemos la escala.
    const SCALE = 2 ** 600;
    return neumaierSum(list.map((v) => v / SCALE)) * SCALE;
  };
}

/** Trozo de texto de un documento, con la página de la que sale (si la hay). */
export interface TextSegment {
  /** Página (1 = primera) en los PDF; null en el resto de formatos. */
  page: number | null;
  text: string;
}

/** Resultado de leer un PDF, con lo necesario para saber cómo fue. */
export interface PdfReadStats {
  pages: number;
  /** Páginas leídas con el modelo de visión (tablas, escaneados). */
  visionPages: number;
}

/**
 * Por debajo de esto, la página es sobre todo imagen: un escaneado, o una guía
 * hecha con capturas de pantalla cuyo contenido no está en el texto. Una
 * página normal de condicionado pasa de 2.000 caracteres.
 */
const SCANNED_MAX_CHARS = 400;
/** Tope de páginas por documento que se leen con visión, para acotar coste. */
const MAX_VISION_PAGES = 60;
/** Páginas leídas con visión a la vez. */
const VISION_CONCURRENCY = 3;
/** Resolución del render: 2 = el doble de 72 ppp, legible para tablas. */
const RENDER_SCALE = 2;

/**
 * ¿Hace falta mirar la página, no solo leer su texto?
 *
 * - Escaneada: casi no tiene texto extraíble.
 * - Tabla: muchas líneas cortas con cifras (límites, franquicias, primas).
 *   El texto de una tabla sale como una lista de celdas sueltas sin saber
 *   a qué fila ni columna pertenece cada una; leída como imagen, sí.
 */
function pageNeedsVision(text: string): "escaneada" | "tabla" | null {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length < SCANNED_MAX_CHARS) return "escaneada";

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 10) return null;
  const tabular = lines.filter(
    (l) => l.length <= 40 && /(\d|€|%)/.test(l),
  ).length;
  return tabular / lines.length >= 0.3 ? "tabla" : null;
}

const PDF_PAGE_PROMPT = `Eres el lector de documentos de una correduría de seguros. Te paso una página de un PDF (condicionado, ficha de producto, tarifa, folleto, manual...).

Devuelve en español, en texto plano, el contenido completo de la página para que se pueda consultar sin verla:
- Transcribe literalmente todo el texto, en orden de lectura. Respeta títulos, numeración de artículos y cláusulas.
- Las TABLAS, fila a fila, repitiendo en cada fila el nombre de cada columna: "Garantía: Robo | Límite: 3.000 € | Franquicia: 150 €". Así cada fila se entiende sola. Si una celda abarca varias filas, repite su valor en cada una.
- Las casillas marcadas (✓, X, "incluido") dilo así en cada fila.
- Si hay gráficos o esquemas, explica brevemente qué dicen.
- Omite cabeceras y pies de página repetitivos (logotipos, número de página, datos registrales).
No inventes nada que no se vea. No añadas introducciones ni comentarios.`;

/** Lee una página renderizada con el modelo de visión. */
async function readPageImage(png: ArrayBuffer): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: PDF_PAGE_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * Lee un PDF página a página. El texto se extrae con `unpdf` (pdf.js moderno;
 * reemplaza a `pdf-parse`, que fallaba en algunos PDFs con "Invalid number").
 * Las páginas escaneadas o con tablas se renderizan como imagen y se las lee
 * el modelo de visión, que entiende filas y columnas. Si la visión falla, se
 * queda el texto extraído: peor leído, pero nunca se pierde una página.
 *
 * `vision: false` se salta ese paso (más rápido y gratis).
 */
export async function readPdf(
  buffer: Buffer,
  { vision = true }: { vision?: boolean } = {},
): Promise<{ segments: TextSegment[]; stats: PdfReadStats }> {
  ensureSumPrecise();
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  // unpdf reutiliza el buffer internamente; copiamos a un Uint8Array propio.
  const pdf = await getDocumentProxy(new Uint8Array(buffer));

  try {
    const texts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { items } = await page.getTextContent();
      texts.push(cleanText(itemsToText(items)));
    }

    // Qué páginas mirar: primero las escaneadas (sin ellas no hay nada) y
    // luego las tablas, hasta el tope.
    const candidates = vision
      ? texts
          .map((text, i) => ({ i, kind: pageNeedsVision(text) }))
          .filter((c) => c.kind !== null)
          .sort((a, b) =>
            a.kind === b.kind ? a.i - b.i : a.kind === "escaneada" ? -1 : 1,
          )
          .slice(0, MAX_VISION_PAGES)
      : [];

    let visionPages = 0;
    let next = 0;
    const worker = async () => {
      while (next < candidates.length) {
        const { i } = candidates[next++]!;
        try {
          const png = await renderPageAsImage(pdf, i + 1, {
            canvasImport: () => import("@napi-rs/canvas"),
            scale: RENDER_SCALE,
          });
          const read = cleanText(await readPageImage(png));
          // Una lectura mucho más corta que el texto extraído es sospechosa
          // (se ha cortado o ha resumido): mejor quedarse con el texto.
          if (read && read.length >= (texts[i]?.length ?? 0) * 0.5) {
            texts[i] = read;
            visionPages++;
          }
        } catch (err) {
          console.error(
            `[pdf] No se pudo leer la página ${i + 1} con visión:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    };
    await Promise.all(Array.from({ length: VISION_CONCURRENCY }, worker));

    const segments = texts
      .map((text, i) => ({ page: i + 1, text }))
      .filter((s) => s.text.length > 0);
    return { segments, stats: { pages: pdf.numPages, visionPages } };
  } finally {
    // Libera la memoria de las páginas y fuentes cargadas.
    await pdf.cleanup();
  }
}

/** Devuelve el texto de los nodos `<a:t>` de un XML de OOXML, en orden. */
function xmlRunsToText(xml: string): string[] {
  const runs = xml.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) ?? [];
  return runs.map((run) =>
    run
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"),
  );
}

/** Ordena slide2.xml antes que slide10.xml (el orden alfabético no vale). */
function slideNumber(path: string): number {
  return Number(path.match(/(\d+)\.xml$/)?.[1] ?? 0);
}

/**
 * Extrae el texto de un PPTX. Por dentro es un ZIP con un XML por diapositiva;
 * lo abrimos con `fflate` y recogemos el texto de cada una.
 *
 * Incluimos también las notas del ponente: en las presentaciones de formación
 * la diapositiva suele ser un titular y la explicación de verdad está en las
 * notas, así que sin ellas el agente se queda con la mitad.
 */
function extractPptxText(buffer: Buffer): string {
  const files = unzipSync(new Uint8Array(buffer));
  const decoder = new TextDecoder("utf-8");

  const slidePaths = Object.keys(files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (slidePaths.length === 0) {
    throw new Error("El PPTX no contiene diapositivas legibles.");
  }

  const parts: string[] = [];
  for (const path of slidePaths) {
    const n = slideNumber(path);
    const texts = xmlRunsToText(decoder.decode(files[path]!));

    const notesPath = `ppt/notesSlides/notesSlide${n}.xml`;
    const notes = files[notesPath]
      ? xmlRunsToText(decoder.decode(files[notesPath]!))
          // PowerPoint mete el número de diapositiva como un run suelto.
          .filter((t) => t.trim() && t.trim() !== String(n))
      : [];

    const slide = [
      `[Diapositiva ${n}]`,
      texts.join("\n"),
      notes.length ? `Notas: ${notes.join(" ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    parts.push(slide);
  }

  return parts.join("\n\n");
}

const IMAGE_PROMPT = `Eres el lector de imágenes de la base de conocimiento de una correduría de seguros.
Te paso una imagen (captura de pantalla, foto de un documento, tabla, cuadro de garantías, esquema...).
Devuelve en español, en texto plano, TODO lo que haga falta para responder preguntas sobre ella sin verla:
- Transcribe literalmente todo el texto legible, respetando el orden de lectura.
- Las tablas, fila a fila, con "columna: valor".
- Si hay un esquema, un diagrama o pasos en una pantalla, explica qué muestra y en qué orden.
No inventes nada que no se vea. No añadas introducciones ni comentarios sobre la imagen.`;

/**
 * Una imagen no tiene texto que extraer: se la pasamos al modelo de visión
 * para que transcriba y describa su contenido, y eso es lo que se indexa.
 */
async function extractImageText(buffer: Buffer, fileType: "jpg" | "png"): Promise<string> {
  const mime = fileType === "png" ? "image/png" : "image/jpeg";
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: IMAGE_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${buffer.toString("base64")}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!text) {
    throw new Error("No se pudo leer ningún contenido en la imagen.");
  }
  return text;
}

/**
 * Extrae el texto plano de un buffer en memoria (PDF, DOCX, PPTX, TXT o imagen).
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: string,
): Promise<string> {
  const type = fileType.toLowerCase() as FileType;

  switch (type) {
    case "pdf": {
      // Solo texto (sin visión): este camino no guarda páginas. Para indexar
      // se usa extractSegments, que sí las lee bien.
      const { segments } = await readPdf(buffer, { vision: false });
      return segments.map((s) => s.text).join("\n\n");
    }
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return cleanText(result.value);
    }
    case "pptx": {
      return cleanText(extractPptxText(buffer));
    }
    case "txt": {
      return cleanText(buffer.toString("utf-8"));
    }
    case "jpg":
    case "png": {
      return cleanText(await extractImageText(buffer, type));
    }
    default:
      throw new Error(`Tipo de archivo no soportado: ${fileType}`);
  }
}

/**
 * Texto de un archivo, para indexarlo. Los PDF van página a página (con el
 * lector de visión para tablas y escaneados); el resto, en un solo trozo.
 */
export async function extractSegments(
  buffer: Buffer,
  fileType: string,
): Promise<{ segments: TextSegment[]; stats: PdfReadStats | null }> {
  if (fileType.toLowerCase() === "pdf") {
    return readPdf(buffer);
  }
  const text = await extractTextFromBuffer(buffer, fileType);
  return { segments: [{ page: null, text }], stats: null };
}

/**
 * Extrae el texto plano de un archivo del disco (PDF, DOCX o TXT).
 * Se conserva para compatibilidad; el flujo nuevo usa Storage + buffer.
 */
export async function extractTextFromFile(
  filePath: string,
  fileType: string,
): Promise<string> {
  const buffer = await readFile(filePath);
  return extractTextFromBuffer(buffer, fileType);
}
