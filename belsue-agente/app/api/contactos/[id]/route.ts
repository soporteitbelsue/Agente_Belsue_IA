import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/conversations";
import { reindexarCompanias } from "@/lib/contacts";
import { parseScope } from "@/lib/scopes";
import type { Contact } from "@/types";

export const runtime = "nodejs";

const opcional = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const cambiosSchema = z.object({
  company: z.string().trim().min(1, "La compañía es obligatoria.").max(200).optional(),
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
  notes: z.string().trim().max(2000).nullable().optional().transform((v) => (v && v.length > 0 ? v : null)),
});

/** Lee el contacto o devuelve la respuesta de error correspondiente. */
async function cargar(id: string) {
  const { data, error } = await supabaseServer()
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!data) {
    return { error: NextResponse.json({ error: "Contacto no encontrado." }, { status: 404 }) };
  }
  return { contacto: data as Contact };
}

/**
 * PATCH /api/contactos/{id} — corrige un contacto.
 *
 * Puede hacerlo cualquier usuario autenticado; se registra quién fue el
 * último en tocarlo por si hay que rastrear un dato mal puesto.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const previo = await cargar(params.id);
  if (previo.error) return previo.error;

  let cambios: z.infer<typeof cambiosSchema>;
  try {
    const parsed = cambiosSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }
    cambios = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { data, error } = await supabaseServer()
    .from("contacts")
    .update({ ...cambios, updated_by: userId })
    .eq("id", params.id)
    .select("*")
    .single();

  if (error || !data) {
    console.error("[contactos] Error al editar:", error);
    return NextResponse.json(
      { error: error?.message ?? "No se pudo guardar el contacto." },
      { status: 500 },
    );
  }

  const actualizado = data as Contact;
  const scope = parseScope(actualizado.scope);

  // Si el contacto cambia de compañía hay que reindexar las dos: la que lo
  // gana y la que lo pierde, que si no se queda con el dato de más.
  try {
    await reindexarCompanias(
      [previo.contacto!.company, actualizado.company],
      scope,
    );
  } catch (err) {
    console.error("[contactos] Error al reindexar:", err);
    return NextResponse.json({
      contact: actualizado,
      warning:
        "El cambio se guardó, pero el agente sigue con el dato anterior: falló el reindexado.",
    });
  }

  return NextResponse.json({ contact: actualizado });
}

/** DELETE /api/contactos/{id} — quita un contacto de la agenda. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const previo = await cargar(params.id);
  if (previo.error) return previo.error;
  const contacto = previo.contacto!;

  const { error } = await supabaseServer()
    .from("contacts")
    .delete()
    .eq("id", params.id);

  if (error) {
    console.error("[contactos] Error al borrar:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await reindexarCompanias([contacto.company], parseScope(contacto.scope));
  } catch (err) {
    console.error("[contactos] Error al reindexar:", err);
    return NextResponse.json({
      success: true,
      warning:
        "El contacto se borró, pero el agente todavía puede citarlo: falló el reindexado.",
    });
  }

  return NextResponse.json({ success: true });
}
