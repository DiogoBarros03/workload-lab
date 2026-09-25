// Inline outcome line; errors in pale red, never an alert().
export function Notice({ error, note }: { error: string | null; note: string | null }) {
  if (error) return <p role="alert" className="rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">{error}</p>;
  if (note) return <p role="status" className="text-sm text-muted-foreground">{note}</p>;
  return null;
}
