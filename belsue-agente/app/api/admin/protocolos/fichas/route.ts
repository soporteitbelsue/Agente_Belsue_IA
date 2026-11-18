import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import {
  RECORD_SUMMARY_FIELDS,
  protocolErrorResponse,
  requireProtocolActor,
} from "@/lib/protocols";

export const runtime = "nodejs";

const FILTERS = ["en_curso", "completada", "archivadas", "todas"] as const;

const createSchema = z.object({
  template_key: z.string().trim().min(1),
  person_name: z.string().trim().min(1, "El nombre es obligatorio."),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha no es válida."),
  department_key: z.string().trim().optional().nullable(),
});

/**
 * GET /api/admin/protocolos/fichas?tipo=empleado&estado=en_curso
 *
 * `estado`: en_curso | completada | todas (sin archivadas) | archivadas.
 */
export async function GET(req: NextRequest) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  const params = new URL(req.url).searchParams;
  const tipo = params.get("tipo");
  const estadoParam = params.get("estado") ?? "todas";
  const estado = (FILTERS as readonly string[]).includes(estadoParam)
    ? estadoParam
    : "todas";

  if (!tipo) {
    return NextResponse.json({ error: "Falta el tipo de protocolo." }, { status: 400 });
  }

  try {
    const supabase = supabaseServer();
    let query = supabase
      .from("protocol_record_summary")
      .select(RECORD_SUMMARY_FIELDS)
      .eq("template_key", tipo)
      .order("start_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (estado === "archivadas") {
      query = query.not("archived_at", "is", null);
    } else {
      query = query.is("archived_at", null);
      if (estado !== "todas") query = query.eq("status", estado);
    }

    const { data, error } = await query;
    if (error) return protocolErrorResponse(error, "Error al listar fichas");

    return NextResponse.json({ records: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/admin/protocolos/fichas — crea la ficha con su checklist. */
export async function POST(req: NextRequest) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }
    const { template_key, person_name, start_date, department_key } = parsed.data;

    const supabase = supabaseServer();
    const { data, error } = await supabase.rpc("protocol_create_record", {
      p_template_key: template_key,
      p_person_name: person_name,
      p_start_date: start_date,
      p_department_key: department_key || null,
      p_user_id: auth.actor.id,
      p_user_name: auth.actor.name,
    });
    if (error) return protocolErrorResponse(error, "Error al crear la ficha");

    return NextResponse.json({ id: data as string }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
