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
