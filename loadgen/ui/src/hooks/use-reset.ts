import { useCallback, useState } from "react";

type ResetState = { busy: boolean; note: string | null; error: string | null };

export function useReset() {
  const [state, setState] = useState<ResetState>({ busy: false, note: null, error: null });
  const reset = useCallback(async () => {
    setState({ busy: true, note: null, error: null });
    try {
      const res = await fetch("/reset", { method: "POST" });
      const body = (await res.json()) as { deleted?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? `reset answered ${res.status}`);
      setState({ busy: false, note: `Deleted ${body.deleted} authors and their books.`, error: null });
    } catch (err) {
      setState({ busy: false, note: null, error: err instanceof Error ? err.message : String(err) });
    }
  }, []);
  return { ...state, reset };
}
