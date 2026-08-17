import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { supabaseServer } from "@/lib/supabase";
import { authOptions } from "@/lib/authOptions";
import { parseScope, parseScopes } from "@/lib/scopes";

export const runtime = "nodejs";

/** Tipos con archivo, frente a las notas, que son texto escrito a mano. */
const FILE_TYPES = ["pdf", "docx", "txt", "pptx"];

interface Row {
  id: string;
  name: string;
  description: string | null;
  content: string | null;
  company: string | null;
  category: string | null;
  scopes: string[] | null;
  file_type: string;
  file_size: number;
  file_path: string | null;
  created_by: string | null;
  created_at: string;
  users: { name: string } | null;
}

function isStoragePath(p: string | null): boolean {
  return !!p && !p.includes("/") && !p.includes("\\");
}

/**
 * GET /api/documents/browse — todo el conocimiento del portal en un único
 * listado: notas y documentos juntos, que es como se consulta.
 *
 * Query params: `scope` (portal), `category` y `type` ('nota' | 'documento').
 *
 * Cada elemento indica si quien consulta puede editarlo o borrarlo. Lo decide
 * el servidor, que es quien lo va a exigir después; el navegador solo pinta.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const isAdmin = session.user.role === "admin";

  try {
    const supabase = supabaseServer();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const type = searchParams.get("type");
    const scope = parseScope(searchParams.get("scope"));

    let query = supabase
      .from("documents")
      .select(
        "id, name, description, content, company, category, scopes, file_type, file_size, file_path, created_by, created_at, users(name)",
      )
      .contains("scopes", [scope])
      .order("created_at", { ascending: false });

    if (type === "nota") query = query.eq("file_type", "nota");
    else if (type === "documento") query = query.in("file_type", FILE_TYPES);
    else query = query.in("file_type", [...FILE_TYPES, "nota"]);

    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) {
      console.error("[browse] Error al listar:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = ((data ?? []) as unknown as Row[]).map((d) => {
      const isNote = d.file_type === "nota";
      const isAuthor = !!d.created_by && d.created_by === userId;
      return {
        id: d.id,
        name: d.name,
        description: d.description,
        // Solo las notas llevan su texto: de un PDF no se muestra el contenido.
        content: isNote ? d.content : null,
        company: d.company,
        category: d.category,
        scopes: parseScopes(d.scopes),
        file_type: d.file_type,
        file_size: d.file_size,
        created_at: d.created_at,
        author: d.users?.name ?? null,
        downloadable: !isNote && isStoragePath(d.file_path),
        // Las notas las mantiene todo el equipo; los documentos, administración.
        can_edit: isNote || isAdmin,
        can_delete: isNote ? isAdmin || isAuthor : isAdmin,
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
