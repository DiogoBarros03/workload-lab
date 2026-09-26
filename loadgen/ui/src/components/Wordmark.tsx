import { HOME_HREF } from "@/lib/projects";

export function Wordmark() {
  return (
    <div>
      <a href={HOME_HREF} className="rounded-sm font-serif text-3xl text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring">Load lab</a>
      <p className="mt-1 text-meta text-muted-foreground">One API, one database, real limits.</p>
    </div>
  );
}
