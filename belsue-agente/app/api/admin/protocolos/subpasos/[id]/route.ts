import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { protocolErrorResponse, requireProtocolActor } from "@/lib/protocols";

export const runtime = "nodejs";

const patchSchema = z.object({ completed: z.boolean() });

/**
 * PATCH /api/admin/protocolos/subpasos/{id} — marca o desmarca una compañía
 * de la tarea de accesos. Con todas marcadas la tarea se marca sola; si se
 * desmarca una, vuelve a pendiente. Todo queda en el historial.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { error } = await supabase.rpc("protocol_toggle_substep", {
      p_substep_id: params.id,
      p_completed: parsed.data.completed,
      p_user_id: auth.actor.id,
      p_user_name: auth.actor.name,
    });
    if (error) return protocolErrorResponse(error, "Error al marcar la compañía");

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
