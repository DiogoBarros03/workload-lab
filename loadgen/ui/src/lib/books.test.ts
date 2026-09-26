import { expect, test } from "vitest";
import { BOOKS, bookOf, breadcrumbOf, pageTitle } from "./books";
import { PROJECTS } from "./projects";

test("one book, Designing Distributed Systems, holds all twelve projects in order", () => {
  expect(BOOKS.map((b) => [b.id, b.title, b.author])).toEqual([["dds", "Designing Distributed Systems", "Brendan Burns"]]);
  expect(BOOKS[0].projects.map((p) => p.id)).toEqual(PROJECTS.map((p) => p.id));
  expect(BOOKS[0].projects).toHaveLength(12);
});

test("every project names a book that exists and lists it", () => {
  for (const p of PROJECTS) expect(bookOf(p).projects).toContain(p);
});

test("bookOf throws for a project whose book is unknown", () => {
  expect(() => bookOf({ ...PROJECTS[0], bookId: "nope" })).toThrow(/nope/);
});

test("breadcrumbOf names the shelf and the book", () => {
  expect(breadcrumbOf(PROJECTS[0])).toBe("Books · Designing Distributed Systems");
});

test("pageTitle joins project, book and app, with the outage prefix", () => {
  expect(pageTitle(PROJECTS[0], false)).toBe("000 Baseline · Designing Distributed Systems · Load lab");
  expect(pageTitle(PROJECTS[4], true)).toBe("ERROR · 004 Replicated load-balanced service · Designing Distributed Systems · Load lab");
});

test("pageTitle at home is the app name, with the outage prefix", () => {
  expect(pageTitle(null, false)).toBe("Load lab");
  expect(pageTitle(null, true)).toBe("ERROR · Load lab");
});
