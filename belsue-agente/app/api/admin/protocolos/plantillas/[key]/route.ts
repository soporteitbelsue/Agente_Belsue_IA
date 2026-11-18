import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import {
  TEMPLATE_STEP_FIELDS,
  protocolErrorResponse,
  requireProtocolActor,
} from "@/lib/protocols";
import { buildTemplateStepRow, templateStepSchema } from "@/lib/protocolTemplateSteps";

export const runtime = "nodejs";

const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

/**
 * GET /api/admin/protocolos/plantillas/{key} — la plantilla con sus tareas y
 * las listas para editarla (responsables y departamentos).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { key: string } },
) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const supabase = supabaseServer();
    const [tpl, steps, roles, depts] = await Promise.all([
      supabase
        .from("protocol_templates")
        .select("key, name, description, asks_department")
        .eq("key", params.key)
        .maybeSingle(),
      supabase
        .from("protocol_template_steps")
        .select(TEMPLATE_STEP_FIELDS)
        .eq("template_key", params.key)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.from("protocol_roles").select("key, name").order("position"),
      supabase.from("departments").select("key, name").order("position"),
    ]);

    if (tpl.error) return protocolErrorResponse(tpl.error, "Error al leer la plantilla");
    if (!tpl.data) {
      return NextResponse.json({ error: "Plantilla no encontrada." }, { status: 404 });
    }
    if (steps.error) return protocolErrorResponse(steps.error, "Error al leer las tareas");
    if (roles.error) return protocolErrorResponse(roles.error, "Error al leer responsables");
    if (depts.error) return protocolErrorResponse(depts.error, "Error al leer departamentos");

    return NextResponse.json({
      template: tpl.data,
      steps: steps.data ?? [],
      roles: roles.data ?? [],
      departments: depts.data ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/admin/protocolos/plantillas/{key} — añade una tarea al final. */
export async function POST(
  req: NextRequest,
  { params }: { params: { key: string } },
) {
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

    const { data: last } = await supabase
      .from("protocol_template_steps")
      .select("position")
      .eq("template_key", params.key)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("protocol_template_steps")
      .insert({
        ...row.values,
        template_key: params.key,
        position: ((last?.position as number | undefined) ?? 0) + 1,
      })
      .select(TEMPLATE_STEP_FIELDS)
      .single();
    if (error) return protocolErrorResponse(error, "Error al añadir la tarea");

    return NextResponse.json({ step: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT /api/admin/protocolos/plantillas/{key} — { ids } en el orden nuevo. */
export async function PUT(
  req: NextRequest,
  { params }: { params: { key: string } },
) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const parsed = reorderSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Orden inválido." }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { error } = await supabase.rpc("protocol_reorder_template_steps", {
      p_template_key: params.key,
      p_ids: parsed.data.ids,
    });
    if (error) return protocolErrorResponse(error, "Error al reordenar");

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
