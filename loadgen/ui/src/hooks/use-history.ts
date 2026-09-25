import { useCallback, useEffect, useReducer } from "react";
import { entryOf, historyReducer, loadHistory, saveHistory } from "@/lib/history";
import type { Result, RunConfig } from "@/lib/run";

// Touch localStorage lazily: the getter itself throws when storage is blocked.
const storage = {
  getItem: (k: string) => window.localStorage.getItem(k),
  setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
};

export function useHistory() {
  const [entries, dispatch] = useReducer(historyReducer, storage, loadHistory);
  useEffect(() => saveHistory(storage, entries), [entries]);
  const add = useCallback(
    (config: RunConfig, result: Result) => dispatch({ type: "add", entry: entryOf(config, result, Date.now()) }),
    [],
  );
  const clear = useCallback(() => dispatch({ type: "clear" }), []);
  return { entries, add, clear };
}
