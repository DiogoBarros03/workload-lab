import { expect, test } from "vitest";
import { THEME_KEY, applyTheme, nextTheme, readTheme, writeTheme } from "./use-theme";

const memory = (init: Record<string, string> = {}) => {
  const data = { ...init };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
};
const blocked = () => { throw new Error("storage disabled"); };

test("nextTheme cycles light, dark, system, light", () => {
  expect(nextTheme("light")).toBe("dark");
  expect(nextTheme("dark")).toBe("system");
  expect(nextTheme("system")).toBe("light");
});

test("readTheme returns a stored choice", () => {
  for (const t of ["light", "dark", "system"] as const) expect(readTheme(() => memory({ [THEME_KEY]: t }))).toBe(t);
});

test("readTheme falls back to system when missing, invalid or blocked", () => {
  expect(readTheme(() => memory())).toBe("system");
  expect(readTheme(() => memory({ [THEME_KEY]: "sepia" }))).toBe("system");
  expect(readTheme(blocked)).toBe("system");
});

test("writeTheme stores under loadlab.theme and survives blocked storage", () => {
  const m = memory();
  writeTheme(() => m, "dark");
  expect(m.data).toEqual({ "loadlab.theme": "dark" });
  expect(() => writeTheme(blocked, "light")).not.toThrow();
});

test("applyTheme sets data-theme for an explicit choice and removes it for system", () => {
  const attrs = new Map<string, string>([["data-theme", "stale"]]);
  const el = { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) };
  applyTheme(el, "dark");
  expect(attrs.get("data-theme")).toBe("dark");
  applyTheme(el, "light");
  expect(attrs.get("data-theme")).toBe("light");
  applyTheme(el, "system");
  expect(attrs.has("data-theme")).toBe(false);
});
