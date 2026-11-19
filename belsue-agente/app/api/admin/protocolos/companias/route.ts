import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  COMPANY_FIELDS,
  protocolErrorResponse,
  requireProtocolActor,
} from "@/lib/protocols";
import { companySchema, duplicateCompany } from "@/lib/protocolCompanies";

export const runtime = "nodejs";

/** GET /api/admin/protocolos/companias — la lista, por orden alfabético. */
export async function GET() {
  const auth = await requireProtocolActor();
  if (auth.response) return auth.response;

  try {
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("protocol_companies")
      .select(COMPANY_FIELDS)
      .order("name", { ascending: true });
    if (error) return protocolErrorResponse(error, "Error al listar compañías");
    return NextResponse.json({ companies: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/admin/protocolos/companias — da de alta una compañía. */
export async function POST(req: NextRequest) {
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
      .insert({ ...parsed.data, notes: parsed.data.notes || null })
      .select(COMPANY_FIELDS)
      .single();
    if (error) {
      return duplicateCompany(error.code) ?? protocolErrorResponse(error, "Error al crear la compañía");
    }

    return NextResponse.json({ company: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
