#!/usr/bin/env bash
# Runs a command inside a pinned image. Passes through when already containerised (CI).
set -euo pipefail

image="$1"
shift

if [ -f /run/.containerenv ] || [ -f /.dockerenv ]; then
  exec "$@"
fi

cache="workload-lab-cache-$(printf '%s' "$image" | tr -c 'a-zA-Z0-9' '-')"

run() {
  podman run --rm -v "$PWD:/repo:Z" -w /repo -v "$cache:/cache" \
    -e npm_config_cache=/cache -e NUGET_PACKAGES=/cache "$image" "$@"
}

case "$image" in
  *node:*) [ -d node_modules ] || run npm ci --no-audit --no-fund ;;
esac

run "$@"
