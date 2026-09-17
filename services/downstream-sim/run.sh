#!/usr/bin/env bash
# `npm run sim` — build the sim image and run it. SIM_PORT is the host port.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
port="${SIM_PORT:-8090}"

podman build -t workload-lab/downstream-sim -f "$here/Containerfile" "$here"
exec podman run --rm -p "$port:8080" --name downstream-sim workload-lab/downstream-sim
