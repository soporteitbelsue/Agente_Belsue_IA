import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { protocolErrorResponse, requireProtocolActor } from "@/lib/protocols";

export const runtime = "nodejs";

/**
 * POST /api/admin/protocolos/pasos/{id}/companias — añade a la tarea las
 * compañías de la lista que aún no tenga (fichas creadas antes de dar de
 * alta una compañía). Devuelve cuántas ha añadido.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase.rpc("protocol_sync_substeps", {
      p_step_id: params.id,
      p_user_id: auth.actor.id,
      p_user_name: auth.actor.name,
      p_log: true,
    });
    if (error) return protocolErrorResponse(error, "Error al cargar las compañías");

    return NextResponse.json({ added: (data as number) ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
