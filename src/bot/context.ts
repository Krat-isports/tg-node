import type { Context } from 'grammy';

/**
 * Shared context type for every handler.
 * Extend this (session, user record, i18n, …) as the bot grows.
 */
export type BotContext = Context;
