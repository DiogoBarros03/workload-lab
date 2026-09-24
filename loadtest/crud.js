import http from "k6/http";
import { check } from "k6";

// One iteration is a full CRUD cycle: 4 requests. RPS iterations per 4s == RPS req/s.
const RPS = Number(__ENV.RPS || 1);
const BASE = __ENV.BASE_URL || "http://api:3000";

export const options = {
  scenarios: {
    crud: {
      executor: "constant-arrival-rate",
      rate: RPS,
      timeUnit: "4s",
      duration: __ENV.DURATION || "30s",
      preAllocatedVUs: Math.max(4, Math.ceil(RPS / 4)),
      maxVUs: Math.max(50, RPS * 2),
    },
  },
  summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(99)<500"],
  },
};

const headers = { "Content-Type": "application/json" };

export default function () {
  const created = http.post(`${BASE}/items`, JSON.stringify({ name: "k6", quantity: 1 }), {
    headers,
    tags: { op: "create" },
  });
  const ok = check(created, { "create 201": (r) => r.status === 201 });
  if (!ok) return;
  const id = created.json("id");

  const read = http.get(`${BASE}/items/${id}`, { tags: { op: "read" } });
  check(read, { "read 200": (r) => r.status === 200 });

  const updated = http.put(`${BASE}/items/${id}`, JSON.stringify({ name: "k6", quantity: 2 }), {
    headers,
    tags: { op: "update" },
  });
  check(updated, { "update 200": (r) => r.status === 200 });

  const deleted = http.del(`${BASE}/items/${id}`, null, { tags: { op: "delete" } });
  check(deleted, { "delete 204": (r) => r.status === 204 });
}
