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
