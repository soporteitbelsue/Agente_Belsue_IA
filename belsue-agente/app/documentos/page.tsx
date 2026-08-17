import { redirect } from "next/navigation";
import { parseScope } from "@/lib/scopes";

/**
 * Documentos y Conocimiento eran dos pantallas que enseñaban lo mismo partido
 * en dos: los archivos por un lado y las notas por otro. Ahora hay una sola.
 *
 * Esta ruta se conserva para que no se rompan los enlaces guardados ni los
 * marcadores del navegador.
 */
export default function DocumentosPage({
  searchParams,
}: {
  searchParams: { scope?: string };
}) {
  redirect(`/conocimiento?scope=${parseScope(searchParams.scope)}`);
}
