const PLANS = {
  up: "podman play kube deploy/local/<variant>.yaml — arrives in C16",
  load: "run the autocannon <profile> against <url>, summary to results/raw/ — arrives in C07",
  k8s: "kubectl apply -k deploy/k8s/overlays/<variant> — arrives in C17",
};

const [target, ...args] = process.argv.slice(2);
console.log(`[stub] npm run ${target}${args.length ? ` -- ${args.join(" ")}` : ""}`);
console.log(`[stub] will eventually: ${PLANS[target] ?? "unknown target"}`);
