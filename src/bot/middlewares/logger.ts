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
