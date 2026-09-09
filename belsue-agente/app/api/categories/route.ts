import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { supabaseServer } from "@/lib/supabase";
import { authOptions } from "@/lib/authOptions";
import { requireAdmin } from "@/lib/auth";
import { AGENT_SCOPES } from "@/lib/scopes";
import { CATEGORY_FIELDS, groupByScope } from "@/lib/categoriesServer";
import {
  DEFAULT_CATEGORY_COLOR,
  RESERVED_CATEGORY_VALUES,
  isCategoryColor,
  slugifyCategory,
  type Category,
} from "@/lib/categories";

export const runtime = "nodejs";

const createSchema = z.object({
  scope: z.enum(AGENT_SCOPES),
  label: z.string().trim().min(1, "El nombre es obligatorio."),
  color: z.string().optional(),
});

const orderSchema = z.object({
  scope: z.enum(AGENT_SCOPES),
  ids: z.array(z.string().uuid()).min(1),
});

/**
 * GET /api/categories — las categorías de los dos portales.
 *
 * Las lee cualquiera con sesión: sin ellas no se puede ni catalogar una nota
 * ni entender un listado. Con `?usage=1` (solo administración) vienen además
 * cuántos documentos usa cada una, que es lo que decide si se puede borrar.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("categories")
      .select(CATEGORY_FIELDS)
      .order("scope", { ascending: true })
      .order("position", { ascending: true });

    if (error) {
      console.error("[categories] Error al listar:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const categories = groupByScope((data ?? []) as Category[]);

    const wantsUsage =
      new URL(req.url).searchParams.get("usage") === "1" &&
      session.user.role === "admin";
    if (!wantsUsage) return NextResponse.json({ categories });

    const { data: usageRows, error: usageError } = await supabase
      .from("category_usage")
      .select("value, total");
    if (usageError) {
      // El recuento es un extra: sin él el panel se ve igual, solo que sin el
      // "3 documentos" al lado. No merece tumbar la petición entera.
      console.error("[categories] Error al contar el uso:", usageError);
      return NextResponse.json({ categories, usage: {} });
    }

    const usage = Object.fromEntries(
      (usageRows ?? []).map((r) => [r.value as string, r.total as number]),
    );
    return NextResponse.json({ categories, usage });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/categories — crea una categoría en un portal. */
export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }
    const { scope, label } = parsed.data;
    const color = isCategoryColor(parsed.data.color)
      ? parsed.data.color
      : DEFAULT_CATEGORY_COLOR;

    // El valor interno sale del nombre: quien lo crea escribe "Furgonetas" y
    // no tiene por qué saber que por dentro se guarda `furgonetas`.
    const value = slugifyCategory(label);
    if (!value) {
      return NextResponse.json(
        { error: "Ese nombre no da un valor válido: usa letras o números." },
        { status: 400 },
      );
    }
    if (RESERVED_CATEGORY_VALUES.includes(value)) {
      return NextResponse.json(
        { error: `"${label}" está reservada por la aplicación.` },
        { status: 409 },
      );
    }

    const supabase = supabaseServer();

    const { data: existing } = await supabase
      .from("categories")
      .select("label")
      .eq("scope", scope)
      .eq("value", value)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: `Ya existe una categoría equivalente ("${existing.label}").` },
        { status: 409 },
      );
    }

    // Al final de la lista del portal, que es donde se espera lo recién creado.
    const { data: last } = await supabase
      .from("categories")
      .select("position")
      .eq("scope", scope)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("categories")
      .insert({
        scope,
        value,
        label,
        color,
        position: (last?.position ?? -1) + 1,
      })
      .select(CATEGORY_FIELDS)
      .single();

    if (error) {
      console.error("[categories] Error al crear:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ category: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/categories — reordena un portal entero.
 *
 * Se manda la lista completa de ids en el orden que debe quedar, en vez de
 * "sube esta una posición": así el resultado no depende de cuántas veces se
 * pulse ni de que dos pestañas abiertas vayan a distinto ritmo.
 */
export async function PATCH(req: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const parsed = orderSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }
    const { scope, ids } = parsed.data;
    const supabase = supabaseServer();

    // Se actualiza filtrando también por portal: un id de otro portal no puede
    // colarse y llevarse por delante el orden del vecino.
    const results = await Promise.all(
      ids.map((id, position) =>
        supabase
          .from("categories")
          .update({ position })
          .eq("id", id)
          .eq("scope", scope),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      console.error("[categories] Error al reordenar:", failed.error);
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
