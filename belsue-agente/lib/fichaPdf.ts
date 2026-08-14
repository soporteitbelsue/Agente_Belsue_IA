/**
 * Genera el PDF de una respuesta del agente (típicamente una ficha de recogida
 * de datos ya rellena) para poder subirlo al tarificador o adjuntarlo.
 *
 * `jspdf` se carga solo al pulsar el botón, no al abrir el chat: pesa lo suyo
 * y la mayoría de las conversaciones no acaban en descarga.
 */

const MARGIN = 18; // mm
const LINE = 5.6; // alto de línea en mm
const BELSUE: [number, number, number] = [138, 12, 60]; // #8a0c3c

interface Block {
  text: string;
  size: number;
  bold: boolean;
  /** Espacio extra por encima, en mm. */
  spaceBefore: number;
  bullet: boolean;
}

/**
 * Traduce el markdown que escribe el agente a bloques con formato. No es un
 * intérprete completo: cubre lo que aparece en una ficha (títulos, viñetas,
 * campos en negrita) y descarta el resto de marcas para que no salgan los
 * asteriscos impresos.
 */
function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];

  for (const raw of markdown.split("\n")) {
    const line = raw.trim();

    if (!line) {
      blocks.push({ text: "", size: 10, bold: false, spaceBefore: 0, bullet: false });
      continue;
    }

    // Títulos: #, ## o ###
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      blocks.push({
        text: clean(heading[2]!),
        size: level === 1 ? 14 : level === 2 ? 12 : 11,
        bold: true,
        spaceBefore: blocks.length === 0 ? 0 : 3,
        bullet: false,
      });
      continue;
    }

    // Separador horizontal: no aporta nada en el PDF.
    if (/^[-*_]{3,}$/.test(line)) continue;

    // Viñetas: -, * o "1."
    const bullet = line.match(/^([-*]|\d+\.)\s+(.*)$/);
    if (bullet) {
      blocks.push({
        text: clean(bullet[2]!),
        size: 10,
        bold: false,
        spaceBefore: 0,
        bullet: true,
      });
      continue;
    }

    blocks.push({
      text: clean(line),
      size: 10,
      // Una línea entera en negrita suele ser el encabezado de un bloque.
      bold: /^\*\*[^*]+\*\*:?$/.test(line),
      spaceBefore: 0,
      bullet: false,
    });
  }

  return blocks;
}

/** Quita las marcas de markdown que jsPDF no sabe representar. */
function clean(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();
}

/**
 * Título del documento: el primer encabezado del mensaje y, si no lo hay, su
 * primera línea. Sirve también de nombre de archivo.
 */
export function guessTitle(content: string): string {
  const heading = content.match(/^#{1,3}\s+(.+)$/m)?.[1];
  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  const title = clean(heading ?? firstLine ?? "").slice(0, 80);
  return title || "Ficha de datos";
}

/** Nombre de archivo admisible en Windows, sin acentos ni signos raros. */
function safeFilename(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
  return `${base || "ficha"}.pdf`;
}

export async function downloadAsPdf({
  content,
  title,
  author,
}: {
  /** Texto de la respuesta, tal cual lo escribió el agente. */
  content: string;
  /** Encabezado del documento y base del nombre de archivo. */
  title: string;
  /** Quién lo genera, para la línea de pie del encabezado. */
  author?: string;
}): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  /** Salta de página cuando lo que viene no cabe. */
  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - MARGIN) return;
    doc.addPage();
    y = MARGIN;
  };

  // --- Encabezado ---
  doc.setFillColor(...BELSUE);
  doc.rect(0, 0, pageWidth, 3, "F");

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...BELSUE);
  for (const line of doc.splitTextToSize(title, usableWidth) as string[]) {
    doc.text(line, MARGIN, y);
    y += 7;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(130);
  const fecha = new Date().toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  doc.text(
    [`Belsué · ${fecha}`, author ? `Preparado por ${author}` : ""]
      .filter(Boolean)
      .join("   ·   "),
    MARGIN,
    y,
  );
  y += 4;

  doc.setDrawColor(225);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 6;

  // --- Cuerpo ---
  doc.setTextColor(40);
  for (const block of parseBlocks(content)) {
    if (!block.text) {
      y += LINE * 0.5;
      continue;
    }

    y += block.spaceBefore;
    doc.setFont("helvetica", block.bold ? "bold" : "normal");
    doc.setFontSize(block.size);

    const indent = block.bullet ? 5 : 0;
    const lines = doc.splitTextToSize(
      block.text,
      usableWidth - indent,
    ) as string[];

    lines.forEach((line, i) => {
      ensureSpace(LINE);
      if (block.bullet && i === 0) {
        doc.text("•", MARGIN, y);
      }
      doc.text(line, MARGIN + indent, y);
      y += LINE;
    });
  }

  doc.save(safeFilename(title));
}
