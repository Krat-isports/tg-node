import type { Bot } from 'grammy';
import type { BotContext } from '../context.js';
import { forwardedDocument } from './forwarded-document.js';
import { forwardedImage } from './forwarded-image.js';
import { forwardedVideo } from './forwarded-video.js';
import { urlDownload } from './url-download/index.js';

const handlers = [urlDownload, forwardedDocument, forwardedImage, forwardedVideo];

export function registerHandlers(bot: Bot<BotContext>): void {
  for (const handler of handlers) {
    bot.use(handler);
  }
}
