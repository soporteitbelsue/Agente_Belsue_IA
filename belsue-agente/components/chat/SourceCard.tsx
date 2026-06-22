import type { Source } from "@/types";

function truncate(text: string, max = 150): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}...`;
}

export default function SourceCard({ source }: { source: Source }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 text-xs shadow-sm">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-gray-800">{source.documentName}</span>
        {source.company && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
            {source.company}
          </span>
        )}
        {source.category && (
          <span className="rounded bg-belsue/10 px-1.5 py-0.5 font-medium text-belsue">
            {source.category}
          </span>
        )}
        <span className="ml-auto whitespace-nowrap text-gray-400">
          {Math.round(source.similarity * 100)}% relevancia
        </span>
      </div>
      <p className="text-gray-600">{truncate(source.content)}</p>
    </div>
  );
}
