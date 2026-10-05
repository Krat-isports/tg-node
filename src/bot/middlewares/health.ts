import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '../context.js';
import { markUpdateReceived } from '../../health/index.js';

export const trackActivity: MiddlewareFn<BotContext> = async (_ctx, next) => {
  markUpdateReceived();
  await next();
};
