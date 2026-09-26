import { BOOKS, type Book } from "./books";

// Top-level sidebar groups; a category without books renders as empty.
export type Category = { id: string; label: string; books?: readonly Book[] };

export const CATEGORIES: readonly Category[] = [
  { id: "books", label: "Books", books: BOOKS },
  { id: "projects", label: "Projects" },
  { id: "classes", label: "Classes" },
  { id: "technologies", label: "Technologies" },
  { id: "ai", label: "AI" },
];
