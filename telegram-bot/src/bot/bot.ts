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
