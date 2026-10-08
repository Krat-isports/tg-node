export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  const decimals = i === 0 ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[i]}`;
}

export function humanDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return m === 0 ? `${rest}s` : `${m}m${rest.toString().padStart(2, '0')}s`;
}

export function humanSpeed(bytes: number, ms: number): string {
  if (ms <= 0 || bytes <= 0) return '';
  return `${humanBytes((bytes / ms) * 1000)}/s`;
}
