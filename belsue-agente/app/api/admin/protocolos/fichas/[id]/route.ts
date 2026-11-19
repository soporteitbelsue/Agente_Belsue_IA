import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import {
  LOG_FIELDS,
  RECORD_STEP_FIELDS,
  RECORD_SUMMARY_FIELDS,
  SUBSTEP_FIELDS,
  protocolErrorResponse,
  requireProtocolActor,
} from "@/lib/protocols";

export const runtime = "nodejs";

const patchSchema = z.object({ archived: z.boolean() });

/** GET /api/admin/protocolos/fichas/{id} — ficha, pasos, historial y listas. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const supabase = supabaseServer();

    const { data: record, error: recError } = await supabase
      .from("protocol_record_summary")
      .select(RECORD_SUMMARY_FIELDS)
      .eq("id", params.id)
      .maybeSingle();
    if (recError) return protocolErrorResponse(recError, "Error al leer la ficha");
    if (!record) {
      return NextResponse.json({ error: "Ficha no encontrada." }, { status: 404 });
    }

    const [tpl, steps, log, roles] = await Promise.all([
      supabase
        .from("protocol_templates")
        .select("key, name, asks_department, date_label")
        .eq("key", record.template_key)
        .maybeSingle(),
      supabase
        .from("protocol_record_steps")
        .select(RECORD_STEP_FIELDS)
        .eq("record_id", params.id)
        .order("position", { ascending: true }),
      supabase
        .from("protocol_record_log")
        .select(LOG_FIELDS)
        .eq("record_id", params.id)
        .order("seq", { ascending: false }),
      supabase
        .from("protocol_roles")
        .select("key, name")
        .order("position", { ascending: true }),
    ]);

    if (tpl.error) return protocolErrorResponse(tpl.error, "Error al leer la plantilla");
    if (steps.error) return protocolErrorResponse(steps.error, "Error al leer los pasos");
    if (log.error) return protocolErrorResponse(log.error, "Error al leer el historial");
    if (roles.error) return protocolErrorResponse(roles.error, "Error al leer responsables");

    // Checks de compañías de las tareas que los llevan.
    const listSteps = (steps.data ?? [])
      .filter((s) => s.subitems === "companias")
      .map((s) => s.id as string);
    let substeps: unknown[] = [];
    if (listSteps.length > 0) {
      const { data: subs, error: subError } = await supabase
        .from("protocol_record_substeps")
        .select(SUBSTEP_FIELDS)
        .in("step_id", listSteps)
        .order("position", { ascending: true });
      if (subError) return protocolErrorResponse(subError, "Error al leer las compañías");
      substeps = subs ?? [];
    }

    return NextResponse.json({
      record,
      template: tpl.data,
      steps: steps.data ?? [],
      substeps,
      log: log.data ?? [],
      roles: roles.data ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/admin/protocolos/fichas/{id} — { archived: true|false }. */
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
    const { error } = await supabase.rpc("protocol_set_archived", {
      p_record_id: params.id,
      p_archived: parsed.data.archived,
      p_user_id: auth.actor.id,
      p_user_name: auth.actor.name,
    });
    if (error) return protocolErrorResponse(error, "Error al archivar");

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/protocolos/fichas/{id} — borra la ficha con su checklist
 * y su historial. Pensado para fichas creadas por error; para quitarla de la
 * vista sin perder nada está archivar.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase.rpc("protocol_delete_record", {
      p_record_id: params.id,
    });
    if (error) return protocolErrorResponse(error, "Error al borrar la ficha");
    if (!data) {
      return NextResponse.json({ error: "Ficha no encontrada." }, { status: 404 });
    }

    console.info(
      `[protocolos] Ficha ${params.id} borrada por ${auth.actor.name} (${auth.actor.id}).`,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
