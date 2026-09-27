import { expect, test } from "vitest";
import { linkRefs, refsIn } from "./refs";

test("linkRefs turns known project ids into links and keeps the text around them", () => {
  expect(linkRefs("In [[000]] and [[004]], done.")).toEqual([
    { text: "In " },
    { text: "000 Baseline", href: "#/dds/000-baseline" },
    { text: " and " },
    { text: "004 Replicated load-balanced service", href: "#/dds/004-replicated-service" },
    { text: ", done." },
  ]);
});

test("linkRefs leaves an unknown id as literal text", () => {
  expect(linkRefs("see [[999]] now")).toEqual([{ text: "see " }, { text: "[[999]]" }, { text: " now" }]);
});

test("linkRefs handles text without references, a leading reference, and empty text", () => {
  expect(linkRefs("plain")).toEqual([{ text: "plain" }]);
  expect(linkRefs("[[001]] first")).toEqual([{ text: "001 Sidecar", href: "#/dds/001-sidecar" }, { text: " first" }]);
  expect(linkRefs("")).toEqual([]);
});

test("refsIn lists every referenced id in order", () => {
  expect(refsIn("[[001]] then [[002]] and [[x]]")).toEqual(["001", "002", "x"]);
});

test("linkRefs splits adjacent references into two links", () => {
  expect(linkRefs("[[000]][[001]] text")).toEqual([
    { text: "000 Baseline", href: "#/dds/000-baseline" },
    { text: "001 Sidecar", href: "#/dds/001-sidecar" },
    { text: " text" },
  ]);
});
