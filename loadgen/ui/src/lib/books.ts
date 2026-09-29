import { PROJECTS, type Project } from "./projects";

export type Book = { id: string; title: string; author: string; edition: string; projects: Project[] };

export const BOOKS: readonly Book[] = [
  {
    id: "dds", title: "Designing Distributed Systems", author: "Brendan Burns", edition: "2nd ed., O'Reilly 2024",
    projects: PROJECTS.filter((p) => p.bookId === "dds"),
  },
];

export const bookOf = (project: Project): Book => {
  const book = BOOKS.find((b) => b.id === project.bookId);
  if (!book) throw new Error(`project ${project.id} names unknown book ${project.bookId}`);
  return book;
};

// A book's link lands on its first ready project, else its first.
export const firstReadyOf = (book: Book): Project => book.projects.find((p) => p.status === "ready") ?? book.projects[0];

export const breadcrumbOf = (project: Project) => `Books · ${bookOf(project).title}`;

// A null project is the home page.
export const pageTitle = (project: Project | null, outage: boolean) =>
  `${outage ? "ERROR · " : ""}${project ? `${project.id} ${project.title} · ${bookOf(project).title} · ` : ""}Load lab`;

// The projects either side of this one in its book; null at either end.
export const neighboursOf = (project: Project): { prev: Project | null; next: Project | null } => {
  const list = bookOf(project).projects;
  const i = list.indexOf(project);
  if (i < 0) throw new Error(`project ${project.id} is missing from its book`);
  return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null };
};
