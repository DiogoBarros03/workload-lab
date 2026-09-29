import baselineJson from "../../../../results/000-baseline.json";
import sidecarJson from "../../../../results/001-sidecar.json";
import { parseBaseline, type Baseline } from "./baseline";

// Every recorded dataset a lesson can point at, keyed by its results/ file name.
const DATASETS: Record<string, Baseline> = {
  "000-baseline": parseBaseline(baselineJson),
  "001-sidecar": parseBaseline(sidecarJson),
};

export function datasetFor(key: string): Baseline {
  const d = DATASETS[key];
  if (d === undefined) throw new Error(`no measured dataset ${key}`);
  return d;
}
