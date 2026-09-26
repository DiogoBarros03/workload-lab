import { useState } from "react";
import { BOOKS, bookOf, type Book } from "@/lib/books";
import { CATEGORIES } from "@/lib/catalog";
import type { Project } from "@/lib/projects";

// Open state per sidebar node; a missing id means closed.
export type Tree = Readonly<Record<string, boolean>>;
type Store = () => Pick<Storage, "getItem" | "setItem">;

export const TREE_KEY = "loadlab.nav.open";
export const bookNodeId = (book: Book) => `book:${book.id}`;
export const DEFAULT_TREE: Tree = { books: true, ...Object.fromEntries(BOOKS.map((b) => [bookNodeId(b), true])) };

const isTree = (v: unknown): v is Tree =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "boolean");

// Storage may be absent, blocked or corrupt; the nav works without it.
export function readTree(store: Store): Tree {
  try {
    const raw = store().getItem(TREE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    return isTree(parsed) ? parsed : DEFAULT_TREE;
  } catch {
    return DEFAULT_TREE;
  }
}

export function writeTree(store: Store, tree: Tree) {
  try {
    store().setItem(TREE_KEY, JSON.stringify(tree));
  } catch {
    // Blocked or full storage only costs persistence.
  }
}

export const withOpen = (tree: Tree, id: string, open: boolean): Tree => ({ ...tree, [id]: open });

export function openPathFor(project: Project): Tree {
  const book = bookOf(project);
  const category = CATEGORIES.find((c) => c.books?.includes(book));
  if (!category) throw new Error(`no category holds book ${book.id}`);
  return { [category.id]: true, [bookNodeId(book)]: true };
}

const browserStore: Store = () => window.localStorage;

// Stored tree on load; route changes force the active project's ancestors open.
export function useTreeState(active: Project | null) {
  const [tree, setTree] = useState(() => readTree(browserStore));
  const [shown, setShown] = useState(active);
  if (shown !== active) {
    setShown(active);
    if (active) setTree({ ...tree, ...openPathFor(active) });
  }
  const setOpen = (id: string, open: boolean) => {
    setTree((t) => withOpen(t, id, open));
    writeTree(browserStore, withOpen(readTree(browserStore), id, open));
  };
  return [tree, setOpen] as const;
}
