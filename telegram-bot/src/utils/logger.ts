import { pino } from 'pino';
import { env } from '../config/env.js';

const isDevelopment = env.NODE_ENV === 'development';

/**
 * Single application logger. Pretty-printed locally, structured JSON in prod.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});
