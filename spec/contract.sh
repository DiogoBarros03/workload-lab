#!/usr/bin/env bash
# `npm run contract -- <base-url>`. Runs the contract suite in the pinned node image.
set -euo pipefail

url="${1:-}"
[ -n "$url" ] || { echo "usage: npm run contract -- <base-url>" >&2; exit 2; }

# A server on the host is not on the container's localhost; podman exposes it under this name.
if [ ! -f /run/.containerenv ] && [ ! -f /.dockerenv ]; then
  url="${url//\/\/localhost/\/\/host.containers.internal}"
  url="${url//\/\/127.0.0.1/\/\/host.containers.internal}"
fi

exec bash scripts/container.sh docker.io/library/node:24 \
  sh -c "CONTRACT_BASE_URL='$url' exec npx --no-install vitest run --config spec/vitest.config.ts"
