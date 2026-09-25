import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";
import { buildApp } from "./app.ts";
import { createStore } from "./db.ts";

// Live tier: runs against the real Postgres from compose, nothing faked.
process.env.LOG_LEVEL = "silent";
// Two pools as in server.ts: traffic, and a one-connection admin pool.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adminPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const app = buildApp(createStore(pool, adminPool));

before(() => app.ready());
after(async () => {
  await app.close();
  await Promise.all([pool.end(), adminPool.end()]);
});

const json = (r: { body: string }) => JSON.parse(r.body);
const isbn = () => String(Date.now()).padStart(13, "9").slice(-13);
const post = (url: string, payload: object) => app.inject({ method: "POST", url, payload });
const newAuthor = async () => json(await post("/authors", { name: "Ursula K. Le Guin" })).id;

test("health reports ok when the database answers", async () => {
  const r = await app.inject({ method: "GET", url: "/health" });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(json(r), { status: "ok" });
});

test("stats reports this container's cgroup cpu and memory", async () => {
  const r = await app.inject({ method: "GET", url: "/stats" });
  assert.equal(r.statusCode, 200);
  const s = json(r);
  assert.ok(Number.isInteger(s.cpuUsageUsec) && s.cpuUsageUsec > 0, String(s.cpuUsageUsec));
  assert.ok(Number.isInteger(s.memCurrentBytes) && s.memCurrentBytes > 0, String(s.memCurrentBytes));
  assert.ok(Math.abs(s.sampledAtMs - Date.now()) < 5000);
});

test("stats adds postgres load counters and the pg pool", async () => {
  const s = json(await app.inject({ method: "GET", url: "/stats" }));
  assert.ok(Number.isInteger(s.db.maxConnections) && s.db.maxConnections >= 1, String(s.db.maxConnections));
  assert.ok(s.db.clientBackends >= 1, String(s.db.clientBackends));
  assert.equal(typeof s.db.xactCommit, "number");
  assert.equal(typeof s.db.blksHit, "number");
  assert.ok(Math.abs(s.db.sampledAtMs - Date.now()) < 5000);
  assert.equal(s.pool.max, 10);
  assert.deepEqual(Object.keys(s.pool).toSorted(), ["idle", "max", "total", "waiting"]);
});

test("stats still answers 200 with db null when the load query fails", async () => {
  const broken = buildApp({ ...createStore(pool, adminPool), dbLoad: () => Promise.reject(new Error("down")) });
  const r = await broken.inject({ method: "GET", url: "/stats" });
  await broken.close();
  assert.equal(r.statusCode, 200);
  assert.equal(json(r).db, null);
  assert.ok(json(r).cpuUsageUsec > 0);
  assert.equal(json(r).pool.max, 10);
});

const within = <T>(ms: number, p: Promise<T>) =>
  Promise.race([p, sleep(ms).then(() => Promise.reject(new Error(`no answer within ${ms} ms`)))]);

test("health and stats answer within 500 ms while the traffic pool is fully checked out", async () => {
  const max = pool.options.max;
  const held = await Promise.all(Array.from({ length: max }, () => pool.connect()));
  try {
    const health = await within(500, app.inject({ method: "GET", url: "/health" }));
    assert.equal(health.statusCode, 200);
    assert.deepEqual(json(health), { status: "ok" });
    const stats = json(await within(500, app.inject({ method: "GET", url: "/stats" })));
    assert.equal(typeof stats.db.xactCommit, "number");
    assert.deepEqual(stats.pool, { max, total: max, idle: 0, waiting: 0 });
  } finally {
    held.forEach((c) => c.release());
  }
});

