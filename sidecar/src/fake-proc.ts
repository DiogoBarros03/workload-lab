import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Fake = { cmdline: string[]; schedstat?: string; status?: string };

// A fake /proc: one dir per pid plus non-pid entries the scan must skip.
export function fakeProc(procs: Record<number, Fake>) {
  const root = mkdtempSync(join(tmpdir(), "proc-"));
  mkdirSync(join(root, "self"));
  writeFileSync(join(root, "uptime"), "1.0 1.0\n");
  for (const [pid, p] of Object.entries(procs)) {
    mkdirSync(join(root, pid));
    writeFileSync(join(root, pid, "cmdline"), p.cmdline.map((a) => `${a}\0`).join(""));
    if (p.schedstat) writeFileSync(join(root, pid, "schedstat"), p.schedstat);
    if (p.status) writeFileSync(join(root, pid, "status"), p.status);
  }
  return root;
}

export const status = (kb: number) => `Name:\tnode\nVmPeak:\t 999999 kB\nVmRSS:\t   ${kb} kB\nThreads:\t7\n`;
