import { Fragment, type ReactNode } from "react";

/** Renderiza fragmentos inline: **negrita**, *cursiva* y `código`. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Divide capturando `código`, **negrita** y *cursiva*. El código va primero
  // para que un asterisco dentro de él no se tome por formato.
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = text.split(regex).filter(Boolean);

  parts.forEach((part, i) => {
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      // Sin las comillas invertidas: texto normal sobre un gris muy sutil.
      nodes.push(
        <code
          key={i}
          className="rounded-[5px] bg-ios-fill px-1 py-px font-[inherit] text-[0.95em]"
        >
          {part.slice(1, -1)}
        </code>,
      );
    } else if (part.startsWith("**") && part.endsWith("**")) {
      nodes.push(<strong key={i}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("*") && part.endsWith("*")) {
      nodes.push(<em key={i}>{part.slice(1, -1)}</em>);
    } else {
      nodes.push(<Fragment key={i}>{part}</Fragment>);
    }
  });

  return nodes;
}

/* ------------------------------------------------------------------
   Citas (líneas que empiezan por ">").

   El agente cita los correos así, sin un formato fijo. Si la cita trae
   cabeceras reconocibles (De, Asunto, Fecha, Adjuntos…), se pinta como la
   tarjeta de un correo; si no, como una tarjeta gris con el texto. El
   contenido de la respuesta no cambia: solo cómo se ve.
   ------------------------------------------------------------------ */

type MailField = "from" | "to" | "date" | "subject" | "attachments";

const FIELD_NAMES: Record<string, MailField> = {
  de: "from",
  remitente: "from",
  from: "from",
  para: "to",
  to: "to",
  fecha: "date",
  hora: "date",
  date: "date",
  enviado: "date",
  asunto: "subject",
  subject: "subject",
  adjunto: "attachments",
  adjuntos: "attachments",
  attachments: "attachments",
};

/** "**De:** Ana <ana@x.es>" → ["from", "Ana <ana@x.es>"]; si no es cabecera, null. */
function parseField(line: string): [MailField, string] | null {
  const plain = line.replace(/\*\*/g, "").trim();
  const m = /^([a-záéíóú]+)\s*:\s*(.+)$/i.exec(plain);
  if (!m) return null;
  const field = FIELD_NAMES[m[1]!.toLowerCase()];
  return field ? [field, m[2]!.trim()] : null;
}

/** "Nombre <correo>" → { name, address }. */
function parseSender(raw: string): { name: string; address: string } {
  const angle = /^(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  if (angle) {
    const name = angle[1]!.replace(/^["']|["']$/g, "").trim();
    return { name: name || angle[2]!, address: name ? angle[2]! : "" };
  }
  if (/^\S+@\S+$/.test(raw)) return { name: raw, address: "" };
  return { name: raw, address: "" };
}

/** Iniciales del remitente, saltando conectores en minúscula ("de", "la"…). */
function initialsOf(name: string): string {
  const words = name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter((w) => w && w[0] !== w[0]!.toLowerCase());
  const pick = words.length ? words : name.split(/\s+/);
  return pick
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** De la fecha, la hora si la trae (más compacto en la tarjeta). */
function shortTime(raw: string): string {
  return /\b\d{1,2}:\d{2}\b/.exec(raw)?.[0] ?? raw;
}

function MailIcon({ d }: { d: string }) {
  return (
    <svg className="h-[15px] w-[15px] text-ios-secondary" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const ATTACHMENT_ICON =
  "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z";

function Quote({ lines }: { lines: string[] }) {
  const fields: Partial<Record<MailField, string>> = {};
  const body: string[] = [];
  let inHeader = true;

  for (const line of lines) {
    const field = parseField(line);
    // Las cabeceras van al principio; "Adjuntos" puede venir también al final.
    if (field && (inHeader || field[0] === "attachments") && !fields[field[0]]) {
      fields[field[0]] = field[1];
      continue;
    }
    if (line.trim() !== "") inHeader = false;
    if (!inHeader) body.push(line);
  }

  const isMail = !!(fields.from || fields.subject);
  if (!isMail) {
    return (
      <div className="my-2 rounded-card bg-ios-bg px-3.5 py-3 text-ios-body">
        <Markdown content={lines.join("\n")} />
      </div>
    );
  }

  const sender = fields.from ? parseSender(fields.from) : null;
  const attachments = (fields.attachments ?? "")
    .split(/\s*[,;·]\s*|\s+y\s+/)
    .map((a) => a.trim())
    .filter(Boolean);

  return (
    <div className="my-2 rounded-card bg-ios-bg px-3.5 py-3">
      {sender && (
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ios-fill-hover text-[13px] font-semibold text-ios-label"
          >
            {initialsOf(sender.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-snug text-ios-label">
              {sender.name}
            </p>
            {sender.address && (
              <p className="truncate text-[13px] leading-snug text-ios-secondary">
                {sender.address}
              </p>
            )}
          </div>
          {fields.date && (
            <span className="shrink-0 text-[13px] text-ios-secondary" title={fields.date}>
              {shortTime(fields.date)}
            </span>
          )}
        </div>
      )}
      {fields.to && (
        <p className="mt-1 truncate text-[13px] text-ios-secondary">Para: {fields.to}</p>
      )}
      {fields.subject && (
        <p className="mt-2.5 text-base font-semibold leading-snug text-ios-label">
          {fields.subject}
        </p>
      )}
      {body.some((l) => l.trim()) && (
        <div className="mt-1 text-ios-body">
          <Markdown content={body.join("\n")} />
        </div>
      )}
      {attachments.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <span
              key={a}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ios-surface px-3 text-[13px] text-ios-label shadow-ios"
            >
              <MailIcon d={ATTACHMENT_ICON} />
              {a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Renderizador de markdown muy básico: negrita, cursiva, código en línea,
 * listas (con `-` o `*`), citas (`>`) y saltos de línea / párrafos.
 */
export default function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];

  let listItems: string[] = [];
  let quoteLines: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = [...listItems];
    blocks.push(
      <ul key={`ul-${key++}`} className="my-1 list-disc space-y-0.5 pl-5">
        {items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    blocks.push(<Quote key={`q-${key++}`} lines={quoteLines} />);
    quoteLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const quoteMatch = /^\s*>\s?(.*)$/.exec(line);

    if (quoteMatch) {
      flushList();
      quoteLines.push(quoteMatch[1] ?? "");
      continue;
    }

    flushQuote();

    const listMatch = /^\s*[-*]\s+(.*)$/.exec(line);

    if (listMatch) {
      listItems.push(listMatch[1] ?? "");
      continue;
    }

    flushList();

    if (line.trim() === "") {
      continue;
    }

    blocks.push(
      <p key={`p-${key++}`} className="my-1">
        {renderInline(line)}
      </p>,
    );
  }

  flushList();
  flushQuote();

  return <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{blocks}</div>;
}
