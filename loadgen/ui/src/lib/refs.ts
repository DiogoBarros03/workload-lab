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
