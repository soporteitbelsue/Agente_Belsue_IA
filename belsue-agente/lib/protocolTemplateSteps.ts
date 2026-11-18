import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Validación compartida de una tarea de plantilla (alta y edición).
 * Solo para el servidor.
 */
export const templateStepSchema = z.object({
  text: z.string().trim().min(1, "El texto de la tarea es obligatorio.").max(500),
  help: z.string().trim().max(1000).nullable().optional(),
  default_role: z.string().trim().min(1, "Elige el responsable por defecto."),
  allows_notes: z.boolean().default(true),
  /** Vacío o ausente = la tarea sale para todos los departamentos. */
  departments: z.array(z.string()).optional(),
});

export type TemplateStepInput = z.infer<typeof templateStepSchema>;

/**
 * Comprueba responsable y departamentos contra sus tablas y devuelve la fila
 * lista para grabar. La condición solo tiene sentido en plantillas que piden
 * departamento; en el resto se guarda siempre vacía.
 */
export async function buildTemplateStepRow(
  supabase: SupabaseClient,
  templateKey: string,
  input: TemplateStepInput,
): Promise<
  | {
      values: {
        text: string;
        help: string | null;
        default_role: string;
        allows_notes: boolean;
        condition: { departments: string[] } | null;
      };
    }
  | { response: NextResponse }
> {
  const bad = (error: string, status = 400) => ({
    response: NextResponse.json({ error }, { status }),
  });

  const { data: tpl } = await supabase
    .from("protocol_templates")
    .select("asks_department")
    .eq("key", templateKey)
    .maybeSingle();
  if (!tpl) return bad("Plantilla no encontrada.", 404);

  const { data: role } = await supabase
    .from("protocol_roles")
    .select("key")
    .eq("key", input.default_role)
    .maybeSingle();
  if (!role) return bad("Responsable desconocido.");

  let condition: { departments: string[] } | null = null;
  const wanted = Array.from(new Set(input.departments ?? []));
  if (tpl.asks_department && wanted.length > 0) {
    const { data: depts } = await supabase
      .from("departments")
      .select("key")
      .in("key", wanted);
    if ((depts ?? []).length !== wanted.length) return bad("Departamento desconocido.");
    condition = { departments: wanted };
  }

  return {
    values: {
      text: input.text,
      help: input.help?.trim() || null,
      default_role: input.default_role,
      allows_notes: input.allows_notes,
      condition,
    },
  };
}
