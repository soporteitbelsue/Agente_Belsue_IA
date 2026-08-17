import Link from "next/link";
import AdminTabs from "@/components/admin/AdminTabs";
import DocumentList from "@/components/admin/DocumentList";
import KnowledgeReview from "@/components/admin/KnowledgeReview";

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

      <AdminTabs active="/admin" />

      <KnowledgeReview />
      <DocumentList />
    </div>
  );
}
