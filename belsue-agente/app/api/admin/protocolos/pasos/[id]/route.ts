import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { protocolErrorResponse, requireProtocolActor } from "@/lib/protocols";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    completed: z.boolean().optional(),
    role_key: z.string().trim().min(1).optional(),
    notes: z.string().max(2000, "Las observaciones son demasiado largas.").nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "No hay cambios que guardar.",
  });

/**
 * PATCH /api/admin/protocolos/pasos/{id} — marca/desmarca, cambia el
 * responsable o las observaciones de un paso. Cada cambio queda en el
 * historial y el estado de la ficha se recalcula en la misma transacción.
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
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }
    const { completed, role_key, notes } = parsed.data;

    const supabase = supabaseServer();
    const { error } = await supabase.rpc("protocol_update_step", {
      p_step_id: params.id,
      p_completed: completed ?? null,
      p_role_key: role_key ?? null,
      p_set_notes: notes !== undefined,
      p_notes: notes ?? null,
      p_user_id: auth.actor.id,
      p_user_name: auth.actor.name,
    });
    if (error) return protocolErrorResponse(error, "Error al actualizar el paso");

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
