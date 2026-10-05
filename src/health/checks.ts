import { env } from '../config/env.js';
import { healthState } from './state.js';

export type CheckOutcome = {
  ok: boolean;
  reason?: string;
  details: Record<string, unknown>;
};

function baseDetails(): Record<string, unknown> {
  const mem = process.memoryUsage();
  return {
    startedAt: new Date(healthState.startedAt).toISOString(),
    uptimeMs: Date.now() - healthState.startedAt,
    nodeVersion: process.version,
    environment: env.NODE_ENV,
    memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed },
  };
}

export function livenessCheck(): CheckOutcome {
  return { ok: true, details: baseDetails() };
}

export function readinessCheck(): CheckOutcome {
  const now = Date.now();
  const heartbeatAgeMs =
    healthState.lastTelegramOkAt === null ? null : now - healthState.lastTelegramOkAt;
  const staleAfterMs = env.HEALTH_HEARTBEAT_MS * 3;

  const details: Record<string, unknown> = {
    ...baseDetails(),
    botStatus: healthState.botStatus,
    lastUpdateAt:
      healthState.lastUpdateAt === null
        ? null
        : new Date(healthState.lastUpdateAt).toISOString(),
    lastTelegramOkAt:
      healthState.lastTelegramOkAt === null
        ? null
        : new Date(healthState.lastTelegramOkAt).toISOString(),
    lastTelegramErrorAt:
      healthState.lastTelegramErrorAt === null
        ? null
        : new Date(healthState.lastTelegramErrorAt).toISOString(),
    heartbeatAgeMs,
    heartbeatStaleAfterMs: staleAfterMs,
  };

  if (healthState.botStatus !== 'running') {
    return { ok: false, reason: `bot is ${healthState.botStatus}`, details };
  }
  if (heartbeatAgeMs === null) {
    return { ok: false, reason: 'no successful telegram heartbeat yet', details };
  }
  if (heartbeatAgeMs > staleAfterMs) {
    return {
      ok: false,
      reason: `telegram heartbeat is stale (${heartbeatAgeMs}ms > ${staleAfterMs}ms)`,
      details,
    };
  }
  return { ok: true, details };
}
