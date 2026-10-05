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
