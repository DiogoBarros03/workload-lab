import { expect, test } from "vitest";
import { renderMarkdown } from "./markdown";

const FIXTURE = [
  "# Load lab",
  "",
  "| Category | Status |",
  "|---|---|",
  "| **Books** | Done |",
  "",
  "```sh",
  "podman compose up -d",
  "```",
  "",
  "See http://localhost:3200 now.",
].join("\n");

test("renderMarkdown turns a heading, a GFM table and a fenced block into HTML", () => {
  const html = renderMarkdown(FIXTURE);
  expect(html).toContain("<h1>Load lab</h1>");
  expect(html).toMatch(/<table>\s*<thead>\s*<tr>\s*<th>Category<\/th>\s*<th>Status<\/th>/);
  expect(html).toContain("<td><strong>Books</strong></td>");
  expect(html).toContain('<pre><code class="language-sh">podman compose up -d\n</code></pre>');
});

test("renderMarkdown autolinks bare URLs without a target, so they open in the same tab", () => {
  const html = renderMarkdown(FIXTURE);
  expect(html).toContain('<a href="http://localhost:3200">http://localhost:3200</a>');
  expect(html).not.toContain("target=");
});
