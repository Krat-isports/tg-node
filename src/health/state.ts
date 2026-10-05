/**
 * In-memory runtime state that the health endpoints report on.
 * Dependency-free so anything (bot middlewares, entrypoint, workers) can
 * contribute to it safely.
 */

export type BotStatus = 'stopped' | 'starting' | 'running' | 'stopping';

export type HealthState = {
  readonly startedAt: number;
  botStatus: BotStatus;
  lastUpdateAt: number | null;
  lastTelegramOkAt: number | null;
  lastTelegramErrorAt: number | null;
};

export const healthState: HealthState = {
  startedAt: Date.now(),
  botStatus: 'stopped',
  lastUpdateAt: null,
  lastTelegramOkAt: null,
  lastTelegramErrorAt: null,
};

export function markBotStatus(status: BotStatus): void {
  healthState.botStatus = status;
}

export function markUpdateReceived(): void {
  healthState.lastUpdateAt = Date.now();
}

export function markTelegramOk(): void {
  healthState.lastTelegramOkAt = Date.now();
}

export function markTelegramError(): void {
  healthState.lastTelegramErrorAt = Date.now();
}
