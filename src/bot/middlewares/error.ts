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
