import Link from "next/link";
import DocumentList from "@/components/admin/DocumentList";

export default function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 overflow-y-auto px-4 py-6">
      <div>
        <Link
          href="/"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver a los portales
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          Supervisión del conocimiento
        </h1>
        <p className="text-sm text-gray-500">
          El material de los dos portales a la vez, con el número de fragmentos
          indexados de cada uno: es donde se ve si algo se ha quedado sin
          procesar. Para añadir notas o documentos, entra en el portal que
          corresponda y usa <b>Conocimiento</b>.
        </p>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-gray-200">
        <span className="border-b-2 border-belsue px-4 py-2 text-sm font-semibold text-belsue">
          Conocimiento
        </span>
        <Link
          href="/admin/usuarios"
          className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Usuarios
        </Link>
        <Link
          href="/admin/metrics"
          className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Métricas
        </Link>
      </div>

      <DocumentList />
    </div>
  );
}
