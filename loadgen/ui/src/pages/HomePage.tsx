import { useMemo } from "react";
import readme from "../../../../README.md?raw";
import { renderMarkdown } from "@/lib/markdown";

// The repo README, rendered once; .prose-md in index.css styles it.
export function HomePage() {
  const html = useMemo(() => renderMarkdown(readme), []);
  return <article className="prose-md" dangerouslySetInnerHTML={{ __html: html }} />;
}
