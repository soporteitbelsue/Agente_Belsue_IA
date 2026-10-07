import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";

/**
 * Lectura del buzón de correo por IMAP, para que el agente pueda buscar y
 * resumir correos desde el chat.
 *
 * Es SOLO LECTURA a propósito: la carpeta se abre en modo EXAMINE (readOnly),
 * así que ni siquiera se marcan los correos como leídos. No hay forma de
 * enviar, mover ni borrar desde aquí.
 *
 * De momento hay un único buzón, configurado por variables de entorno, y solo
 * lo puede consultar su dueño (MAILBOX_OWNER_EMAIL): el resto de usuarios del
 * agente no ven la herramienta.
 */

const IMAP_HOST = process.env.IMAP_HOST ?? "imap.ionos.es";
const IMAP_PORT = Number(process.env.IMAP_PORT ?? 993);
const IMAP_USER = process.env.IMAP_USER ?? "";
const IMAP_PASSWORD = process.env.IMAP_PASSWORD ?? "";
const MAILBOX_OWNER_EMAIL = (
  process.env.MAILBOX_OWNER_EMAIL ?? IMAP_USER
).toLowerCase().trim();

/** Tope de correos que se devuelven al modelo en una búsqueda. */
const MAX_RESULTS = 25;
/** Caracteres del cuerpo de cada correo que se pasan al modelo. */
const BODY_CHARS = 1500;
/** Correos de más de este tamaño no se descargan enteros (adjuntos grandes). */
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

/** true si el usuario con ese email puede consultar el buzón configurado. */
export function mailboxAvailableFor(email: string | null | undefined): boolean {
  if (!IMAP_USER || !IMAP_PASSWORD || !MAILBOX_OWNER_EMAIL) return false;
  return (email ?? "").toLowerCase().trim() === MAILBOX_OWNER_EMAIL;
}

export interface EmailSummary {
  fecha: string;
  de: string;
  para: string;
  asunto: string;
  carpeta: string;
  adjuntos: string[];
  texto: string;
}

export interface SearchEmailsInput {
  /** Palabras a buscar en asunto, remitente o cuerpo. */
  texto?: string;
  /** Solo correos de los últimos N días. */
  dias?: number;
  /** Carpeta IMAP; por defecto la bandeja de entrada. */
  carpeta?: string;
  limite?: number;
}

/** Busca correos en el buzón y devuelve los más recientes primero. */
export async function searchEmails(
  input: SearchEmailsInput,
): Promise<EmailSummary[]> {
  const carpeta = input.carpeta?.trim() || "INBOX";
  const limite = Math.min(Math.max(input.limite ?? 15, 1), MAX_RESULTS);

  const query: SearchObject = {};
  const texto = input.texto?.trim();
  if (texto) {
    query.or = [{ subject: texto }, { from: texto }, { body: texto }];
  }
  if (input.dias && input.dias > 0) {
    query.since = new Date(Date.now() - input.dias * 24 * 60 * 60 * 1000);
  }
  if (!query.or && !query.since) query.all = true;

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASSWORD },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock(carpeta, { readOnly: true });
    try {
      const uids = (await client.search(query, { uid: true })) || [];
      // Los UID crecen con la llegada: los últimos son los más recientes.
      const recent = uids.slice(-limite);
      if (recent.length === 0) return [];

      const results: EmailSummary[] = [];
      for await (const msg of client.fetch(
        recent,
        { envelope: true, size: true, source: { maxLength: MAX_SOURCE_BYTES } },
        { uid: true },
      )) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const body = (parsed.text ?? "").replace(/\n{3,}/g, "\n\n").trim();
        // Una cabecera Date mal formada no debe tumbar toda la búsqueda.
        const date = new Date(parsed.date ?? msg.envelope?.date ?? "");
        results.push({
          fecha: isNaN(date.getTime()) ? "" : date.toISOString(),
          de: parsed.from?.text ?? "",
          para: Array.isArray(parsed.to)
            ? parsed.to.map((a) => a.text).join(", ")
            : (parsed.to?.text ?? ""),
          asunto: parsed.subject ?? "(sin asunto)",
          carpeta,
          adjuntos: parsed.attachments.map((a) => a.filename ?? "adjunto"),
          texto:
            body.length > BODY_CHARS ? `${body.slice(0, BODY_CHARS)}…` : body,
        });
      }
      return results.sort((a, b) => b.fecha.localeCompare(a.fecha));
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Lista las carpetas del buzón (para buscar fuera de la bandeja de entrada). */
export async function listMailFolders(): Promise<string[]> {
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASSWORD },
    logger: false,
  });
  await client.connect();
  try {
    const folders = await client.list();
    return folders.map((f) => f.path);
  } finally {
    await client.logout().catch(() => client.close());
  }
}
