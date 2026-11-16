import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  clearQuestions,
  generateQuestions,
  listQuestions,
  runEvaluation,
} from "@/lib/evaluation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/eval — la batería de preguntas actual. */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const questions = await listQuestions();
    return NextResponse.json({
      preguntas: questions.map((q) => ({
        id: q.id,
        question: q.question,
        esperado: q.documents?.name ?? q.expected_document_id,
        origen: q.origen,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const bodySchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("generar"),
    cantidad: z.number().int().min(1).max(100).default(30),
  }),
  z.object({ accion: z.literal("evaluar") }),
  z.object({ accion: z.literal("vaciar") }),
]);

/**
 * POST /api/admin/eval
 *   { accion: "generar", cantidad }  añade preguntas de prueba
 *   { accion: "evaluar" }            pasa la batería por los tres métodos
 *   { accion: "vaciar" }             borra la batería
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  try {
    switch (parsed.data.accion) {
      case "generar": {
        const creadas = await generateQuestions(parsed.data.cantidad);
        return NextResponse.json({ creadas });
      }
      case "evaluar":
        return NextResponse.json(await runEvaluation());
      case "vaciar":
        await clearQuestions();
        return NextResponse.json({ ok: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    console.error("[eval]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
