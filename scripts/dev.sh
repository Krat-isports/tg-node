#!/usr/bin/env bash
# Start the bot in watch mode (auto-restart on file changes).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — put your BOT_TOKEN in it, then run this script again."
  exit 1
fi

exec npm run dev
