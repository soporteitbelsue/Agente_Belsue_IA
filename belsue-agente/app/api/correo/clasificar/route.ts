import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { mailboxConfigured } from "@/lib/mailbox";
import { sortInbox } from "@/lib/mailSorter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reubica los correos nuevos de la bandeja de entrada en sus carpetas.
 *
 * Lo llama el cron del servidor cada pocos minutos
 * (deploy/ionos/clasificar-correo.sh), no una persona: se autentica con
 * `Authorization: Bearer <MAIL_SORT_SECRET>`, no con sesión. Sin
 * MAIL_SORT_SECRET en el entorno el endpoint está apagado.
 *
 * `?simular=1` clasifica sin mover ni etiquetar nada, para probar.
 */
const SECRET = process.env.MAIL_SORT_SECRET ?? "";

function authorized(req: NextRequest): boolean {
  if (!SECRET) return false;
  const given = Buffer.from(
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""),
  );
  const expected = Buffer.from(SECRET);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!mailboxConfigured()) {
    return NextResponse.json(
      { error: "No hay buzón configurado (IMAP_USER / IMAP_PASSWORD)." },
      { status: 503 },
    );
  }

  const params = req.nextUrl.searchParams;
  const simular = params.get("simular") === "1";
  const dias = Number(params.get("dias")) || undefined;

  try {
    const result = await sortInbox({ simular, dias });
    for (const c of result.correos) {
      console.log(
        `[correo] ${c.destino ? `→ ${c.destino}` : "se queda"} | ${c.categoria}/${c.confianza} | ${c.asunto} | ${c.error ?? c.motivo}`,
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[correo] Error al clasificar la bandeja de entrada:", err);
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
