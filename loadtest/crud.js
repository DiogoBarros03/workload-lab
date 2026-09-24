import http from "k6/http";
import { check } from "k6";

// One iteration is a full bookstore cycle: 6 requests. RPS iterations per 6s == RPS req/s.
const RPS = Number(__ENV.RPS || 1);
const BASE = __ENV.BASE_URL || "http://api:3000";

export const options = {
  scenarios: {
    bookstore: {
      executor: "constant-arrival-rate",
      rate: RPS,
      timeUnit: "6s",
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

const RUN = String(Date.now() % 1000).padStart(3, "0");
const params = (op) => ({ tags: { op } });
const json = (op) => ({ headers: { "Content-Type": "application/json" }, tags: { op } });
// Unique per run, VU and iteration; 13 digits to satisfy the ISBN check.
const isbn = () => RUN + String(__VU).padStart(4, "0") + String(__ITER).padStart(6, "0");

export default function () {
  const author = http.post(`${BASE}/authors`, JSON.stringify({ name: "k6", country: "PT" }), json("create-author"));
  if (!check(author, { "author 201": (r) => r.status === 201 })) return;
  const authorId = author.json("id");

  const book = http.post(
    `${BASE}/books`,
    JSON.stringify({ author_id: authorId, title: "k6", isbn: isbn(), price_cents: 999 }),
    json("create-book"),
  );
  if (!check(book, { "book 201": (r) => r.status === 201 })) return;
  const bookId = book.json("id");

  check(http.get(`${BASE}/books/${bookId}`, params("read-book")), { "read 200": (r) => r.status === 200 });

  const updated = http.put(
    `${BASE}/books/${bookId}`,
    JSON.stringify({ author_id: authorId, title: "k6", isbn: book.json("isbn"), price_cents: 1099, stock: 3 }),
    json("update-book"),
  );
  check(updated, { "update 200": (r) => r.status === 200 });

  check(http.get(`${BASE}/authors/${authorId}/books`, params("list-books")), { "list 200": (r) => r.status === 200 });

  check(http.del(`${BASE}/authors/${authorId}`, null, params("delete-author")), { "delete 204": (r) => r.status === 204 });
}
