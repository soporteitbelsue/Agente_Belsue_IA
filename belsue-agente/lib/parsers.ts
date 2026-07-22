import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
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
 * Render personalizado para pdf-parse. Muchos PDFs no incluyen espacios
 * explícitos entre palabras; reconstruimos los espacios y los saltos de
 * línea a partir de la posición (coordenadas) de cada fragmento de texto.
 */
// eslint-disable-next-line
function renderPageWithSpaces(pageData: any): Promise<string> {
  return pageData
    .getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false })
    // eslint-disable-next-line
    .then((textContent: any) => {
      let text = "";
      let lastX: number | null = null;
      let lastY: number | null = null;
      let lastWidth = 0;

      // eslint-disable-next-line
      for (const item of textContent.items as any[]) {
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
    });
}

/**
 * Extrae el texto plano de un buffer en memoria (PDF, DOCX o TXT).
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: string,
): Promise<string> {
  const type = fileType.toLowerCase() as FileType;

  switch (type) {
    case "pdf": {
      // Import dinámico: pdf-parse ejecuta código al cargarse.
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer, { pagerender: renderPageWithSpaces });
      return cleanText(data.text);
    }
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return cleanText(result.value);
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
