import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { Store, AuthorInput, BookInput } from "./db.ts";
import { readCgroup } from "./cgroup.ts";

const authorBody = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    country: { type: "string", maxLength: 100, default: "" },
  },
} as const;

const bookBody = {
  type: "object",
  required: ["author_id", "title", "isbn", "price_cents"],
  properties: {
    author_id: { type: "integer", minimum: 1 },
    title: { type: "string", minLength: 1, maxLength: 300 },
    isbn: { type: "string", pattern: "^[0-9]{13}$" },
    price_cents: { type: "integer", minimum: 0 },
    stock: { type: "integer", minimum: 0, default: 0 },
  },
} as const;

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "integer", minimum: 1 } },
} as const;

const listQuery = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
  },
} as const;

type IdReq = { Params: { id: number } };
type ListReq = { Querystring: { name?: string; limit: number } };

// Postgres error codes that map to a client-visible status.
const PG_STATUS: Record<string, [number, string]> = {
  "23505": [409, "already exists"],
  "23503": [404, "author not found"],
  "23514": [400, "constraint violated"],
};

type Repo<T, In> = {
  create: (i: In) => Promise<T | null>;
  get: (id: number) => Promise<T | null>;
  update: (id: number, i: In) => Promise<T | null>;
  remove: (id: number) => Promise<unknown>;
};

function registerCrud<T, In>(app: FastifyInstance, path: string, repo: Repo<T, In>, body: object) {
  const notFound = { error: "not found" };
  app.post<{ Body: In }>(path, { schema: { body } }, async (req, reply) =>
    reply.code(201).send(await repo.create(req.body as In)),
  );
  app.get<IdReq>(`${path}/:id`, { schema: { params: idParam } }, async (req, reply) => {
    return (await repo.get(req.params.id)) ?? reply.code(404).send(notFound);
  });
  app.put<IdReq & { Body: In }>(
    `${path}/:id`,
    { schema: { params: idParam, body } },
    async (req, reply) => {
      return (await repo.update(req.params.id, req.body as In)) ?? reply.code(404).send(notFound);
    },
  );
  app.delete<IdReq>(`${path}/:id`, { schema: { params: idParam } }, async (req, reply) => {
    const gone = await repo.remove(req.params.id);
    return gone ? reply.code(204).send() : reply.code(404).send(notFound);
  });
}

export function buildApp(store: Store) {
  const app = Fastify({ logger: process.env.LOG_LEVEL !== "silent" });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    const mapped = PG_STATUS[String(err.code)];
    if (mapped) return reply.code(mapped[0]).send({ error: mapped[1] });
    const status = err.statusCode ?? 500;
    if (status < 500) return reply.code(status).send({ error: err.message });
    req.log.error(err);
    return reply.code(500).send({ error: "internal error" });
  });

  app.get("/health", async (_req, reply) => {
    try {
      await store.ping();
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "db unreachable" });
    }
  });

  app.get("/stats", async () => readCgroup());

  registerCrud<unknown, AuthorInput>(app, "/authors", store.authors, authorBody);
  registerCrud<unknown, BookInput>(app, "/books", store.books, bookBody);

  app.get<ListReq>("/authors", { schema: { querystring: listQuery } }, async (req) =>
    store.listAuthors(req.query),
  );

  app.get<IdReq>("/authors/:id/books", { schema: { params: idParam } }, async (req, reply) => {
    const author = await store.authors.get(req.params.id);
    if (!author) return reply.code(404).send({ error: "not found" });
    return store.booksByAuthor(req.params.id);
  });

  return app;
}
