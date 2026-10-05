#!/usr/bin/env bash
# Run all quality gates: type-check, lint and format check.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

npm run typecheck
npm run lint
npm run format:check

echo "All checks passed."
