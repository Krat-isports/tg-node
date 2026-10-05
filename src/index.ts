import { createBot, publishCommands } from './bot/bot.js';
import {
  createHealthServer,
  markBotStatus,
  startHealthServer,
  startTelegramHeartbeat,
  stopHealthServer,
} from './health/index.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  const bot = createBot();
  const healthServer = createHealthServer();

  markBotStatus('starting');

  await startHealthServer(healthServer);
  await publishCommands(bot);

  const stopHeartbeat = startTelegramHeartbeat({
    ping: async () => {
      await bot.api.getMe();
    },
  });

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'shutting down');
    markBotStatus('stopping');
    stopHeartbeat();

    await Promise.all([
      bot
        .stop()
        .catch((error: unknown) => logger.error({ err: error }, 'failed to stop bot')),
      stopHealthServer(healthServer).catch((error: unknown) =>
        logger.error({ err: error }, 'failed to stop health server'),
      ),
    ]);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception, exiting');
    process.exit(1);
  });

  await bot.start({
    onStart: (info) => {
      markBotStatus('running');
      logger.info({ id: info.id, username: info.username }, 'bot is up and polling');
    },
  });

  markBotStatus('stopped');
  logger.info('polling stopped, bye');
}

void main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'fatal error during startup');
  process.exit(1);
});
