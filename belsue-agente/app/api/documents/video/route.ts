import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/conversations";
import { processAndStoreText } from "@/lib/embeddings";
import { parseVideoUrl } from "@/lib/video";
import { AGENT_SCOPES, DEFAULT_SCOPE, parseScopes, primaryScope } from "@/lib/scopes";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(1, "El título es obligatorio."),
  url: z.string().trim().min(1, "Falta el enlace del vídeo."),
  /**
   * De un vídeo no se puede extraer texto, así que la descripción es lo único
   * que el agente va a saber de él. Por eso se exige y con cierto cuerpo.
   */
  description: z
    .string()
    .trim()
    .min(20, "Describe de qué va el vídeo: es lo único que el agente podrá leer."),
  category: z.string().trim().optional(),
  company: z.string().trim().optional(),
  scopes: z.array(z.enum(AGENT_SCOPES)).nonempty().optional(),
  scope: z.enum(AGENT_SCOPES).optional().default(DEFAULT_SCOPE),
});

/**
 * POST /api/documents/video — registra un vídeo alojado fuera (YouTube o
 * Vimeo) como un documento más.
 *
 * El archivo no se sube: en `file_path` va la URL. Se indexa la descripción,
 * que es lo único legible, para que el agente sepa que el vídeo existe y pueda
 * remitir a él aunque no conozca su contenido.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const video = parseVideoUrl(body.url);
  if (!video) {
    return NextResponse.json(
      { error: "No reconozco ese enlace. Pega la dirección de un vídeo de YouTube o Vimeo." },
      { status: 400 },
    );
  }

  const scopes = parseScopes(body.scopes ?? [body.scope]);
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("documents")
    .insert({
      name: body.name,
      description: body.description,
      // La URL de ver, no la de incrustar: la de incrustar se deduce de ella y
      // así el enlace guardado sigue sirviendo si cambia la forma de mostrarlo.
      file_path: video.watchUrl,
      file_type: "video",
      file_size: 0,
      category: body.category ?? "general",
      company: body.company ?? null,
      scopes,
      scope: primaryScope(scopes),
      content: body.description,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[video] Error al registrar el vídeo:", error);
    return NextResponse.json(
      { error: error?.message ?? "No se pudo registrar el vídeo." },
      { status: 500 },
    );
  }

  const documentId = data.id as string;

  // Se indexa la descripción. Si falla, se retira: un vídeo sin indexar sería
  // invisible para el agente y nadie se enteraría.
  try {
    await processAndStoreText(documentId, body.description);
  } catch (err) {
    console.error(`[video] Error al indexar ${documentId}:`, err);
    await supabase.from("documents").delete().eq("id", documentId);
    return NextResponse.json(
      { error: "No se pudo indexar la descripción del vídeo." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, documentId }, { status: 201 });
}
