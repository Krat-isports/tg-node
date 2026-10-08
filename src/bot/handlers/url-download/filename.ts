import { basename, extname } from 'node:path';

const FORBIDDEN = /[\\/:*?"<>|\x00-\x1f]/g;

export function sanitizeFilename(raw: string, fallback = 'file'): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return fallback;
  const safe = trimmed.replace(FORBIDDEN, '_').replace(/\s+/g, ' ').slice(0, 120).trim();
  return safe.length > 0 ? safe : fallback;
}

export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/^["']|["']$/g, '').trim());
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

export function filenameFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const base = basename(u.pathname);
    if (!base || base === '/' || base === '.') return null;
    return decodeURIComponent(base);
  } catch {
    return null;
  }
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/json': 'json',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

export function extensionForContentType(contentType: string): string | null {
  const bare = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return MIME_EXT[bare] ?? null;
}

export function ensureExtension(name: string, contentType: string): string {
  if (extname(name)) return name;
  const ext = extensionForContentType(contentType);
  return ext ? `${name}.${ext}` : name;
}

export function suggestFilename(
  contentDisposition: string | null,
  url: string,
  contentType: string,
): string {
  const candidates = [filenameFromContentDisposition(contentDisposition), filenameFromUrl(url)];
  for (const c of candidates) {
    if (c) return ensureExtension(sanitizeFilename(c, 'file'), contentType);
  }
  const ext = extensionForContentType(contentType) ?? 'bin';
  return `download-${Date.now()}.${ext}`;
}
