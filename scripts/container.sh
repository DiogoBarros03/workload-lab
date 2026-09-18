#!/usr/bin/env bash
# Runs a command inside a pinned image. Passes through when already containerised (CI).
# CONTAINER_ENV names host vars to forward, so measure scripts stay env-parameterised.
set -euo pipefail

image="$1"
shift

if [ -f /run/.containerenv ] || [ -f /.dockerenv ]; then
  exec "$@"
fi

cache="workload-lab-cache-$(printf '%s' "$image" | tr -c 'a-zA-Z0-9' '-')"

forward=()
for name in $(env | sed -n 's/^\(MEASURE_[A-Z0-9_]*\)=.*/\1/p') ${CONTAINER_ENV:-}; do
  [ -n "${!name+x}" ] && forward+=(-e "$name=${!name}")
done

run() {
  podman run --rm -v "$PWD:/repo:Z" -w /repo -v "$cache:/cache" \
    -e npm_config_cache=/cache -e NUGET_PACKAGES=/cache "${forward[@]}" "$image" "$@"
}

case "$image" in
  *node:*) [ -d node_modules ] || run npm ci --no-audit --no-fund ;;
esac

run "$@"
