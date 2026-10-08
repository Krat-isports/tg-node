import { Composer } from 'grammy';
import type { BotContext } from '../context.js';
import { logger } from '../../utils/logger.js';
import { extractCaption } from './caption.js';

export const forwardedImage = new Composer<BotContext>();

forwardedImage.on('message:photo', async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next();
  if (!ctx.message.forward_origin) return next();

  const msg = ctx.message;
  const photo = msg.photo.at(-1);
  if (!photo) return next();

  try {
    await ctx.api.sendPhoto(ctx.chat.id, photo.file_id, extractCaption(msg));
    await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
  } catch (error) {
    logger.warn({ err: error }, 'failed to handle forwarded image');
  }
});
