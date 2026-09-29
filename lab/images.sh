#!/usr/bin/env bash
# Build the api and sidecar images and load them plus postgres into kind cluster "lab".
# Usage: lab/images.sh build|load|all [tag]   (api tag defaults to 000)
set -euo pipefail

export KIND_EXPERIMENTAL_PROVIDER=podman
readonly ROOT="$(dirname "$(readlink -f "$0")")/.."
readonly TAG=${2:-000}
readonly API="docker.io/library/lab-api:$TAG"  # k8s reads lab-api:TAG as this name
readonly SIDECAR=docker.io/library/lab-sidecar:001
readonly PG=docker.io/library/postgres:16-alpine

step() { echo "==> $*"; }

build() {
  step "building $API"; podman build -t "$API" "$ROOT/api"
  step "building $SIDECAR"; podman build -t "$SIDECAR" "$ROOT/sidecar"
}

load_one() {
  local tar
  tar=$(mktemp --suffix=.tar)
  step "loading $1 into lab"
  rm -f "$tar"; podman save "$1" -o "$tar"
  kind load image-archive "$tar" --name lab
  rm -f "$tar"
}

load() {
  podman image exists "$PG" || podman pull "$PG"
  load_one "$API"
  load_one "$SIDECAR"
  load_one "$PG"
}

case "${1:-}" in
  build) build ;;
  load) load ;;
  all) build; load ;;
  *) echo "usage: $0 build|load|all [tag]" >&2; exit 2 ;;
esac
