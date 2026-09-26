import { expect, test } from "vitest";
import { BOOKS } from "./books";
import { CATEGORIES } from "./catalog";

test("five categories in sidebar order, only Books has content", () => {
  expect(CATEGORIES.map((c) => [c.id, c.label])).toEqual([
    ["books", "Books"], ["projects", "Projects"], ["classes", "Classes"], ["technologies", "Technologies"], ["ai", "AI"],
  ]);
  expect(CATEGORIES.map((c) => c.books)).toEqual([BOOKS, undefined, undefined, undefined, undefined]);
});
