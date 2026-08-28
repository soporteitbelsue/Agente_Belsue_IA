import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/conversations";
import { reindexarCompania } from "@/lib/contacts";
import { AGENT_SCOPES, parseScope } from "@/lib/scopes";
import type { Contact } from "@/types";

export const runtime = "nodejs";

/** Texto opcional: la cadena vacía del formulario se guarda como NULL. */
const opcional = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const contactoSchema = z.object({
  company: z.string().trim().min(1, "La compañía es obligatoria.").max(200),
  department: opcional,
  phone: opcional,
  phone2: opcional,
  mobile: opcional,
  fax: opcional,
  email: opcional.refine(
    (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "El correo no tiene un formato válido.",
  ),
  address: opcional,
  city: opcional,
  postal_code: opcional,
  province: opcional,
  notes: z.string().trim().max(2000).optional().transform((v) => (v && v.length > 0 ? v : null)),
  scope: z.enum(AGENT_SCOPES).optional().default("procedimientos"),
});

/**
 * GET /api/contactos — agenda completa del ámbito.
 *
 * Se devuelve entera y se filtra en el navegador: son unos cientos de filas,
 * y así el buscador responde al teclear sin ir al servidor.
 */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const scope = parseScope(new URL(req.url).searchParams.get("scope"));

  const { data, error } = await supabaseServer()
    .from("contacts")
    .select("*")
    .eq("scope", scope)
    .order("company", { ascending: true })
    .order("department", { ascending: true, nullsFirst: true });

  if (error) {
    console.error("[contactos] Error al listar:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contacts: (data ?? []) as Contact[] });
}

/**
 * POST /api/contactos — añade un contacto.
 *
 * Abierto a cualquier usuario autenticado: la agenda la mantiene todo el
 * equipo, igual que las notas de conocimiento. Se guarda quién lo creó.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let body: z.infer<typeof contactoSchema>;
  try {
    const parsed = contactoSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { scope, ...campos } = body;

  const { data, error } = await supabaseServer()
    .from("contacts")
    .insert({ ...campos, scope, created_by: userId, updated_by: userId })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[contactos] Error al crear:", error);
    return NextResponse.json(
      { error: error?.message ?? "No se pudo crear el contacto." },
      { status: 500 },
    );
  }

  // El contacto ya está guardado: si el reindexado falla, se avisa pero no se
  // deshace el alta. Perder el dato sería peor que tener al agente un rato
  // desactualizado, y siempre se puede reindexar volviendo a guardar.
  try {
    await reindexarCompania(campos.company, scope);
  } catch (err) {
    console.error("[contactos] Error al reindexar:", err);
    return NextResponse.json(
      {
        contact: data as Contact,
        warning:
          "El contacto se guardó, pero el agente aún no lo conoce: falló el reindexado.",
      },
      { status: 201 },
    );
  }

  return NextResponse.json({ contact: data as Contact }, { status: 201 });
}
