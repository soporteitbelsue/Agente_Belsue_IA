import { Fragment, type ReactNode } from "react";

/** Renderiza fragmentos inline: **negrita** y *cursiva*. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Divide capturando **negrita** y *cursiva*.
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = text.split(regex).filter(Boolean);

  parts.forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      nodes.push(<strong key={i}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith("*") && part.endsWith("*")) {
      nodes.push(<em key={i}>{part.slice(1, -1)}</em>);
    } else {
      nodes.push(<Fragment key={i}>{part}</Fragment>);
    }
  });

  return nodes;
}

/**
 * Renderizador de markdown muy básico: negrita, cursiva, listas
 * (con `-` o `*`) y saltos de línea / párrafos.
 */
export default function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];

  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = [...listItems];
    blocks.push(
      <ul key={`ul-${key++}`} className="my-1 list-disc space-y-0.5 pl-5">
        {items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const listMatch = /^\s*[-*]\s+(.*)$/.exec(line);

    if (listMatch) {
      listItems.push(listMatch[1] ?? "");
      continue;
    }

    flushList();

    if (line.trim() === "") {
      continue;
    }

    blocks.push(
      <p key={`p-${key++}`} className="my-1 leading-relaxed">
        {renderInline(line)}
      </p>,
    );
  }

  flushList();

  return <div className="text-sm">{blocks}</div>;
}
