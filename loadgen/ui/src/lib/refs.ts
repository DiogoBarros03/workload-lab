import { hrefOf, PROJECTS } from "./projects";

export type RefPart = { text: string; href?: string };

const REF = /\[\[(\w+)\]\]/g;

export const refsIn = (text: string): string[] => [...text.matchAll(REF)].map((m) => m[1]);

// Splits prose on [[id]]; known ids become links, unknown ones stay literal.
export function linkRefs(text: string): RefPart[] {
  return text.split(/(\[\[\w+\]\])/).filter((s) => s !== "").map((s) => {
    const project = PROJECTS.find((p) => `[[${p.id}]]` === s);
    return project ? { text: `${project.id} ${project.title}`, href: hrefOf(project) } : { text: s };
  });
}

export type InlinePart = { kind: "text" | "link" | "strong" | "em" | "code"; text: string; href?: string };

// **bold**, _italic_ or `code`; underscores only count at word boundaries, so snake_case stays text.
const EMPHASIS = /\*\*(?=\S)(.+?)(?<=\S)\*\*|(?<!\w)_(?=\S)(.+?)(?<=\S)_(?!\w)|\x60([^\x60]+)\x60/; // \x60 is a backtick
const KINDS = ["text", "strong", "em", "code"] as const;

// split with three groups yields [text, bold, italic, code, text, ...]; unused groups are undefined.
const emphasisParts = (text: string): InlinePart[] =>
  text.split(EMPHASIS).flatMap((s, i) => (s ? [{ kind: KINDS[i % 4], text: s }] : []));

// Links first, then emphasis inside the plain text between them.
export const inlineParts = (text: string): InlinePart[] =>
  linkRefs(text).flatMap((p) => (p.href ? [{ kind: "link" as const, text: p.text, href: p.href }] : emphasisParts(p.text)));
