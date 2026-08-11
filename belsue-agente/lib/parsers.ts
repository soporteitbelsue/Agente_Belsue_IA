import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
import { unzipSync } from "fflate";
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
 * Extrae el texto de un PDF usando `unpdf` (que trae una versión moderna de
 * pdf.js). Reemplaza a `pdf-parse`, cuyo pdf.js de 2018 fallaba en algunos
 * PDFs con "Invalid number: ... (charCode N)".
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  // unpdf reutiliza el buffer internamente; copiamos a un Uint8Array propio.
  const pdf = await getDocumentProxy(new Uint8Array(buffer));

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const { items } = await page.getTextContent();
    pages.push(itemsToText(items));
  }
  return pages.join("\n");
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

/**
 * Extrae el texto plano de un buffer en memoria (PDF, DOCX, PPTX o TXT).
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: string,
): Promise<string> {
  const type = fileType.toLowerCase() as FileType;

  switch (type) {
    case "pdf": {
      return cleanText(await extractPdfText(buffer));
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
    default:
      throw new Error(`Tipo de archivo no soportado: ${fileType}`);
  }
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
