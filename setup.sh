#!/usr/bin/env bash
#
# setup.sh — scaffold a production-ready Telegram bot
# Stack: Node.js 20+ · TypeScript · grammY · zod · pino
#
# Usage:
#   bash setup.sh            # creates ./telegram-bot
#   bash setup.sh my-bot     # creates ./my-bot
#
set -euo pipefail

PROJECT_NAME="${1:-telegram-bot}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$ROOT_DIR/$PROJECT_NAME"

info() { printf '\033[1;34m›\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✖\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight --
command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node.js 20 or newer."
command -v npm  >/dev/null 2>&1 || die "npm not found."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js 20+ required (found $(node -v))."
fi

if [ -e "$APP_DIR" ]; then
  die "'$APP_DIR' already exists. Remove it or pass a different project name."
fi

info "Creating project at $APP_DIR"

mkdir -p \
  "$APP_DIR/src/bot/commands" \
  "$APP_DIR/src/bot/middlewares" \
  "$APP_DIR/src/config" \
  "$APP_DIR/src/utils" \
  "$APP_DIR/scripts"

write() { mkdir -p "$(dirname "$1")"; cat > "$1"; }

# ============================================================ project files ==

write "$APP_DIR/package.json" <<'EOF'
{
  "name": "telegram-bot",
  "version": "0.1.0",
  "description": "Telegram bot built with Node.js, TypeScript and grammY",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20.11.0"
  },
  "scripts": {
    "dev": "tsx watch --clear-screen=false src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node --enable-source-maps dist/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "grammy": "^1.30.0",
    "pino": "^9.4.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@eslint/js": "^9.12.0",
    "@types/node": "^22.7.4",
    "eslint": "^9.12.0",
    "pino-pretty": "^11.2.2",
    "prettier": "^3.3.3",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "typescript-eslint": "^8.8.1"
  }
}
EOF

write "$APP_DIR/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "sourceMap": true,
    "declaration": false,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
EOF

write "$APP_DIR/eslint.config.js" <<'EOF'
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      eqeqeq: ['error', 'always'],
    },
  },
);
EOF

write "$APP_DIR/.prettierrc" <<'EOF'
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
EOF

write "$APP_DIR/.gitignore" <<'EOF'
node_modules/
dist/
coverage/
*.log
.env
.env.*
!.env.example
.DS_Store
.vscode/
.idea/
EOF

write "$APP_DIR/.env.example" <<'EOF'
# Telegram bot token from @BotFather
BOT_TOKEN=

# development | test | production
NODE_ENV=development

# fatal | error | warn | info | debug | trace | silent
LOG_LEVEL=debug

# Comma separated Telegram user ids with admin rights (optional)
ADMIN_IDS=
EOF

# =============================================================== source code ==

