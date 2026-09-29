import { expect, test } from "vitest";
import { resetUrl } from "./use-reset";

test("resetUrl names the project's target", () => {
  expect(resetUrl("k8s-sidecar")).toBe("/reset?target=k8s-sidecar");
  expect(resetUrl("compose")).toBe("/reset?target=compose");
  expect(resetUrl("a b&c")).toBe("/reset?target=a%20b%26c");
});
