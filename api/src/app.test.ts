import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "./app.ts";
import { createStore } from "./db.ts";

// Live tier: runs against the real Postgres from compose, nothing faked.
process.env.LOG_LEVEL = "silent";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const app = buildApp(createStore(pool));

before(() => app.ready());
after(async () => {
  await app.close();
  await pool.end();
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
