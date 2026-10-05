#!/usr/bin/env bash
# Type-check and compile TypeScript into dist/.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

npm run typecheck
npm run build

echo "Build finished -> dist/"
