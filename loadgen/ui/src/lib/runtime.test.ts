import { expect, test } from "vitest";
import { containerStates, type ClusterSummary } from "./operator";
import { PROJECTS } from "./projects";
import { activeRuntimes, othersActive, phaseOf, planEnsure, switchText, type Active } from "./runtime";

const [baseline, sidecar] = PROJECTS;
const compose = (api: string, db: string) =>
  containerStates({ services: { api: { state: api, health: null }, db: { state: db, health: null }, loadgen: { state: "running", health: null } } });
const cluster = (applied: string[]): ClusterSummary => ({ exists: true, ready: "3/3", applied });
const NO_CLUSTER: ClusterSummary = { exists: false, ready: null, applied: [] };
const ids = (a: Active[]) => a.map((x) => [x.projectId, x.runtime.kind, x.label]);

test("activeRuntimes finds none when compose is stopped and no overlay is applied", () => {
  expect(activeRuntimes(compose("exited", "absent"), cluster([]), PROJECTS)).toEqual([]);
  expect(activeRuntimes(compose("exited", "exited"), NO_CLUSTER, PROJECTS)).toEqual([]);
});

test("activeRuntimes marks 000 active when api or db runs, loadgen alone never counts", () => {
  expect(ids(activeRuntimes(compose("exited", "running"), cluster([]), PROJECTS))).toEqual([["000", "compose", "000 Baseline"]]);
  expect(ids(activeRuntimes(compose("running", "exited"), NO_CLUSTER, PROJECTS))).toEqual([["000", "compose", "000 Baseline"]]);
});

test("activeRuntimes marks a kind project active when its overlay is applied", () => {
  expect(ids(activeRuntimes(compose("exited", "exited"), cluster(["001-sidecar"]), PROJECTS))).toEqual([["001", "kind", "001 Sidecar"]]);
});

test("activeRuntimes lists both runtimes and skips upcoming projects' overlays", () => {
  const both = activeRuntimes(compose("running", "running"), cluster(["001-sidecar", "002-ambassador"]), PROJECTS);
  expect(ids(both)).toEqual([["000", "compose", "000 Baseline"], ["001", "kind", "001 Sidecar"]]);
});

test("activeRuntimes reads unknown operator state as nothing active", () => {
  expect(activeRuntimes(null, null, PROJECTS)).toEqual([]);
});

const active = (p = baseline) => activeRuntimes(
  p.runtime.kind === "compose" ? compose("running", "running") : compose("exited", "exited"),
  cluster(p.runtime.kind === "kind" ? [p.runtime.overlay] : []), PROJECTS);

test("othersActive drops the project's own runtime", () => {
  expect(othersActive(active(baseline), baseline)).toEqual([]);
  expect(othersActive(active(baseline), sidecar).map((a) => a.projectId)).toEqual(["000"]);
});

test("planEnsure starts compose then waits for health", () => {
  expect(planEnsure(baseline, [], cluster([]), false)).toEqual({ steps: [{ job: "start" }, { job: "wait" }] });
});

test("planEnsure creates a missing cluster before applying the overlay", () => {
  expect(planEnsure(sidecar, [], NO_CLUSTER, false)).toEqual({ steps: [{ job: "up" }, { job: "apply" }, { job: "wait" }] });
});

test("planEnsure applies onto an existing cluster, and only waits when already applied", () => {
  expect(planEnsure(sidecar, [], cluster([]), false)).toEqual({ steps: [{ job: "apply" }, { job: "wait" }] });
  expect(planEnsure(sidecar, active(sidecar), cluster(["001-sidecar"]), false)).toEqual({ steps: [{ job: "wait" }] });
});

test("planEnsure asks before stopping another project, then stops it first once confirmed", () => {
  const other = active(baseline)[0];
  expect(planEnsure(sidecar, [other], cluster([]), false)).toEqual({ confirm: other });
  expect(planEnsure(sidecar, [other], cluster([]), true)).toEqual({ steps: [{ job: "stop", other }, { job: "apply" }, { job: "wait" }] });
});

test("planEnsure refuses a kind project while the cluster state is unknown", () => {
  expect(() => planEnsure(sidecar, [], null, false)).toThrow("cluster state is unknown");
});

test("phaseOf names each step for the Run button", () => {
  const other = active(baseline)[0];
  expect([{ job: "stop", other } as const, { job: "up" } as const, { job: "apply" } as const, { job: "start" } as const, { job: "wait" } as const].map(phaseOf))
    .toEqual(["Stopping 000…", "Creating Cluster…", "Starting Containers…", "Starting Containers…", "Waiting for Health…"]);
});

test("switchText names the running project and the one to start", () => {
  expect(switchText(active(baseline)[0], sidecar)).toEqual({
    title: "Stop 000 Baseline?",
    body: "Its containers are running. Stop them and start 001 Sidecar's? The cluster stays up.",
  });
  expect(switchText(active(sidecar)[0], baseline).title).toBe("Stop 001 Sidecar?");
});
