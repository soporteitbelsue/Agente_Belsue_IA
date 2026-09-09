import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { CATEGORY_FIELDS } from "@/lib/categoriesServer";
import {
  RESERVED_CATEGORY_VALUES,
  isCategoryColor,
} from "@/lib/categories";

export const runtime = "nodejs";

const patchSchema = z.object({
  label: z.string().trim().min(1, "El nombre no puede quedar vacío.").optional(),
  color: z.string().optional(),
});

/** Cuántos documentos y notas llevan puesta esta categoría. */
async function countUses(value: string): Promise<number> {
  const { count } = await supabaseServer()
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("category", value);
  return count ?? 0;
}

/**
 * PATCH /api/categories/[id] — renombra o cambia el color.
 *
 * El valor interno NO se toca: es lo que está grabado en cada documento. Se
 * cambia cómo se lee, no lo que hay guardado.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }

    const update: { label?: string; color?: string } = {};
    if (parsed.data.label !== undefined) update.label = parsed.data.label;
    if (parsed.data.color !== undefined) {
      if (!isCategoryColor(parsed.data.color)) {
        return NextResponse.json(
          { error: "Ese color no está en la paleta." },
          { status: 400 },
        );
      }
      update.color = parsed.data.color;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nada que cambiar." }, { status: 400 });
    }

    const { data, error } = await supabaseServer()
      .from("categories")
      .update(update)
      .eq("id", params.id)
      .select(CATEGORY_FIELDS)
      .maybeSingle();

    if (error) {
      console.error("[categories] Error al actualizar:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Esa categoría ya no existe." },
        { status: 404 },
      );
    }
    return NextResponse.json({ category: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/categories/[id] — borra una categoría vacía.
 *
 * Con documentos dentro no se borra. Podría dejarse borrar (nada se rompe: la
 * ficha seguiría mostrando su valor crudo), pero el resultado sería una
 * etiqueta huérfana que nadie sabe de dónde salió y que ya no se puede volver
 * a elegir. Mejor obligar a vaciarla antes.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const supabase = supabaseServer();
    const { data: category, error: readError } = await supabase
      .from("categories")
      .select("value, label")
      .eq("id", params.id)
      .maybeSingle();

    if (readError) {
      console.error("[categories] Error al leer:", readError);
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    if (!category) {
      return NextResponse.json(
        { error: "Esa categoría ya no existe." },
        { status: 404 },
      );
    }

    if (RESERVED_CATEGORY_VALUES.includes(category.value as string)) {
      return NextResponse.json(
        {
          error: `"${category.label}" la usa la aplicación por dentro y no se puede borrar.`,
        },
        { status: 409 },
      );
    }

    const uses = await countUses(category.value as string);
    if (uses > 0) {
      return NextResponse.json(
        {
          error: `No se puede borrar: hay ${uses} ${
            uses === 1 ? "documento" : "documentos"
          } con esta categoría. Cámbiales la categoría primero.`,
        },
        { status: 409 },
      );
    }

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", params.id);
    if (error) {
      console.error("[categories] Error al borrar:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
