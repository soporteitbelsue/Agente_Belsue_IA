import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink, access } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { processAndStoreDocument } from "@/lib/embeddings";
import { requireAdmin } from "@/lib/auth";
import type { FileType } from "@/types";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const EXT_TO_TYPE: Record<string, FileType> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".txt": "txt",
};

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const CATEGORIES = [
  "auto",
  "moto",
  "hogar",
  "vida",
  "salud",
  "decesos",
  "viaje",
  "rc",
  "general",
] as const;

// Esquema de validación de los metadatos + archivo.
const uploadSchema = z.object({
  file: z
    .instanceof(File, { message: "No se ha proporcionado ningún archivo." })
    .refine((f) => f.size > 0, "El archivo está vacío.")
    .refine(
      (f) => f.size <= MAX_FILE_SIZE,
      "El archivo supera el tamaño máximo de 20 MB.",
    )
    .refine((f) => {
      const ext = path.extname(f.name).toLowerCase();
      return Boolean(EXT_TO_TYPE[ext]);
    }, "Tipo de archivo no permitido. Solo se aceptan PDF, DOCX o TXT."),
  name: z.string().min(1, "El nombre es obligatorio."),
  description: z.string().optional(),
  category: z.enum(CATEGORIES).optional(),
  company: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  let filePath: string | null = null;

  try {
    const formData = await req.formData();

    const parsed = uploadSchema.safeParse({
      file: formData.get("file"),
      name: (formData.get("name") as string) || undefined,
      description: (formData.get("description") as string) || undefined,
      category: (formData.get("category") as string) || undefined,
      company: (formData.get("company") as string) || undefined,
    });

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Petición inválida.";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }

    const { file, name, description, category, company } = parsed.data;

    // Validación extra del MIME type cuando está disponible.
    if (file.type && !ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { success: false, error: `Tipo MIME no permitido: ${file.type}` },
        { status: 400 },
      );
    }

    const ext = path.extname(file.name).toLowerCase();
    const fileType = EXT_TO_TYPE[ext]!;

    const uploadDir = process.env.UPLOAD_DIR;
    if (!uploadDir) {
      console.error("[upload] UPLOAD_DIR no está configurado.");
      return NextResponse.json(
        { success: false, error: "UPLOAD_DIR no está configurado en el servidor." },
        { status: 500 },
      );
    }

    await mkdir(uploadDir, { recursive: true });

    // Nombre único en disco para evitar colisiones.
    const storedName = `${randomUUID()}${ext}`;
    filePath = path.join(uploadDir, storedName);

    // Comprobación defensiva: el nombre aleatorio no debería existir.
    const exists = await access(filePath).then(
      () => true,
      () => false,
    );
    if (exists) {
      console.error(`[upload] Colisión de nombre inesperada: ${filePath}`);
      return NextResponse.json(
        { success: false, error: "Ya existe un archivo con ese nombre. Inténtalo de nuevo." },
        { status: 409 },
      );
    }

    // 2. Guardar el archivo físico. Si falla, no tocamos Supabase.
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      await writeFile(filePath, buffer);
    } catch (diskErr) {
      console.error("[upload] Error al guardar el archivo en disco:", diskErr);
      filePath = null; // no intentes borrar lo que no se creó
      return NextResponse.json(
        { success: false, error: "No se pudo guardar el archivo en el servidor." },
        { status: 500 },
      );
    }

    // 3. Insertar el registro en Supabase. Si falla, borrar el archivo.
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from("documents")
      .insert({
        name,
        description: description ?? null,
        file_path: filePath,
        file_type: fileType,
        file_size: buffer.byteLength,
        category: category ?? null,
        company: company ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("[upload] Error al insertar en Supabase:", error);
      await unlink(filePath).catch((unlinkErr) =>
        console.error("[upload] Error al borrar el archivo huérfano:", unlinkErr),
      );
      return NextResponse.json(
        { success: false, error: error?.message ?? "No se pudo registrar el documento." },
        { status: 500 },
      );
    }

    const documentId = data.id as string;

    // 4. Procesar e indexar en background (no bloquea la respuesta).
    void processAndStoreDocument(documentId, filePath, fileType).catch(
      (procErr) => {
        console.error(
          `[upload] Error al procesar el documento ${documentId}:`,
          procErr,
        );
      },
    );

    // 5. Responder de inmediato.
    return NextResponse.json(
      {
        success: true,
        documentId,
        message:
          "Documento subido correctamente. Se está indexando en segundo plano.",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[upload] Error inesperado:", err);
    // Limpieza best-effort del archivo si ya se había creado.
    if (filePath) {
      await unlink(filePath).catch(() => undefined);
    }
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
