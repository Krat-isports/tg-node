import type { Bot, BotCommand } from 'grammy';
import type { BotContext } from '../context.js';
import { startCommand } from './start.js';
import { helpCommand } from './help.js';
import { pingCommand } from './ping.js';

const commands = [startCommand, helpCommand, pingCommand];

/** Commands shown in the Telegram "/" menu. */
export const commandMenu: BotCommand[] = [
  { command: 'start', description: 'Start the bot' },
  { command: 'help', description: 'Show available commands' },
  { command: 'ping', description: 'Check that the bot is alive' },
];

export function registerCommands(bot: Bot<BotContext>): void {
  for (const command of commands) {
    bot.use(command);
  }
}
