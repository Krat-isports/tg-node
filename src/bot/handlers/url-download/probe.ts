import { logger } from '../../../utils/logger.js';
import { suggestFilename } from './filename.js';

export type ProbeResult = {
  url: string;
  contentType: string;
  contentLength: number | null;
  contentDisposition: string | null;
  suggestedFilename: string;
  method: 'HEAD' | 'GET';
  acceptsRanges: boolean;
};

/** "bytes 0-0/12345" → 12345; anything else → null. */
function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const m = /\/(\d+)\s*$/u.exec(header.trim());
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function drain(res: Response): Promise<void> {
  if (!res.body) return;
  try {
    await res.body.cancel();
  } catch {
    /* ignore */
  }
}

async function fetchHeaders(
  url: string,
  signal?: AbortSignal,
): Promise<{ res: Response; method: 'HEAD' | 'GET' }> {
  const headInit: RequestInit = { method: 'HEAD', redirect: 'follow' };
  if (signal) headInit.signal = signal;

  try {
    const head = await fetch(url, headInit);
    if (head.ok) return { res: head, method: 'HEAD' };
    await drain(head);
    logger.debug({ url, status: head.status }, 'HEAD rejected, retrying with ranged GET');
  } catch (error) {
    if (signal?.aborted) throw error;
    logger.debug({ url, err: error }, 'HEAD failed, retrying with ranged GET');
  }

  const getInit: RequestInit = {
    method: 'GET',
    redirect: 'follow',
    headers: { Range: 'bytes=0-0' },
  };
  if (signal) getInit.signal = signal;

  const get = await fetch(url, getInit);
  return { res: get, method: 'GET' };
}

export async function probeUrl(url: string, signal?: AbortSignal): Promise<ProbeResult> {
  const { res, method } = await fetchHeaders(url, signal);

  if (!res.ok && res.status !== 206) {
    await drain(res);
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

  const rangeTotal = parseContentRangeTotal(res.headers.get('content-range'));
  const lengthHeader = res.headers.get('content-length');
  const headerLength =
    lengthHeader && /^\d+$/u.test(lengthHeader) ? Number(lengthHeader) : null;

  const contentLength = res.status === 206 ? rangeTotal : headerLength;

  const acceptRangesHeader = (res.headers.get('accept-ranges') ?? '').toLowerCase();
  const acceptsRanges = res.status === 206 || acceptRangesHeader.includes('bytes');

  const contentDisposition = res.headers.get('content-disposition');
  const finalUrl = res.url || url;
  const suggestedFilename = suggestFilename(contentDisposition, finalUrl, contentType);

  await drain(res);

  logger.debug(
    {
      url: finalUrl,
      method,
      status: res.status,
      contentType,
      contentLength,
      acceptsRanges,
      suggestedFilename,
    },
    'probed url',
  );

  return {
    url: finalUrl,
    contentType,
    contentLength,
    contentDisposition,
    suggestedFilename,
    method,
    acceptsRanges,
  };
}
