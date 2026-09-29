import { readdirSync, readFileSync } from "node:fs";

// A process can exit between the directory scan and the read: that is not an error.
function readProc(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function findApiPids(procRoot: string, match: string, exclude: number): number[] {
  return readdirSync(procRoot)
    .filter((name) => /^\d+$/.test(name))
    .map(Number)
    .filter((pid) => pid !== exclude)
    .filter((pid) => (readProc(`${procRoot}/${pid}/cmdline`) ?? "").split("\0").join(" ").includes(match))
    .sort((a, b) => a - b);
}

// Field 1 of schedstat is nanoseconds on cpu, no clock-tick conversion needed.
function schedNanos(text: string, pid: number) {
  const first = text.trim().split(/\s+/)[0];
  if (!/^\d+$/.test(first)) throw new Error(`pid ${pid}: malformed schedstat "${text.trim()}"`);
  return Number(first);
}

function vmRssBytes(text: string, pid: number) {
  const kb = /^VmRSS:\s+(\d+) kB$/m.exec(text);
  if (!kb) throw new Error(`pid ${pid}: no VmRSS in status`);
  return Number(kb[1]) * 1024;
}

function sumOver(procRoot: string, pids: number[], file: string, parse: (t: string, pid: number) => number) {
  return sum(pids.map((pid) => {
    const text = readProc(`${procRoot}/${pid}/${file}`);
    return text === null ? 0 : parse(text, pid);
  }));
}

export const cpuNanos = (procRoot: string, pids: number[]) => sumOver(procRoot, pids, "schedstat", schedNanos);
export const rssBytes = (procRoot: string, pids: number[]) => sumOver(procRoot, pids, "status", vmRssBytes);
