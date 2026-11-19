import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  COMPANY_FIELDS,
  protocolErrorResponse,
  requireProtocolActor,
} from "@/lib/protocols";
import { companySchema, duplicateCompany } from "@/lib/protocolCompanies";

export const runtime = "nodejs";

type Params = { params: { id: string } };

/**
 * PATCH /api/admin/protocolos/companias/{id} — cambia nombre, tipo o notas.
 * Las fichas ya creadas conservan lo que tenían (son copias).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const parsed = companySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 },
      );
    }

    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("protocol_companies")
      .update({ ...parsed.data, notes: parsed.data.notes || null })
      .eq("id", params.id)
      .select(COMPANY_FIELDS)
      .maybeSingle();
    if (error) {
      return duplicateCompany(error.code) ?? protocolErrorResponse(error, "Error al editar la compañía");
    }
    if (!data) {
      return NextResponse.json({ error: "Compañía no encontrada." }, { status: 404 });
    }
    return NextResponse.json({ company: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/protocolos/companias/{id} — la quita de la lista. Deja de
 * salir en las fichas nuevas; las ya creadas la conservan.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("protocol_companies")
      .delete()
      .eq("id", params.id)
      .select("id")
      .maybeSingle();
    if (error) return protocolErrorResponse(error, "Error al quitar la compañía");
    if (!data) {
      return NextResponse.json({ error: "Compañía no encontrada." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
