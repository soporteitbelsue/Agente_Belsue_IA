import { supabaseServer } from "@/lib/supabase";
import { scopeConfig, type AgentScope } from "@/lib/scopes";

/**
 * Catálogo del portal: la lista de TODO lo que hay, solo con los nombres.
 *
 * La búsqueda por similitud trae ocho fragmentos, así que el agente nunca ve
 * más de ocho documentos y responde de buena fe que solo hay dos condicionados
 * de hogar cuando hay nueve. Preguntar "qué tenemos de X" no es una pregunta
 * de contenido, es de inventario, y ninguna búsqueda semántica la resuelve.
 *
 * Con el catálogo delante puede enumerar lo que existe. El contenido lo sigue
 * conociendo solo por los fragmentos: el prompt insiste en esa diferencia.
 */

interface Row {
  name: string;
  company: string | null;
  category: string | null;
  file_type: string;
}

export async function buildCatalogue(scope: AgentScope): Promise<string> {
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("documents")
    .select("name, company, category, file_type")
    .contains("scopes", [scope])
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[catalogue] Error al listar:", error);
    return "";
  }

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return "";

  // Agrupado por categoría, que es como se pregunta ("¿qué hay de hogar?").
  const etiquetas = new Map(
    scopeConfig(scope).categories.map((c) => [c.value, c.label]),
  );
  const porCategoria = new Map<string, string[]>();

  for (const row of rows) {
    const clave = row.category ?? "sin categoría";
    const compania = row.company ? ` (${row.company})` : "";
    const tipo = row.file_type === "nota" ? " [nota]" : "";
    porCategoria.set(clave, [
      ...(porCategoria.get(clave) ?? []),
      `${row.name}${compania}${tipo}`,
    ]);
  }

  const lineas: string[] = [];
  for (const [clave, nombres] of porCategoria) {
    lineas.push(`${etiquetas.get(clave) ?? clave}: ${nombres.join(" · ")}`);
  }

  return lineas.join("\n");
}
