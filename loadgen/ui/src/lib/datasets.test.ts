import { expect, test } from "vitest";
import k8sJson from "../../../../results/000-k8s.json";
import { parseBaseline } from "./baseline";
import { datasetFor } from "./datasets";

test("datasetFor returns the recorded dataset for each measured key", () => {
  const base = datasetFor("000-baseline");
  expect([base.target, base.measuredAt, base.runs.length]).toEqual([undefined, "2026-09-25", 12]);
  const sidecar = datasetFor("001-sidecar");
  expect([sidecar.target, sidecar.setup.sidecarCpu, sidecar.setup.sidecarMemMiB, sidecar.runs.length]).toEqual(["k8s-sidecar", 0.1, 64, 12]);
  expect(sidecar.runs.find((r) => r.op === "read" && r.targetRps === 5000)?.peakCpuCoresSidecar).toBe(0.37);
});

test("datasetFor throws for a key with no recorded file", () => {
  expect(() => datasetFor("002-ambassador")).toThrow("no measured dataset 002-ambassador");
});

test("the 000 on kind file parses, null commits and all", () => {
  const k8s = parseBaseline(k8sJson);
  expect([k8s.target, k8s.runs.filter((r) => r.peakCommitsPerSec === null).length]).toEqual(["k8s", 3]);
});
