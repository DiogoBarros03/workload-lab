import Fastify from "fastify";
import type { ItemsRepo, ItemInput } from "./db.ts";

const itemBody = {
  type: "object",
  required: ["name", "quantity"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    quantity: { type: "integer", minimum: 0 },
  },
} as const;

const idParam = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "integer", minimum: 1 } },
} as const;

type IdReq = { Params: { id: number } };
type BodyReq = { Body: ItemInput };

export function buildApp(repo: ItemsRepo) {
  const app = Fastify({ logger: process.env.LOG_LEVEL !== "silent" });

  app.get("/health", async (_req, reply) => {
    try {
      await repo.ping();
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "db unreachable" });
    }
  });

  app.post<BodyReq>("/items", { schema: { body: itemBody } }, async (req, reply) => {
    const item = await repo.create(req.body);
    return reply.code(201).send(item);
  });

  app.get<IdReq>("/items/:id", { schema: { params: idParam } }, async (req, reply) => {
    const item = await repo.get(req.params.id);
    return item ?? reply.code(404).send({ error: "not found" });
  });

  app.put<IdReq & BodyReq>(
    "/items/:id",
    { schema: { params: idParam, body: itemBody } },
    async (req, reply) => {
      const item = await repo.update(req.params.id, req.body);
      return item ?? reply.code(404).send({ error: "not found" });
    },
  );

  app.delete<IdReq>("/items/:id", { schema: { params: idParam } }, async (req, reply) => {
    const item = await repo.remove(req.params.id);
    return item ? reply.code(204).send() : reply.code(404).send({ error: "not found" });
  });

  return app;
}