write "$APP_DIR/src/config/env.ts" <<'EOF'
import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralised, validated environment configuration.
 * The process refuses to boot on invalid config — fail fast, fail loud.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  BOT_TOKEN: z
    .string()
    .regex(/^\d+:[A-Za-z0-9_-]{30,}$/u, 'does not look like a Telegram bot token'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  ADMIN_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
        .map((id) => Number(id)),
    )
    .refine(
      (ids) => ids.every((id) => Number.isSafeInteger(id)),
      'must be a comma separated list of numeric user ids',
    ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  console.error(
    `\nInvalid environment configuration:\n${issues}\n\nCheck your .env file (see .env.example).\n`,
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

/** True when the given Telegram user id belongs to an admin. */
export function isAdmin(userId: number | undefined): boolean {
  return userId !== undefined && env.ADMIN_IDS.includes(userId);
}
EOF

write "$APP_DIR/src/utils/logger.ts" <<'EOF'
import { pino } from 'pino';
import { env } from '../config/env.js';

const isDevelopment = env.NODE_ENV === 'development';

/**
 * Single application logger. Pretty-printed locally, structured JSON in prod.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});
EOF

write "$APP_DIR/src/bot/context.ts" <<'EOF'
import type { Context } from 'grammy';

/**
 * Shared context type for every handler.
 * Extend this (session, user record, i18n, …) as the bot grows.
 */
export type BotContext = Context;
EOF

write "$APP_DIR/src/bot/middlewares/logger.ts" <<'EOF'
import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '../context.js';
import { logger } from '../../utils/logger.js';

/** Logs every incoming update with timing information. */
export const requestLogger: MiddlewareFn<BotContext> = async (ctx, next) => {
  const startedAt = Date.now();
  const updateType = Object.keys(ctx.update).find((key) => key !== 'update_id') ?? 'unknown';

  await next();

  logger.debug(
    {
      updateId: ctx.update.update_id,
      updateType,
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
      durationMs: Date.now() - startedAt,
    },
    'update handled',
  );
};
EOF

write "$APP_DIR/src/bot/middlewares/error.ts" <<'EOF'
import { GrammyError, HttpError } from 'grammy';
import type { BotError } from 'grammy';
import type { BotContext } from '../context.js';
import { logger } from '../../utils/logger.js';

const FRIENDLY_MESSAGE = '⚠️ Something went wrong on my side. Please try again in a moment.';

/** Global error handler — never lets an exception kill the polling loop. */
export async function errorHandler(err: BotError<BotContext>): Promise<void> {
  const { ctx, error } = err;
  const updateType = Object.keys(ctx.update).find((key) => key !== 'update_id') ?? 'unknown';
  const meta = { updateId: ctx.update.update_id, updateType, userId: ctx.from?.id };

  if (error instanceof GrammyError) {
    logger.error({ ...meta, errorCode: error.error_code, description: error.description }, 'telegram api error');
  } else if (error instanceof HttpError) {
    logger.error({ ...meta, err: error }, 'network error while calling the telegram api');
  } else {
    logger.error({ ...meta, err: error }, 'unexpected error while handling update');
  }

  try {
    await ctx.reply(FRIENDLY_MESSAGE);
  } catch {
    // The chat may be unreachable — nothing else we can do here.
  }
}
EOF

write "$APP_DIR/src/bot/middlewares/index.ts" <<'EOF'
import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { requestLogger } from './logger.js';
import { errorHandler } from './error.js';

export function registerMiddlewares(bot: Bot<BotContext>): void {
  bot.use(requestLogger);
  bot.catch(errorHandler);
}
EOF

write "$APP_DIR/src/bot/commands/start.ts" <<'EOF'
import { Composer } from 'grammy';
import type { BotContext } from '../context.js';

export const startCommand = new Composer<BotContext>();

startCommand.command('start', async (ctx) => {
  const name = ctx.from?.first_name ?? 'there';
  await ctx.reply(
    `👋 Hi ${name}!\n\nI'm a Telegram bot built with Node.js, TypeScript and grammY.\n\nUse /help to see what I can do.`,
  );
});
EOF

write "$APP_DIR/src/bot/commands/help.ts" <<'EOF'
import { Composer } from 'grammy';
import type { BotContext } from '../context.js';

export const helpCommand = new Composer<BotContext>();

const HELP_TEXT = [
  '<b>Available commands</b>',
  '',
  '/start - restart the bot',
  '/help - show this message',
  '/ping - check that the bot is alive',
].join('\n');

helpCommand.command('help', async (ctx) => {
  await ctx.reply(HELP_TEXT, { parse_mode: 'HTML' });
});
EOF

write "$APP_DIR/src/bot/commands/ping.ts" <<'EOF'
import { Composer } from 'grammy';
import type { BotContext } from '../context.js';

export const pingCommand = new Composer<BotContext>();

pingCommand.command('ping', async (ctx) => {
  const startedAt = Date.now();

  try {
    const sent = await ctx.reply('🏓 …');
    await ctx.api.editMessageText(
      sent.chat.id,
      sent.message_id,
      `🏓 Pong! (${Date.now() - startedAt} ms)`,
    );
  } catch {
    await ctx.reply('🏓 Pong!');
  }
});
EOF

write "$APP_DIR/src/bot/commands/index.ts" <<'EOF'
import type { Bot, BotCommand } from 'grammy';
import type { BotContext } from '../context.js';
import { startCommand } from './start.js';
import { helpCommand } from './help.js';
import { pingCommand } from './ping.js';

const commands = [startCommand, helpCommand, pingCommand];

/** Commands shown in the Telegram "/" menu. */
export const commandMenu: BotCommand[] = [
  { command: 'start', description: 'Start the bot' },
  { command: 'help', description: 'Show available commands' },
  { command: 'ping', description: 'Check that the bot is alive' },
];

export function registerCommands(bot: Bot<BotContext>): void {
  for (const command of commands) {
    bot.use(command);
  }
}
EOF

write "$APP_DIR/src/bot/bot.ts" <<'EOF'
import { Bot } from 'grammy';
import { env } from '../config/env.js';
import type { BotContext } from './context.js';
import { registerCommands, commandMenu } from './commands/index.js';
import { registerMiddlewares } from './middlewares/index.js';

/** Builds a fully wired bot instance (no side effects, easy to test). */
export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.BOT_TOKEN);

  registerMiddlewares(bot);
  registerCommands(bot);

  return bot;
}

/** Publishes the command list to Telegram so users see the "/" menu. */
export async function publishCommands(bot: Bot<BotContext>): Promise<void> {
  await bot.api.setMyCommands(commandMenu);
}
EOF

write "$APP_DIR/src/index.ts" <<'EOF'
import { createBot, publishCommands } from './bot/bot.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  const bot = createBot();

  await publishCommands(bot);

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'shutting down');

    try {
      await bot.stop();
    } catch (error) {
      logger.error({ error }, 'failed to stop the bot gracefully');
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'uncaught exception, exiting');
    process.exit(1);
  });

  await bot.start({
    onStart: (info) => {
      logger.info({ id: info.id, username: info.username }, 'bot is up and polling');
    },
  });

  logger.info('polling stopped, bye');
}

void main().catch((error: unknown) => {
  logger.fatal({ error }, 'fatal error during startup');
  process.exit(1);
});
EOF

# ============================================================ helper scripts ==

write "$APP_DIR/scripts/dev.sh" <<'EOF'
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
EOF

write "$APP_DIR/scripts/build.sh" <<'EOF'
#!/usr/bin/env bash
# Type-check and compile TypeScript into dist/.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

npm run typecheck
npm run build

echo "Build finished -> dist/"
EOF

write "$APP_DIR/scripts/start.sh" <<'EOF'
#!/usr/bin/env bash
# Run the compiled bot (production).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -d dist ]; then
  echo "No dist/ directory found. Run ./scripts/build.sh first."
  exit 1
fi

exec npm run start
EOF

write "$APP_DIR/scripts/check.sh" <<'EOF'
#!/usr/bin/env bash
# Run all quality gates: type-check, lint and format check.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

npm run typecheck
npm run lint
npm run format:check

echo "All checks passed."
EOF

chmod +x "$APP_DIR"/scripts/*.sh

write "$APP_DIR/README.md" <<'EOF'
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