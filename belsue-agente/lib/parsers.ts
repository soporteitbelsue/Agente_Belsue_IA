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
 * Extrae el texto plano de un archivo soportado (PDF, DOCX o TXT).
 */
export async function extractTextFromFile(
  filePath: string,
  fileType: string,
): Promise<string> {
  const type = fileType.toLowerCase() as FileType;

  switch (type) {
    case "pdf": {
      // Import dinámico: pdf-parse ejecuta código al cargarse.
      const pdfParse = (await import("pdf-parse")).default;
      const buffer = await readFile(filePath);
      const data = await pdfParse(buffer);
      return cleanText(data.text);
    }
    case "docx": {
      const buffer = await readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return cleanText(result.value);
    }
    case "txt": {
      const text = await readFile(filePath, "utf-8");
      return cleanText(text);
    }
    default:
      throw new Error(`Tipo de archivo no soportado: ${fileType}`);
  }
}