test("author lifecycle: create, read, update, delete", async () => {
  const created = await post("/authors", { name: "Octavia Butler", country: "US" });
  assert.equal(created.statusCode, 201);
  const { id } = json(created);

  const read = await app.inject({ method: "GET", url: `/authors/${id}` });
  assert.equal(read.statusCode, 200);
  assert.equal(json(read).country, "US");

  const updated = await app.inject({
    method: "PUT",
    url: `/authors/${id}`,
    payload: { name: "Octavia E. Butler", country: "US" },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(json(updated).name, "Octavia E. Butler");

  assert.equal((await app.inject({ method: "DELETE", url: `/authors/${id}` })).statusCode, 204);
  assert.equal((await app.inject({ method: "GET", url: `/authors/${id}` })).statusCode, 404);
});

test("book lifecycle under an author, listed via the author", async () => {
  const authorId = await newAuthor();
  const created = await post("/books", {
    author_id: authorId,
    title: "The Dispossessed",
    isbn: isbn(),
    price_cents: 1299,
  });
  assert.equal(created.statusCode, 201);
  const book = json(created);
  assert.equal(book.stock, 0);

  const listed = await app.inject({ method: "GET", url: `/authors/${authorId}/books` });
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(json(listed).map((b: { id: number }) => b.id), [book.id]);

  const updated = await app.inject({
    method: "PUT",
    url: `/books/${book.id}`,
    payload: { ...book, stock: 7 },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(json(updated).stock, 7);

  assert.equal((await app.inject({ method: "DELETE", url: `/books/${book.id}` })).statusCode, 204);
  assert.equal((await app.inject({ method: "GET", url: `/books/${book.id}` })).statusCode, 404);
});

test("deleting an author cascades to their books", async () => {
  const authorId = await newAuthor();
  const { id } = json(await post("/books", { author_id: authorId, title: "t", isbn: isbn(), price_cents: 1 }));
  await app.inject({ method: "DELETE", url: `/authors/${authorId}` });
  assert.equal((await app.inject({ method: "GET", url: `/books/${id}` })).statusCode, 404);
});

test("database constraints surface as client errors", async () => {
  const authorId = await newAuthor();
  const code = isbn();
  const book = { author_id: authorId, title: "t", isbn: code, price_cents: 1 };
  assert.equal((await post("/books", book)).statusCode, 201);
  assert.equal((await post("/books", book)).statusCode, 409, "duplicate isbn");
  assert.equal((await post("/books", { ...book, isbn: isbn(), author_id: 2_000_000_000 })).statusCode, 404, "unknown author");
  assert.equal((await app.inject({ method: "GET", url: "/authors/2000000000/books" })).statusCode, 404);
});

test("invalid input is rejected with 400 before touching the database", async () => {
  const bad = [
    ["/authors", { name: "" }],
    ["/authors", {}],
    ["/books", { author_id: 1, title: "t", isbn: "123", price_cents: 1 }],
    ["/books", { author_id: 1, title: "t", isbn: isbn(), price_cents: -1 }],
    ["/books", { author_id: 1, title: "t", isbn: isbn(), price_cents: 1.5 }],
  ] as const;
  for (const [url, payload] of bad) {
    assert.equal((await post(url, payload)).statusCode, 400, JSON.stringify(payload));
  }
  assert.equal((await app.inject({ method: "GET", url: "/books/abc" })).statusCode, 400);
});

test("delete with a json content-type and no body is a 400, not a 500", async () => {
  const r = await app.inject({
    method: "DELETE",
    url: "/authors/1",
    headers: { "content-type": "application/json" },
  });
  assert.equal(r.statusCode, 400);
});

test("list authors filters by exact name, ordered by id, default limit 100", async () => {
  const name = `list-${Date.now()}`;
  const made = await Promise.all(Array.from({ length: 101 }, () => post("/authors", { name })));
  const ids = made.map((r) => json(r).id as number).toSorted((a, b) => a - b);
  const other = json(await post("/authors", { name: `${name}-other` })).id as number;
  const get = (qs: string) => app.inject({ method: "GET", url: `/authors?${qs}` });

  const all = await get(`name=${name}`);
  assert.equal(all.statusCode, 200);
  assert.deepEqual(json(all).map((a: { id: number }) => a.id), ids.slice(0, 100));
  assert.ok(json(all).every((a: { name: string }) => a.name === name));

  const two = json(await get(`name=${name}&limit=2`));
  assert.deepEqual(two.map((a: { id: number }) => a.id), ids.slice(0, 2));
  const unfiltered = json(await get("limit=3")).map((a: { id: number }) => a.id);
  assert.equal(unfiltered.length, 3);
  assert.deepEqual(unfiltered, unfiltered.toSorted((a: number, b: number) => a - b));

  for (const qs of ["limit=0", "limit=1001", "limit=abc", "name=", `name=${"x".repeat(201)}`]) {
    assert.equal((await get(qs)).statusCode, 400, qs);
  }
  await Promise.all([...ids, other].map((id) => app.inject({ method: "DELETE", url: `/authors/${id}` })));
});

test("with the database unreachable: health 503, stats 200 with db null, writes 503", async () => {
  // Port 1 on loopback: nothing listens, so every connect is refused.
  const dead = "postgres://app:app@127.0.0.1:1/app";
  const deadPool = new pg.Pool({ connectionString: dead });
  const deadAdmin = new pg.Pool({ connectionString: dead, max: 1 });
  const down = buildApp(createStore(deadPool, deadAdmin));
  try {
    const health = await down.inject({ method: "GET", url: "/health" });
    assert.deepEqual([health.statusCode, json(health)], [503, { status: "db unreachable" }]);
    const stats = await down.inject({ method: "GET", url: "/stats" });
    assert.deepEqual([stats.statusCode, json(stats).db], [200, null]);
    const write = await down.inject({ method: "POST", url: "/authors", payload: { name: "x" } });
    assert.deepEqual([write.statusCode, json(write)], [503, { error: "database unavailable" }]);
    const read = await down.inject({ method: "GET", url: "/authors/1" });
    assert.deepEqual([read.statusCode, json(read)], [503, { error: "database unavailable" }]);
  } finally {
    await down.close();
    await Promise.all([deadPool.end(), deadAdmin.end()]);
  }
});

test("the process is still serving after the unreachable-database test", async () => {
  const r = await app.inject({ method: "GET", url: "/health" });
  assert.deepEqual([r.statusCode, json(r)], [200, { status: "ok" }]);
});
