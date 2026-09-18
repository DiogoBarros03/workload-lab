import { buildSim } from "./app.ts";

await buildSim().listen({ port: Number(process.env.PORT ?? 8080), host: "0.0.0.0" });
