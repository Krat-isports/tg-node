import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { markTelegramError, markTelegramOk } from './state.js';

export type HeartbeatDeps = {
  /** Must throw on failure — typically `() => bot.api.getMe()`. */
  ping: () => Promise<void>;
};

/** Starts a self-rescheduling ping loop. Returns a stop function. */
export function startTelegramHeartbeat({ ping }: HeartbeatDeps): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(() => void run(), env.HEALTH_HEARTBEAT_MS);
    timer.unref();
  };

  const run = async (): Promise<void> => {
    if (stopped) return;
    try {
      await ping();
      markTelegramOk();
    } catch (error) {
      markTelegramError();
      logger.warn({ err: error }, 'telegram heartbeat failed');
    } finally {
      schedule();
    }
  };

  void run();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
