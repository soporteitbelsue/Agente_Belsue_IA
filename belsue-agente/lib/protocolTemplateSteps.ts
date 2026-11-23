import { z } from "zod";

/**
 * Validación de la plantilla que manda el editor al pulsar "Guardar cambios".
 * Solo para el servidor. Lo que no se puede comprobar aquí (que existan el
 * responsable y los departamentos) lo comprueba la función SQL
 * protocol_save_template_steps, que además lo graba todo o nada.
 */
export const templateStepSchema = z.object({
  /** null = tarea nueva. */
  id: z.string().uuid().nullable(),
  text: z.string().trim().min(1, "Hay una tarea sin texto.").max(500),
  help: z.string().trim().max(1000).nullable().optional(),
  default_role: z.string().trim().min(1, "Hay una tarea sin responsable."),
  allows_notes: z.boolean().default(true),
  /** Vacío = la tarea sale para todos los departamentos. */
  departments: z.array(z.string()).default([]),
  /** 'companias' = la tarea lleva un check por compañía. */
  subitems: z.enum(["companias"]).nullable().optional(),
});

export const saveTemplateSchema = z.object({
  steps: z.array(templateStepSchema).max(200),
});
