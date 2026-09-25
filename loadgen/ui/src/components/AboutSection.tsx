const COLUMNS = [
  {
    title: "What runs",
    body: "One Fastify container with 0.5 CPU, 128 MiB and 10 database connections, and one Postgres container with 1 CPU and 256 MiB, serving a bookstore CRUD API. The load generator fires requests at a fixed rate whether or not earlier ones finished.",
  },
  {
    title: "Why",
    body: "This is the baseline with no pattern applied, so every later project can be measured against it. The point is to find which resource limits reads, which limits writes, and what happens past the limit.",
  },
  {
    title: "What to watch",
    body: "Reads push the api CPU bar. Writes fill the api pool and the +N waiting tag grows. When the queue grows faster than it drains, memory climbs to the limit and the kernel kills the api, which the ERROR pill and the banner show.",
  },
];

export function AboutSection() {
  return (
    <section aria-labelledby="about-title" className="flex flex-col gap-6">
      <h2 id="about-title" className="font-serif text-3xl text-ink">About</h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
        {COLUMNS.map((c) => (
          <div key={c.title} className="flex flex-col gap-2 border-t pt-4">
            <h3 className="font-serif text-xl text-ink">{c.title}</h3>
            <p className="text-sm">{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
