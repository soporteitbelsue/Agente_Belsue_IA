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
      <UploadForm />
      <DocumentList />
    </div>
  );
}
