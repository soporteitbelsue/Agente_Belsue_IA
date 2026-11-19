import { NextResponse } from "next/server";
import { z } from "zod";

/** Validación de una compañía (alta y edición). Solo para el servidor. */
export const companySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  access_type: z.enum(["general", "particular"], {
    errorMap: () => ({ message: "Elige si el acceso es general o particular." }),
  }),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/** Nombre repetido (índice único sin mayúsculas ni espacios) → 409. */
export function duplicateCompany(code: string | undefined): NextResponse | null {
  return code === "23505"
    ? NextResponse.json({ error: "Esa compañía ya está en la lista." }, { status: 409 })
    : null;
}
