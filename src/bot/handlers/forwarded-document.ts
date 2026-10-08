import { Composer } from 'grammy';
import type { BotContext } from '../context.js';
import { logger } from '../../utils/logger.js';
import { extractCaption } from './caption.js';

export const forwardedDocument = new Composer<BotContext>();

forwardedDocument.on('message:document', async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next();
  if (!ctx.message.forward_origin) return next();

  const msg = ctx.message;
  const { document: doc } = msg;

  try {
    await ctx.api.sendDocument(ctx.chat.id, doc.file_id, extractCaption(msg));
    await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
  } catch (error) {
    logger.warn({ err: error }, 'failed to handle forwarded document');
  }
});
