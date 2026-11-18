import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { protocolErrorResponse, requireProtocolActor } from "@/lib/protocols";

export const runtime = "nodejs";

const addSchema = z.object({
  text: z.string().trim().min(1, "El texto de la tarea es obligatorio.").max(500),
  role_key: z.string().trim().min(1, "Elige el responsable."),
});

/**
 * POST /api/admin/protocolos/fichas/{id}/pasos — añade una tarea extra solo
 * a esta ficha (al final). Queda en el historial y, si la ficha estaba
 * completada, vuelve a estar en curso.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const parsed = addSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();
    const { data, error } = await supabase.rpc("protocol_add_step", {
      p_record_id: params.id,
      p_text: parsed.data.text,
      p_role_key: parsed.data.role_key,
      p_user_id: auth.actor.id,
      p_user_name: auth.actor.name,
    });
    if (error) return protocolErrorResponse(error, "Error al añadir la tarea");

    return NextResponse.json({ id: data as string }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
