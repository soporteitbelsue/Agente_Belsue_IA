import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { protocolErrorResponse, requireProtocolActor } from "@/lib/protocols";
import type { KeyName, ProtocolTemplate } from "@/types";

export const runtime = "nodejs";

/**
 * GET /api/admin/protocolos — tipos de protocolo (tarjetas) con cuántas fichas
 * hay en curso, más las listas configurables (departamentos y responsables).
 */
export async function GET() {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const supabase = supabaseServer();

    const [tpl, depts, roles] = await Promise.all([
      supabase
        .from("protocol_templates")
        .select("key, name, description, asks_department, date_label")
        .order("position", { ascending: true }),
      supabase
        .from("departments")
        .select("key, name")
        .order("position", { ascending: true }),
      supabase
        .from("protocol_roles")
        .select("key, name")
        .order("position", { ascending: true }),
    ]);

    if (tpl.error) return protocolErrorResponse(tpl.error, "Error al listar plantillas");
    if (depts.error) return protocolErrorResponse(depts.error, "Error al listar departamentos");
    if (roles.error) return protocolErrorResponse(roles.error, "Error al listar responsables");

    // Contadores con count exacto y no trayendo filas: las consultas vienen
    // paginadas y con el tiempo se contaría de menos.
    const templates: ProtocolTemplate[] = await Promise.all(
      (tpl.data ?? []).map(async (t) => {
        const { count } = await supabase
          .from("protocol_records")
          .select("id", { count: "exact", head: true })
          .eq("template_key", t.key)
          .eq("status", "en_curso")
          .is("archived_at", null);
        return { ...(t as Omit<ProtocolTemplate, "in_progress">), in_progress: count ?? 0 };
      }),
    );

    return NextResponse.json({
      templates,
      departments: (depts.data ?? []) as KeyName[],
      roles: (roles.data ?? []) as KeyName[],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
