import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { livenessCheck, readinessCheck, type CheckOutcome } from './checks.js';

function respond(req: IncomingMessage, res: ServerResponse, outcome: CheckOutcome): void {
  const body = `${JSON.stringify({
    status: outcome.ok ? 'ok' : 'fail',
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    ...outcome.details,
  })}\n`;

  res.writeHead(outcome.ok ? 200 : 503, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname.replace(/\/+$/u, '') || '/';

  switch (path) {
    case '/':
    case '/health':
    case '/healthz':
    case '/livez':
      respond(req, res, livenessCheck());
      return;

    case '/ready':
    case '/readyz':
    case '/health/ready':
      respond(req, res, readinessCheck());
      return;

    default:
      res.writeHead(404);
      res.end();
  }
}

export function createHealthServer(): Server {
  return createServer((req, res) => {
    try {
      handle(req, res);
    } catch (error) {
      logger.error({ err: error }, 'health handler crashed');
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end('{"status":"error"}\n');
      } else {
        res.end();
      }
    }
  });
}

export async function startHealthServer(server: Server): Promise<void> {
  if (!env.HEALTH_ENABLED) {
    logger.info('health check http server disabled');
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      const address = server.address() as AddressInfo | null;
      logger.info(
        { host: address?.address ?? env.HEALTH_HOST, port: address?.port ?? env.HEALTH_PORT },
        'health check endpoint listening',
      );
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(env.HEALTH_PORT, env.HEALTH_HOST);
  });
}

export async function stopHealthServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  logger.info('health check endpoint stopped');
}
