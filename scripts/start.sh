#!/usr/bin/env bash
# Run the compiled bot (production).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -d dist ]; then
  echo "No dist/ directory found. Run ./scripts/build.sh first."
  exit 1
fi

exec npm run start
