import { createBot, publishCommands } from './bot/bot.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  const bot = createBot();

  await publishCommands(bot);

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'shutting down');

    try {
      await bot.stop();
    } catch (error) {
      logger.error({ error }, 'failed to stop the bot gracefully');
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'uncaught exception, exiting');
    process.exit(1);
  });

  await bot.start({
    onStart: (info) => {
      logger.info({ id: info.id, username: info.username }, 'bot is up and polling');
    },
  });

  logger.info('polling stopped, bye');
}

void main().catch((error: unknown) => {
  logger.fatal({ error }, 'fatal error during startup');
  process.exit(1);
});
