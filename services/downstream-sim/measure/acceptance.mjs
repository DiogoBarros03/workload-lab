// The four C02 acceptance boxes, measured against a running sim. No deps, no framework.
const base = (process.argv[2] ?? "http://localhost:8090").replace(/\/$/, "");

const put = (body) =>
  fetch(`${base}/config`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const stats = () => fetch(`${base}/stats`).then((r) => r.json());
const resetStats = () => fetch(`${base}/stats`, { method: "DELETE" }).then((r) => r.json());

async function pool(total, concurrency, task) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < total) {
      next += 1;
      results.push(await task());
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

async function timedCall() {
  const start = performance.now();
  const response = await fetch(`${base}/call`);
  await response.arrayBuffer();
  return { ms: performance.now() - start, status: response.status };
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

async function box1Latency() {
  await put({ latency_ms: 100, jitter_ms: 20 });
  await resetStats();
  const samples = await pool(1000, 20, timedCall);
  const ms = samples.map((s) => s.ms);
  console.log(
    `box1 latency=100 jitter=20 n=${ms.length} p50=${percentile(ms, 50).toFixed(1)}ms ` +
      `p95=${percentile(ms, 95).toFixed(1)}ms min=${Math.min(...ms).toFixed(1)}ms ` +
      `max=${Math.max(...ms).toFixed(1)}ms`,
  );
}

async function box2ErrorRate() {
  await put({ error_rate: 0.2 });
  await resetStats();
  const samples = await pool(1000, 20, timedCall);
  const fivexx = samples.filter((s) => s.status >= 500).length;
  console.log(
    `box2 error_rate=0.2 n=${samples.length} 5xx=${fivexx} ` +
      `(${((fivexx / samples.length) * 100).toFixed(1)}%) stats=${JSON.stringify(await stats())}`,
  );
}

async function box3RateLimit() {
  await put({ rate_limit_rps: 50 });
  await resetStats();
  const samples = await pool(300, 100, timedCall);
  const counts = samples.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {});
  console.log(`box3 rate_limit_rps=50 n=${samples.length} by_status=${JSON.stringify(counts)}`);
}

async function box4Stats() {
  await put({});
  await resetStats();
  await pool(10, 1, timedCall);
  const after = await stats();
  const cleared = await resetStats();
  console.log(`box4 after_10_calls=${JSON.stringify(after)} after_delete=${JSON.stringify(cleared)}`);
}

await box1Latency();
await box2ErrorRate();
await box3RateLimit();
await box4Stats();
await put({});
