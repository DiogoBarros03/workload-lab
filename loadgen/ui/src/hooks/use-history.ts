import { useCallback, useEffect, useReducer } from "react";
import { entryOf, historyKey, historyReducer, loadHistory, saveHistory } from "@/lib/history";
import type { Result, RunConfig } from "@/lib/run";

// Touch localStorage lazily: the getter itself throws when storage is blocked.
const storage = {
  getItem: (k: string) => window.localStorage.getItem(k),
  setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
};

// Callers remount per project (keyed), so the key is fixed for this instance.
export function useHistory(projectId: string) {
  const key = historyKey(projectId);
  const [entries, dispatch] = useReducer(historyReducer, key, (k) => loadHistory(storage, k));
  useEffect(() => saveHistory(storage, key, entries), [key, entries]);
  const add = useCallback(
    (config: RunConfig, result: Result) => dispatch({ type: "add", entry: entryOf(config, result, Date.now()) }),
    [],
  );
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  return { entries, add, clear };
}
