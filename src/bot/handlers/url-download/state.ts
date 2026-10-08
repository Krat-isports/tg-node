export type PendingMode = 'awaiting_filename' | 'downloading';

export type PendingDownload = {
  userId: number;
  chatId: number;
  statusMessageId: number;
  url: string;
  contentType: string;
  contentLength: number | null;
  defaultFilename: string;
  createdAt: number;
  mode: PendingMode;
};

const TTL_MS = 5 * 60 * 1000;
const store = new Map<number, PendingDownload>();

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) if (now - v.createdAt > TTL_MS) store.delete(k);
}

export function setPending(item: PendingDownload): void {
  prune();
  store.set(item.userId, item);
}
export function getPending(userId: number): PendingDownload | undefined {
  prune();
  return store.get(userId);
}
export function updatePending(userId: number, patch: Partial<PendingDownload>): void {
  const current = store.get(userId);
  if (!current) return;
  store.set(userId, { ...current, ...patch });
}
export function clearPending(userId: number): void {
  store.delete(userId);
}
