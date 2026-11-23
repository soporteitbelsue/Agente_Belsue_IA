import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  TEMPLATE_STEP_FIELDS,
  protocolErrorResponse,
  requireProtocolActor,
} from "@/lib/protocols";
import { saveTemplateSchema } from "@/lib/protocolTemplateSteps";

export const runtime = "nodejs";

/**
 * GET /api/admin/protocolos/plantillas/{key}: la plantilla con sus tareas y
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

/**
 * PUT /api/admin/protocolos/plantillas/{key}: { steps } con la plantilla
 * entera en su orden final. Se graba todo o nada (las tareas que no vengan
 * se quitan). Solo afecta a las fichas que se creen después.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { key: string } },
) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const parsed = saveTemplateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();
    const { error } = await supabase.rpc("protocol_save_template_steps", {
      p_template_key: params.key,
      p_steps: parsed.data.steps,
    });
    if (error) return protocolErrorResponse(error, "Error al guardar la plantilla");

    console.info(
      `[protocolos] Plantilla ${params.key} guardada por ${auth.actor.name} ` +
        `(${parsed.data.steps.length} tareas).`,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
