import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { requestLogger } from './logger.js';
import { errorHandler } from './error.js';
import { trackActivity } from './health.js';

export function registerMiddlewares(bot: Bot<BotContext>): void {
  bot.use(trackActivity);
  bot.use(requestLogger);
  bot.catch(errorHandler);
}
