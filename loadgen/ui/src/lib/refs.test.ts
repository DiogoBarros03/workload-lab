import { expect, test } from "vitest";
import { inlineParts, linkRefs, refsIn } from "./refs";

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

test("inlineParts turns **bold** into strong and _italic_ into em", () => {
  expect(inlineParts("a **key idea** here")).toEqual([
    { kind: "text", text: "a " }, { kind: "strong", text: "key idea" }, { kind: "text", text: " here" },
  ]);
  expect(inlineParts("_the point_ stands")).toEqual([{ kind: "em", text: "the point" }, { kind: "text", text: " stands" }]);
});

test("inlineParts handles bold, italic and a link in one paragraph", () => {
  expect(inlineParts("In [[000]] the **pool** is _the limit_, twice **more**.")).toEqual([
    { kind: "text", text: "In " },
    { kind: "link", text: "000 Baseline", href: "#/dds/000-baseline" },
    { kind: "text", text: " the " },
    { kind: "strong", text: "pool" },
    { kind: "text", text: " is " },
    { kind: "em", text: "the limit" },
    { kind: "text", text: ", twice " },
    { kind: "strong", text: "more" },
    { kind: "text", text: "." },
  ]);
});

test("inlineParts leaves underscores inside words and unclosed markers literal", () => {
  expect(inlineParts("use snake_case and max_pool_size")).toEqual([{ kind: "text", text: "use snake_case and max_pool_size" }]);
  expect(inlineParts("a **dangling and _open")).toEqual([{ kind: "text", text: "a **dangling and _open" }]);
  expect(inlineParts("")).toEqual([]);
});

test("inlineParts closes italics before punctuation", () => {
  expect(inlineParts("ask _how do we scale?_")).toEqual([{ kind: "text", text: "ask " }, { kind: "em", text: "how do we scale?" }]);
});

test("inlineParts turns `code` spans into code, one or several", () => {
  expect(inlineParts("serves `/stats` now")).toEqual([
    { kind: "text", text: "serves " }, { kind: "code", text: "/stats" }, { kind: "text", text: " now" },
  ]);
  expect(inlineParts("`/proc` or `results/000-k8s.md`")).toEqual([
    { kind: "code", text: "/proc" }, { kind: "text", text: " or " }, { kind: "code", text: "results/000-k8s.md" },
  ]);
});

test("inlineParts leaves an unclosed backtick literal and keeps backticks inside bold literal", () => {
  expect(inlineParts("a `open tick")).toEqual([{ kind: "text", text: "a `open tick" }]);
  expect(inlineParts("see **the `x` flag** here")).toEqual([
    { kind: "text", text: "see " }, { kind: "strong", text: "the `x` flag" }, { kind: "text", text: " here" },
  ]);
});
