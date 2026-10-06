#!/usr/bin/env bash
set -euo pipefail
verification_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec node "$verification_root/scripts/verification/run.mjs" "$@"
