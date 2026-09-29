#!/usr/bin/env bash
# Local Kubernetes cluster "lab" on rootless podman, from lab/kind.yaml.
# Usage: lab/cluster.sh up | down | status | load-image <image:tag>
set -euo pipefail

export KIND_EXPERIMENTAL_PROVIDER=podman
readonly NAME=lab
readonly CONFIG="$(dirname "$(readlink -f "$0")")/kind.yaml"
readonly CTX="kind-$NAME"

step() { echo "==> $*"; }

# kind 0.32 `get clusters` fails on podman 6 (its ps template indexes .Labels as a map);
# `get nodes` filters by label and works, printing nothing on stdout when the cluster is absent.
exists() { local out; out=$(kind get nodes --name "$NAME" 2>/dev/null); [[ -n $out ]]; }

create() {
  local log
  log=$(mktemp)
  if kind create cluster --name "$NAME" --config "$CONFIG" 2>&1 | tee "$log"; then
    rm -f "$log"; return 0
  fi
  if ! grep -q 'Delegate=yes' "$log"; then rm -f "$log"; return 1; fi
  rm -f "$log"
  step "retrying under systemd-run with Delegate=yes"
  systemd-run --scope --user -p Delegate=yes \
    kind create cluster --name "$NAME" --config "$CONFIG"
}

up() {
  if exists; then step "cluster $NAME exists"; else step "creating cluster $NAME"; create; fi
  step "waiting for nodes Ready"
  kubectl --context "$CTX" wait --for=condition=Ready nodes --all --timeout=180s
}

down() {
  if exists; then step "deleting cluster $NAME"; kind delete cluster --name "$NAME"
  else step "cluster $NAME absent"; fi
}

status() {
  exists || { echo "cluster $NAME is not running" >&2; return 1; }
  kubectl --context "$CTX" get nodes
  kubectl --context "$CTX" get pods -A --no-headers \
    | awk '{n++; s[$4]++} END {printf "pods: %d", n; for (k in s) printf ", %s %d", k, s[k]; print ""}'
}

load_image() {
  [[ $# -eq 1 ]] || { echo "usage: $0 load-image <image:tag>" >&2; return 2; }
  local image=$1
  exists || { echo "cluster $NAME is not running" >&2; return 1; }
  tar=$(mktemp --suffix=.tar)
  trap 'rm -f "$tar"' EXIT
  step "saving $image"
  rm -f "$tar"; podman save "$image" -o "$tar"
  step "loading $image into $NAME"
  kind load image-archive "$tar" --name "$NAME"
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  status) status ;;
  load-image) shift; load_image "$@" ;;
  *) echo "usage: $0 up|down|status|load-image <image:tag>" >&2; exit 2 ;;
esac
