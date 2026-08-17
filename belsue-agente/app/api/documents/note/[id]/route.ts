import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { supabaseServer } from "@/lib/supabase";
import { authOptions } from "@/lib/authOptions";
import { getSessionUserId } from "@/lib/conversations";
import { processAndStoreText } from "@/lib/embeddings";
import { AGENT_SCOPES, parseScopes, primaryScope } from "@/lib/scopes";

export const runtime = "nodejs";

const NOTE_FIELDS =
  "id, name, content, company, category, scopes, created_at, file_type";

/**
 * GET /api/documents/note/{id} — devuelve una nota concreta (para editarla).
 * Cualquier usuario autenticado (el conocimiento es colaborativo).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("documents")
    .select(NOTE_FIELDS)
    .eq("id", params.id)
    .eq("file_type", "nota")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Nota no encontrada." }, { status: 404 });
  }
  return NextResponse.json({ note: data });
}

const updateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    content: z.string().trim().min(10).optional(),
    company: z.string().trim().nullable().optional(),
    category: z.string().trim().optional(),
    scopes: z.array(z.enum(AGENT_SCOPES)).nonempty().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "No hay cambios que guardar.",
  });

/**
 * PATCH /api/documents/note/{id} — actualiza una nota. Si cambia el texto,
 * se vuelve a indexar (regenera los embeddings). Cualquier usuario autenticado
 * puede editar (el conocimiento lo mantiene todo el equipo).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let body: z.infer<typeof updateSchema>;
  try {
    const json = await req.json();
    const parsed = updateSchema.safeParse(json);
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

  const supabase = supabaseServer();

  // Actualiza los campos de la nota.
  const updateFields: Record<string, unknown> = {};
  if (body.name !== undefined) updateFields.name = body.name;
  if (body.content !== undefined) {
    updateFields.content = body.content;
    updateFields.file_size = Buffer.byteLength(body.content, "utf8");
  }
  if (body.company !== undefined) updateFields.company = body.company || null;
  if (body.category !== undefined) updateFields.category = body.category;
  // Permite recolocar una nota guardada en el portal equivocado, o ponerla
  // en los dos.
  if (body.scopes !== undefined) {
    const scopes = parseScopes(body.scopes);
    updateFields.scopes = scopes;
    updateFields.scope = primaryScope(scopes);
  }

  const { data, error } = await supabase
    .from("documents")
    .update(updateFields)
    .eq("id", params.id)
    .eq("file_type", "nota")
    .select("id, content")
    .maybeSingle();

  if (error) {
    console.error("[note] Error al actualizar la nota:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Nota no encontrada." }, { status: 404 });
  }

  // Reindexar SIEMPRE: la cabecera (título/compañía/categoría/descripción) va
  // fusionada con el contenido, así que cualquier cambio de metadatos también
  // debe regenerar los embeddings. Las notas son cortas, es barato.
  try {
    await processAndStoreText(params.id, (data.content as string) ?? "");
  } catch (procErr) {
    console.error(`[note] Error al re-indexar la nota ${params.id}:`, procErr);
    const message =
      procErr instanceof Error ? procErr.message : "Error al re-indexar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/documents/note/{id} — borra una nota de conocimiento.
 *
 * Puede borrarla quien la escribió (deshacer lo propio) y cualquier
 * administrador. Editar sigue abierto a todo el equipo, pero borrar el aporte
 * de otro no: eso destruye trabajo ajeno sin dejar rastro.
 *
 * Los fragmentos indexados caen en cascada. Las notas no tienen archivo, así
 * que no hay nada que limpiar en Storage.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const supabase = supabaseServer();

  const { data: note, error: findError } = await supabase
    .from("documents")
    .select("id, created_by")
    .eq("id", params.id)
    .eq("file_type", "nota")
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!note) {
    return NextResponse.json({ error: "Nota no encontrada." }, { status: 404 });
  }

  const isAdmin = session.user.role === "admin";
  if (!isAdmin && note.created_by !== userId) {
    return NextResponse.json(
      { error: "Solo puedes borrar las notas que has escrito tú." },
      { status: 403 },
    );
  }

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", params.id)
    .eq("file_type", "nota");

  if (error) {
    console.error("[note] Error al borrar la nota:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
