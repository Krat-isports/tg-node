import { logger } from '../../../utils/logger.js';
import { suggestFilename } from './filename.js';

export type ProbeResult = {
  url: string;
  contentType: string;
  contentLength: number | null;
  contentDisposition: string | null;
  suggestedFilename: string;
};

async function fetchHeaders(url: string, signal?: AbortSignal): Promise<Response> {
  const headInit: RequestInit = { method: 'HEAD', redirect: 'follow' };
  if (signal) headInit.signal = signal;

  const head = await fetch(url, headInit);
  if (head.status !== 405 && head.status !== 501 && head.status !== 403) return head;

  const getInit: RequestInit = {
    method: 'GET',
    redirect: 'follow',
    headers: { Range: 'bytes=0-0' },
  };
  if (signal) getInit.signal = signal;

  return fetch(url, getInit);
}

export async function probeUrl(url: string, signal?: AbortSignal): Promise<ProbeResult> {
  const res = await fetchHeaders(url, signal);
  if (!res.ok && res.status !== 206) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const lengthHeader = res.headers.get('content-length');
  const contentLength =
    lengthHeader && /^\d+$/u.test(lengthHeader) ? Number(lengthHeader) : null;
  const contentDisposition = res.headers.get('content-disposition');
  const finalUrl = res.url || url;
  const suggestedFilename = suggestFilename(contentDisposition, finalUrl, contentType);

  if (res.body) {
    try {
      await res.body.cancel();
    } catch {
      /* ignore */
    }
  }

  logger.debug(
    { url: finalUrl, contentType, contentLength, suggestedFilename },
    'probed url',
  );

  return {
    url: finalUrl,
    contentType,
    contentLength,
    contentDisposition,
    suggestedFilename,
  };
}
