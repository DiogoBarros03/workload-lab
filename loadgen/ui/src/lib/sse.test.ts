import { expect, test } from "vitest";
import { parseSse } from "./sse";

test("parses complete events with names and JSON data", () => {
  const { events, rest } = parseSse('event: progress\ndata: {"done":3}\n\nevent: result\ndata: {"rps":9}\n\n');
  expect(events).toEqual([
    { event: "progress", data: { done: 3 } },
    { event: "result", data: { rps: 9 } },
  ]);
  expect(rest).toBe("");
});

test("keeps an unfinished block as rest and completes it with the next chunk", () => {
  const first = parseSse('event: progress\ndata: {"done":1}\n\nevent: resu');
  expect(first.events).toEqual([{ event: "progress", data: { done: 1 } }]);
  expect(first.rest).toBe("event: resu");
  const second = parseSse(first.rest + 'lt\ndata: {"rps":2}\n\n');
  expect(second.events).toEqual([{ event: "result", data: { rps: 2 } }]);
  expect(second.rest).toBe("");
});

test("a split inside the blank-line separator still yields one event", () => {
  const first = parseSse('event: error\ndata: {"error":"x"}\n');
  expect(first.events).toEqual([]);
  expect(parseSse(first.rest + "\n").events).toEqual([{ event: "error", data: { error: "x" } }]);
});

test("ignores blocks without data and comment lines", () => {
  const { events } = parseSse(': keepalive\n\nevent: progress\n\ndata: {"a":1}\n\n');
  expect(events).toEqual([{ event: "message", data: { a: 1 } }]);
});

test("accepts CRLF line endings", () => {
  expect(parseSse('event: result\r\ndata: {"b":2}\r\n\r\n').events).toEqual([{ event: "result", data: { b: 2 } }]);
});
