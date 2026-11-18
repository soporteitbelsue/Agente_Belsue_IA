import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { PostgrestError } from "@supabase/supabase-js";
import { authOptions } from "@/lib/authOptions";

/**
 * Utilidades de servidor de la pestaña Protocolos (migración 018).
 *
 * Todas las escrituras pasan por funciones SQL que reciben quién hace el
 * cambio, para dejarlo en el historial. Ese "quién" sale siempre de la sesión,
 * nunca de lo que mande el navegador.
 */

export interface ProtocolActor {
  id: string;
  name: string;
}

/**
 * Como `requireAdmin`, pero devuelve además el usuario que actúa.
 * Acceso: cualquiera que entre al panel de administración (rol admin).
 */
export async function requireProtocolActor(): Promise<
  { actor: ProtocolActor; response?: never } | { actor?: never; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      response: NextResponse.json({ error: "No autenticado." }, { status: 401 }),
    };
  }
  if (session.user.role !== "admin") {
    return {
      response: NextResponse.json(
        { error: "Acceso restringido a administración." },
        { status: 403 },
      ),
    };
  }
  return {
    actor: {
      id: session.user.id,
      name: session.user.name ?? session.user.email ?? "Desconocido",
    },
  };
}

/**
 * Traduce un error de Supabase a respuesta. Los `RAISE EXCEPTION` de las
 * funciones SQL (código P0001) traen un mensaje pensado para el usuario
 * ("El departamento es obligatorio…"), así que van tal cual como 400.
 */
export function protocolErrorResponse(
  error: PostgrestError,
  context: string,
): NextResponse {
  if (error.code === "P0001") {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(`[protocolos] ${context}:`, error);
  return NextResponse.json({ error: error.message }, { status: 500 });
}

export const RECORD_SUMMARY_FIELDS =
  "id, template_key, person_name, start_date, department_key, department_name, status, completed_at, archived_at, created_by_name, created_at, total_steps, done_steps";

export const RECORD_STEP_FIELDS =
  "id, position, text, help, allows_notes, role_key, completed, completed_by_name, completed_at, notes, is_extra";

export const TEMPLATE_STEP_FIELDS =
  "id, position, text, help, default_role, condition, allows_notes";

export const LOG_FIELDS =
  "id, step_id, action, user_name, old_value, new_value, created_at";
