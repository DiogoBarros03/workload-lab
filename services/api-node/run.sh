#!/usr/bin/env bash
# `npm run api` — build the api-node image and run it. API_PORT is the host port.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
port="${API_PORT:-8080}"

podman build -t workload-lab/api-node -f "$here/Containerfile" "$here"
exec podman run --rm -p "$port:8080" --name api-node workload-lab/api-node
