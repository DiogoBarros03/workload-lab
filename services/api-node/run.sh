#!/usr/bin/env bash
# `npm run api` — build the api-node image and run it. API_PORT is the host port.
# Knobs set in the caller's environment are forwarded, so `RETRY_MAX=3 npm run api` works.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
port="${API_PORT:-8080}"

# The sim is published on the host, and the api's own localhost is not the host's.
forward=(-e "DOWNSTREAM_URL=${DOWNSTREAM_URL:-http://host.containers.internal:${SIM_PORT:-8090}}")
for name in LOG_LEVEL GRACEFUL_SHUTDOWN_MS DOWNSTREAM_TIMEOUT_MS RETRY_MAX RETRY_BACKOFF_MS \
            BREAKER BREAKER_FAILURE_THRESHOLD BREAKER_RESET_MS; do
  [ -n "${!name+x}" ] && forward+=(-e "$name=${!name}")
done

podman build -t workload-lab/api-node -f "$here/Containerfile" "$here"
exec podman run --rm -p "$port:8080" "${forward[@]}" --name api-node workload-lab/api-node
