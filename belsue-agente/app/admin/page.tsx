import Link from "next/link";
import UploadForm from "@/components/admin/UploadForm";
import DocumentList from "@/components/admin/DocumentList";

export default function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 overflow-y-auto px-4 py-6">
      <div>
        <Link
          href="/chat"
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-belsue hover:underline"
        >
          ← Volver al chat
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          Administración de documentos
        </h1>
        <p className="text-sm text-gray-500">
          Sube pólizas y documentación. Se indexarán automáticamente para el
          agente.
        </p>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-gray-200">
        <span className="border-b-2 border-belsue px-4 py-2 text-sm font-semibold text-belsue">
          Documentos
        </span>
        <Link
          href="/admin/metrics"
          className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Métricas
        </Link>
      </div>

      <UploadForm />
      <DocumentList />
    </div>
  );
}
