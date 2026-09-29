import { expect, test } from "vitest";
import { runBody } from "./use-run";

test("runBody sends the config with the project's target", () => {
  const config = { mode: "open", op: "write", rps: 250, durationSec: 20 } as const;
  expect(JSON.parse(runBody(config, "k8s-sidecar"))).toEqual({ mode: "open", op: "write", rps: 250, durationSec: 20, target: "k8s-sidecar" });
  expect(JSON.parse(runBody(config, "compose")).target).toBe("compose");
});
