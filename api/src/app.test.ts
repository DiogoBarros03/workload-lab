import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "./app.ts";
import { createItemsRepo } from "./db.ts";

// Live tier: runs against the real Postgres from compose, nothing faked.
process.env.LOG_LEVEL = "silent";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const app = buildApp(createItemsRepo(pool));

before(() => app.ready());
after(async () => {
  await app.close();
  await pool.end();
});

const json = (r: { body: string }) => JSON.parse(r.body);

test("health reports ok when the database answers", async () => {
  const r = await app.inject({ method: "GET", url: "/health" });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(json(r), { status: "ok" });
});

test("full lifecycle: create, read, update, delete", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/items",
    payload: { name: "widget", quantity: 3 },
  });
  assert.equal(created.statusCode, 201);
  const { id } = json(created);
  assert.ok(Number.isInteger(id));

  const read = await app.inject({ method: "GET", url: `/items/${id}` });
  assert.equal(read.statusCode, 200);
  assert.equal(json(read).name, "widget");

  const updated = await app.inject({
    method: "PUT",
    url: `/items/${id}`,
    payload: { name: "gadget", quantity: 5 },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(json(updated).quantity, 5);
  assert.notEqual(json(updated).updated_at, json(created).updated_at);

  const deleted = await app.inject({ method: "DELETE", url: `/items/${id}` });
  assert.equal(deleted.statusCode, 204);

  const gone = await app.inject({ method: "GET", url: `/items/${id}` });
  assert.equal(gone.statusCode, 404);
});

test("unknown id answers 404 on read, update and delete", async () => {
  const id = 2_000_000_000;
  for (const method of ["GET", "DELETE"] as const) {
    const r = await app.inject({ method, url: `/items/${id}` });
    assert.equal(r.statusCode, 404, method);
  }
  const r = await app.inject({
    method: "PUT",
    url: `/items/${id}`,
    payload: { name: "x", quantity: 1 },
  });
  assert.equal(r.statusCode, 404);
});

test("invalid input is rejected with 400 before touching the database", async () => {
  const cases = [
    { name: "", quantity: 1 },
    { name: "x", quantity: -1 },
    { name: "x", quantity: 1.5 },
    { name: "x" },
  ];
  for (const payload of cases) {
    const r = await app.inject({ method: "POST", url: "/items", payload });
    assert.equal(r.statusCode, 400, JSON.stringify(payload));
  }
  const badId = await app.inject({ method: "GET", url: "/items/abc" });
  assert.equal(badId.statusCode, 400);
});

test("unknown fields are stripped, not stored", async () => {
  const r = await app.inject({
    method: "POST",
    url: "/items",
    payload: { name: "x", quantity: 1, extra: true },
  });
  assert.equal(r.statusCode, 201);
  assert.equal("extra" in json(r), false);
});
