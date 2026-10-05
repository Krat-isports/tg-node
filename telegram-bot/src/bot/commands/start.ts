import { Composer } from 'grammy';
import type { BotContext } from '../context.js';

export const startCommand = new Composer<BotContext>();

startCommand.command('start', async (ctx) => {
  const name = ctx.from?.first_name ?? 'there';
  await ctx.reply(
    `👋 Hi ${name}!\n\nI'm a Telegram bot built with Node.js, TypeScript and grammY.\n\nUse /help to see what I can do.`,
  );
});
