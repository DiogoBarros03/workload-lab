import { expect, test } from "vitest";
import { fmtBytes, fmtInt, fmtMs, fmtSec, fromLog, statusTone, toLog, validCount } from "./format";

const T = " ";

test("fmtInt rounds and groups thousands with a thin space", () => {
  expect(fmtInt(0)).toBe("0");
  expect(fmtInt(999)).toBe("999");
  expect(fmtInt(1000)).toBe(`1${T}000`);
  expect(fmtInt(1234567.6)).toBe(`1${T}234${T}568`);
  expect(fmtInt(-45210)).toBe(`-45${T}210`);
});

test("fmtMs keeps precision where it matters and shows a dash for no value", () => {
  expect(fmtMs(null)).toBe("–");
  expect(fmtMs(0.4567)).toBe("0.46");
  expect(fmtMs(9.994)).toBe("9.99");
  expect(fmtMs(38.46)).toBe("38.5");
  expect(fmtMs(1204.4)).toBe(`1${T}204`);
});

test("fmtSec shows one decimal", () => {
  expect(fmtSec(0)).toBe("0.0 s");
  expect(fmtSec(12345)).toBe("12.3 s");
});

test("fmtBytes picks the largest binary unit below the value", () => {
  expect(fmtBytes(512)).toBe("512 B");
  expect(fmtBytes(2048)).toBe("2 KiB");
  expect(fmtBytes(134217728)).toBe("128 MiB");
  expect(fmtBytes(1.5 * 2 ** 30)).toBe("1.5 GiB");
});

test("statusTone maps status classes to pastel tones", () => {
  expect(statusTone("200")).toBe("green");
  expect(statusTone("201")).toBe("green");
  expect(statusTone("304")).toBe("blue");
  expect(statusTone("409")).toBe("yellow");
  expect(statusTone("503")).toBe("red");
  expect(statusTone("null")).toBe("red");
});

test("log slider maps both ends exactly and round-trips values", () => {
  expect(toLog(1, 200000)).toBe(0);
  expect(toLog(200000, 200000)).toBe(1000);
  expect(fromLog(0, 5000)).toBe(1);
  expect(fromLog(1000, 5000)).toBe(5000);
  for (const v of [1, 10, 100, 1000, 5000]) expect(fromLog(toLog(v, 5000), 5000)).toBe(v);
  expect(fromLog(500, 10000)).toBe(100);
});

test("validCount accepts whole numbers within 1..max only", () => {
  expect(["1", "10", "5000"].map((v) => validCount(v, 5000))).toEqual([true, true, true]);
  expect(["", "0", "5001", "1.5", "-3", "1e3", " 7"].map((v) => validCount(v, 5000))).toEqual(Array(7).fill(false));
});
