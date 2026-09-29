import { useMemo } from "react";
import readme from "../../../../README.md?raw";
import { PathCard } from "@/components/PathNav";
import { BOOKS, firstReadyOf } from "@/lib/books";
import { renderMarkdown } from "@/lib/markdown";
import { hrefOf } from "@/lib/projects";

const FIRST = firstReadyOf(BOOKS[0]);

// The repo README, rendered once; .prose-md in index.css styles it.
export function HomePage() {
  const html = useMemo(() => renderMarkdown(readme), []);
  return (
    <>
      <article className="prose-md" dangerouslySetInnerHTML={{ __html: html }} />
      <nav aria-label="Learning path" className="grid grid-cols-1 gap-4 border-t border-border pt-12 md:grid-cols-2">
        <div className="md:col-start-2">
          <PathCard href={hrefOf(FIRST)} label="Start the path" id={FIRST.id} title={FIRST.title} question={FIRST.question} next />
        </div>
      </nav>
    </>
  );
}
