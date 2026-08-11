import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/conversations";
import { processAndStoreText } from "@/lib/embeddings";
import { sendNotification, escapeHtml } from "@/lib/email";
import {
  AGENT_SCOPES,
  DEFAULT_SCOPE,
  parseScope,
  parseScopes,
  primaryScope,
  scopeConfig,
} from "@/lib/scopes";

export const runtime = "nodejs";

const bodySchema = z.object({
  name: z.string().trim().min(1, "El título es obligatorio."),
  content: z
    .string()
    .trim()
    .min(10, "El texto de la nota es demasiado corto."),
  description: z.string().trim().optional(),
  company: z.string().trim().optional(),
  category: z.string().trim().optional(),
  /** Portales en los que se usará la nota (al menos uno). */
  scopes: z.array(z.enum(AGENT_SCOPES)).nonempty().optional(),
  /** Compatibilidad: un único portal. */
  scope: z.enum(AGENT_SCOPES).optional().default(DEFAULT_SCOPE),
});

interface NoteRow {
  id: string;
  name: string;
  content: string | null;
  company: string | null;
  category: string | null;
  scopes: string[] | null;
  created_at: string;
  users: { name: string } | null;
}

/**
 * GET /api/documents/note — lista las notas de conocimiento con su autor.
 * Abierto a cualquier usuario autenticado: todo el equipo puede consultar el
 * conocimiento aportado.
 */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  try {
    const supabase = supabaseServer();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const scope = parseScope(searchParams.get("scope"));

    let query = supabase
      .from("documents")
      .select(
        "id, name, content, company, category, scopes, created_at, users(name)",
      )
      .eq("file_type", "nota")
      .contains("scopes", [scope])
      .order("created_at", { ascending: false });

    if (category) query = query.eq("category", category);

    const { data, error } = await query;

    if (error) {
      console.error("[note] Error al listar notas:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const notes = ((data ?? []) as unknown as NoteRow[]).map((n) => ({
      id: n.id,
      name: n.name,
      content: n.content,
      company: n.company,
      category: n.category,
      scopes: parseScopes(n.scopes),
      created_at: n.created_at,
      author: n.users?.name ?? null,
    }));

    return NextResponse.json({ notes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/documents/note — crea una "nota de conocimiento": texto libre
 * (sin archivo) que se indexa igual que un documento para que el agente lo use.
 *
 * Abierto a cualquier usuario autenticado (asesor o admin): alimentar la base
 * de conocimiento es trabajo de todo el equipo. Se registra el autor.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "No autenticado." },
      { status: 401 },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    const result = bodySchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error.issues[0]?.message ?? "Petición inválida." },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json(
      { success: false, error: "JSON inválido." },
      { status: 400 },
    );
  }

  const { name, content, description, company, category } = parsed;
  const scopes = parseScopes(parsed.scopes ?? [parsed.scope]);

  const supabase = supabaseServer();

  // 1. Registrar la nota como documento de tipo 'nota' (sin archivo físico).
  const { data, error } = await supabase
    .from("documents")
    .insert({
      name,
      description: description ?? null,
      file_path: null,
      file_type: "nota",
      file_size: Buffer.byteLength(content, "utf8"),
      category: category ?? null,
      company: company ?? null,
      scopes,
      // `scope` se mantiene con el portal principal por compatibilidad.
      scope: primaryScope(scopes),
      content,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[note] Error al insertar la nota:", error);
    return NextResponse.json(
      { success: false, error: error?.message ?? "No se pudo registrar la nota." },
      { status: 500 },
    );
  }

  const documentId = data.id as string;

  // 2. Indexar el texto (trocear + embeddings). Si falla, borrar la nota
  //    para no dejar un documento sin fragmentos.
  try {
    await processAndStoreText(documentId, content);
  } catch (procErr) {
    console.error(`[note] Error al indexar la nota ${documentId}:`, procErr);
    await supabase.from("documents").delete().eq("id", documentId);
    const message =
      procErr instanceof Error ? procErr.message : "Error al indexar la nota.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  // 3. Avisar por correo de la nueva nota (best-effort, no bloquea la respuesta).
  const { data: author } = await supabase
    .from("users")
    .select("name, email")
    .eq("id", userId)
    .maybeSingle();
  const config = scopeConfig(primaryScope(scopes));
  const portales = scopes.map((s) => scopeConfig(s).title).join(" y ");
  await sendNotification(
    `🟢 Nueva nota en ${portales}`,
    `<p><b>${escapeHtml(author?.name ?? "Un usuario")}</b> (${escapeHtml(
      author?.email ?? "",
    )}) ha añadido una nota en <b>${escapeHtml(portales)}</b>:</p>
     <p><b>Título:</b> ${escapeHtml(name)}${
       company
         ? ` · <b>${escapeHtml(config.secondaryField.label)}:</b> ${escapeHtml(
             company,
           )}`
         : ""
     }${category ? ` · <b>Categoría:</b> ${escapeHtml(category)}` : ""}</p>
     <blockquote style="border-left:3px solid #8a0c3c;padding-left:12px;color:#333">${escapeHtml(
       content.slice(0, 600),
     )}</blockquote>`,
  );

  return NextResponse.json(
    {
      success: true,
      documentId,
      message: "Nota guardada e indexada correctamente.",
    },
    { status: 201 },
  );
}
