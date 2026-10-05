# Telegram Bot

Node.js + TypeScript + [grammY](https://grammy.dev) bot.

## Requirements

- Node.js 20.11+
- A bot token from [@BotFather](https://t.me/BotFather)

## Quick start

```bash
./scripts/dev.sh          # creates .env on first run
# edit .env and set BOT_TOKEN
./scripts/dev.sh          # start in watch mode

## Health check

The process exposes an HTTP endpoint for platform probes.

| Path | Meaning | Success | Failure |
| --- | --- | --- | --- |
| GET /health /healthz /livez | liveness — process is up | 200 | — |
| GET /ready /readyz /health/ready | readiness — Telegram reachable | 200 | 503 |

Readiness is backed by a background heartbeat that pings getMe() on
HEALTH_HEARTBEAT_MS. If it goes stale (3x interval), /ready starts returning
503 so your platform can recycle the instance.

### Environment

| Variable | Default | Description |
| --- | --- | --- |
| HEALTH_ENABLED | true | Toggle the HTTP health server |
| HEALTH_HOST | 0.0.0.0 | Bind address |
| HEALTH_PORT | $PORT or 3000 | Bind port |
| HEALTH_HEARTBEAT_MS | 30000 | Telegram ping interval (ms) |

### Quick check

    ./scripts/health.sh          # liveness
    ./scripts/health.sh ready    # readiness
