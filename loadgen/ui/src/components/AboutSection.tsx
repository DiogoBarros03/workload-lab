const SUMMARY =
  "A bookstore CRUD API runs in one Fastify container with 0.5 CPU, 128 MiB and 10 database connections, backed by one Postgres container. Requests arrive at a fixed rate whether or not earlier ones finished. No pattern is applied, so every later project is measured against this one. Watch reads push the api CPU, writes queue for the pool, and memory climb until the kernel kills the api.";

const COLUMNS = [
  { title: "What runs", line: "One API container, one Postgres container, 10 connections." },
  { title: "Why", line: "The baseline every later project is measured against." },
  { title: "What to watch", line: "CPU on reads, pool queue on writes, memory before a kill." },
];

export function AboutSection() {
  return (
    <section aria-labelledby="about-title" className="flex flex-col gap-6">
      <h2 id="about-title" className="font-serif text-3xl text-ink">About</h2>
      <p className="max-w-prose">{SUMMARY}</p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
        {COLUMNS.map((c) => (
          <div key={c.title} className="flex flex-col gap-2 border-t pt-4">
            <h3 className="font-serif text-title text-ink">{c.title}</h3>
            <p className="text-label text-muted-foreground">{c.line}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
