import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { parseScopes } from "@/lib/scopes";

export const runtime = "nodejs";

interface Row {
  id: string;
  name: string;
  file_type: string;
  scopes: string[] | null;
  created_by: string | null;
  created_at: string;
  document_chunks: { count: number }[] | null;
}

/**
 * GET /api/admin/revision — repaso del estado del conocimiento. Busca las tres
 * cosas que estropean las respuestas sin que nadie se dé cuenta:
 *
 *  - Documentos sin indexar: se subieron pero el agente no los ve.
 *  - Nombres repetidos: el mismo material subido dos veces, que gasta plazas
 *    de la búsqueda con lo mismo.
 *  - Material sin autor: no se sabe a quién preguntar si algo está desfasado.
 */
export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("documents")
      .select(
        "id, name, file_type, scopes, created_by, created_at, document_chunks(count)",
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[revision] Error al listar:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as Row[];
    const items = rows.map((d) => ({
      id: d.id,
      name: d.name,
      file_type: d.file_type,
      scopes: parseScopes(d.scopes),
      created_at: d.created_at,
      hasAuthor: !!d.created_by,
      chunks: d.document_chunks?.[0]?.count ?? 0,
    }));

    // Un nombre repetido no siempre es un error (puede haber dos versiones),
    // así que se listan para que los mire una persona, no se borra nada.
    const byName = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.name.trim().toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), item]);
    }

    return NextResponse.json({
      sinIndexar: items.filter((i) => i.chunks === 0),
      duplicados: [...byName.values()]
        .filter((group) => group.length > 1)
        .map((group) => ({ name: group[0]!.name, items: group })),
      sinAutor: items.filter((i) => !i.hasAuthor),
      total: items.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
