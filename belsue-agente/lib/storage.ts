import { supabaseServer } from "@/lib/supabase";

/** Bucket de Supabase Storage donde se guardan los documentos originales. */
export const DOCUMENTS_BUCKET = "documentos";

/**
 * Crea una URL firmada para que el navegador suba un archivo directamente a
 * Supabase Storage (evita el límite de tamaño de las API routes en serverless).
 */
export async function createSignedUpload(path: string): Promise<{
  path: string;
  token: string;
}> {
  const supabase = supabaseServer();
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo crear la URL de subida.");
  }
  return { path: data.path, token: data.token };
}

/** Descarga un archivo de Storage como Buffer (para indexarlo en el servidor). */
export async function downloadFile(path: string): Promise<Buffer> {
  const supabase = supabaseServer();
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .download(path);

  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo descargar el archivo.");
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Elimina un archivo de Storage (best-effort). */
export async function removeFile(path: string): Promise<void> {
  const supabase = supabaseServer();
  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .remove([path]);
  if (error) {
    console.error(`[storage] No se pudo borrar ${path}:`, error.message);
  }
}
