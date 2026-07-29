// Envío de correos de aviso vía Resend (API HTTP, sin dependencias).
// Si RESEND_API_KEY no está configurada, se omite silenciosamente (no rompe
// el flujo de la app).

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? "soporteit@belsue.es";
const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Asistente Belsué <onboarding@resend.dev>";

/**
 * Envía un correo de aviso a la dirección interna (best-effort).
 * Nunca lanza: registra el error y sigue.
 */
export async function sendNotification(
  subject: string,
  html: string,
): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY no configurada; aviso omitido.");
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [NOTIFY_EMAIL],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[email] Resend respondió ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error("[email] Error al enviar el aviso:", err);
  }
}

/** Escapa texto para incrustarlo en HTML sin romper el formato. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
