import { expect, test } from "vitest";
import { cn } from "./utils";

test("cn treats the custom type tokens as font sizes, not colours", () => {
  expect(cn("text-xs", "text-label")).toBe("text-label");
  expect(cn("text-sm text-red-fg", "text-meta")).toBe("text-red-fg text-meta");
  expect(cn("text-label", "text-green-fg")).toBe("text-label text-green-fg");
  expect(cn("text-question-sm sm:text-4xl", "sm:text-question")).toBe("text-question-sm sm:text-question");
});
