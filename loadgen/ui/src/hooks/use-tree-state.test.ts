import { expect, test } from "vitest";
import { PROJECTS } from "@/lib/projects";
import { DEFAULT_TREE, TREE_KEY, openPathFor, readTree, withOpen, writeTree } from "./use-tree-state";

const memory = (init: Record<string, string> = {}) => {
  const data = { ...init };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
};
const blocked = () => { throw new Error("storage disabled"); };

test("defaults open Books and its book, nothing else", () => {
  expect(DEFAULT_TREE).toEqual({ books: true, "book:dds": true });
});

test("withOpen returns a new tree and leaves the input untouched", () => {
  const before = { books: true };
  const after = withOpen(before, "book:dds", false);
  expect(after).toEqual({ books: true, "book:dds": false });
  expect(before).toEqual({ books: true });
  expect(withOpen(after, "books", false)).toEqual({ books: false, "book:dds": false });
});

test("readTree returns the stored tree", () => {
  const s = memory({ [TREE_KEY]: JSON.stringify({ books: false, classes: true }) });
  expect(readTree(() => s)).toEqual({ books: false, classes: true });
});

test("readTree falls back to defaults on absent, garbage or blocked storage", () => {
  expect(readTree(() => memory())).toEqual(DEFAULT_TREE);
  for (const raw of ["{not json", "null", "[true]", "42", '"x"', '{"books":"yes"}']) {
    expect(readTree(() => memory({ [TREE_KEY]: raw }))).toEqual(DEFAULT_TREE);
  }
  expect(readTree(blocked)).toEqual(DEFAULT_TREE);
});

test("writeTree stores JSON under the key and survives blocked storage", () => {
  const s = memory();
  writeTree(() => s, { books: false });
  expect(JSON.parse(s.data[TREE_KEY])).toEqual({ books: false });
  expect(() => writeTree(blocked, { books: false })).not.toThrow();
  const full = { ...s, setItem: () => { throw new Error("quota"); } };
  expect(() => writeTree(() => full, { books: true })).not.toThrow();
});

test("openPathFor opens the category and book holding the project", () => {
  expect(openPathFor(PROJECTS[0])).toEqual({ books: true, "book:dds": true });
  expect(openPathFor(PROJECTS[3])).toEqual({ books: true, "book:dds": true });
});

test("openPathFor throws for a project no category holds", () => {
  expect(() => openPathFor({ ...PROJECTS[0], bookId: "nope" })).toThrow(/nope/);
});
