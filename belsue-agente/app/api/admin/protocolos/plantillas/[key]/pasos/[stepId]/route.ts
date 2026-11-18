import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  TEMPLATE_STEP_FIELDS,
  protocolErrorResponse,
  requireProtocolActor,
} from "@/lib/protocols";
import { buildTemplateStepRow, templateStepSchema } from "@/lib/protocolTemplateSteps";

export const runtime = "nodejs";

type Params = { params: { key: string; stepId: string } };

/**
 * PATCH /api/admin/protocolos/plantillas/{key}/pasos/{stepId} — edita una
 * tarea de la plantilla. Solo afecta a las fichas que se creen después.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const parsed = templateStepSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();
    const row = await buildTemplateStepRow(supabase, params.key, parsed.data);
    if ("response" in row) return row.response;

    const { data, error } = await supabase
      .from("protocol_template_steps")
      .update(row.values)
      .eq("id", params.stepId)
      .eq("template_key", params.key)
      .select(TEMPLATE_STEP_FIELDS)
      .maybeSingle();
    if (error) return protocolErrorResponse(error, "Error al editar la tarea");
    if (!data) {
      return NextResponse.json({ error: "Tarea no encontrada." }, { status: 404 });
    }

    console.info(
      `[protocolos] Plantilla ${params.key}: tarea ${params.stepId} editada por ${auth.actor.name}.`,
    );
    return NextResponse.json({ step: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/protocolos/plantillas/{key}/pasos/{stepId} — quita la
 * tarea de la plantilla. Las fichas ya creadas la conservan (tienen su copia).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("protocol_template_steps")
      .delete()
      .eq("id", params.stepId)
      .eq("template_key", params.key)
      .select("id")
      .maybeSingle();
    if (error) return protocolErrorResponse(error, "Error al quitar la tarea");
    if (!data) {
      return NextResponse.json({ error: "Tarea no encontrada." }, { status: 404 });
    }

    console.info(
      `[protocolos] Plantilla ${params.key}: tarea ${params.stepId} quitada por ${auth.actor.name}.`,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
