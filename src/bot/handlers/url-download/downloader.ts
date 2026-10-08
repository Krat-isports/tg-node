import { createWriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { logger } from '../../../utils/logger.js';

/**
 * Node's default stream buffer is 16 KB. That caps throughput on high-latency
 * links. Bumping all stages to 1 MB lets the TCP window stay full.
 */
const PIPELINE_HWM = 1024 * 1024;

/** Files at or above this size use the parallel chunked downloader. */
export const PARALLEL_THRESHOLD_BYTES = 32 * 1024 * 1024;
/** Concurrent range requests. 4 is safe on almost every CDN; 8 also works. */
export const PARALLEL_CHUNKS = 4;

export type DownloadProgress = {
  downloaded: number;
  total: number | null;
  startedAt: number;
  mode: 'sequential' | 'parallel';
};

export type ProgressReporter = (p: DownloadProgress) => void;

export type DownloadOptions = {
  total?: number | null;
  acceptsRanges?: boolean;
  signal?: AbortSignal;
};

// ----------------------------------------------------- sequential ----------

async function downloadSequential(
  url: string,
  destPath: string,
  onProgress: ProgressReporter,
  intervalMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const init: RequestInit = { redirect: 'follow' };
  if (signal) init.signal = signal;

  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  if (!res.body) throw new Error('Response has no body');

  const lengthHeader = res.headers.get('content-length');
  const total = lengthHeader && /^\d+$/u.test(lengthHeader) ? Number(lengthHeader) : null;
  const startedAt = Date.now();

  let downloaded = 0;
  let lastReport = startedAt;

  const counter = new Transform({
    highWaterMark: PIPELINE_HWM,
    transform(chunk: Buffer, _enc, cb) {
      downloaded += chunk.length;
      const now = Date.now();
      if (now - lastReport >= intervalMs) {
        lastReport = now;
        onProgress({ downloaded, total, startedAt, mode: 'sequential' });
      }
      cb(null, chunk);
    },
  });

  const source = Readable.fromWeb(
    res.body as unknown as NodeReadableStream<Uint8Array>,
    { highWaterMark: PIPELINE_HWM },
  );
  const sink = createWriteStream(destPath, { highWaterMark: PIPELINE_HWM });

  await pipeline(source, counter, sink);
  onProgress({ downloaded, total, startedAt, mode: 'sequential' });
}

// ------------------------------------------------------- parallel ----------

function computeRanges(total: number, chunks: number): { start: number; end: number }[] {
  const size = Math.ceil(total / chunks);
  const out: { start: number; end: number }[] = [];
  for (let i = 0; i < chunks; i += 1) {
    const start = i * size;
    if (start >= total) break;
    out.push({ start, end: Math.min(start + size - 1, total - 1) });
  }
  return out;
}

async function downloadRange(
  url: string,
  destPath: string,
  start: number,
  end: number,
  index: number,
  perChunk: Map<number, number>,
  onChunkProgress: () => void,
  signal?: AbortSignal,
): Promise<void> {
  const init: RequestInit = {
    method: 'GET',
    redirect: 'follow',
    headers: { Range: `bytes=${start}-${end}` },
  };
  if (signal) init.signal = signal;

  const res = await fetch(url, init);
  if (res.status !== 206) {
    throw new Error(`chunk ${index}: expected 206, got ${res.status}`);
  }
  if (!res.body) throw new Error(`chunk ${index}: response has no body`);

  const fh = await open(destPath, 'r+');
  try {
    let filePos = start;
    let written = 0;
    perChunk.set(index, 0);

    const pieces: Buffer[] = [];
    let pending = 0;

    const flush = async (): Promise<void> => {
      if (pending === 0) return;
      const data = pieces.length === 1 ? pieces[0]! : Buffer.concat(pieces, pending);
      await fh.write(data, 0, data.length, filePos);
      filePos += data.length;
      written += data.length;
      perChunk.set(index, written);
      pieces.length = 0;
      pending = 0;
      onChunkProgress();
    };

    for await (const raw of res.body as unknown as AsyncIterable<Uint8Array>) {
      const buf =
        raw instanceof Buffer
          ? raw
          : Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
      pieces.push(buf);
      pending += buf.length;
      if (pending >= PIPELINE_HWM) await flush();
    }
    await flush();
  } finally {
    await fh.close();
  }
}

async function downloadParallel(
  url: string,
  destPath: string,
  total: number,
  chunks: number,
  onProgress: ProgressReporter,
  intervalMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const ranges = computeRanges(total, chunks);
  const startedAt = Date.now();
  const perChunk = new Map<number, number>();
  let lastReport = startedAt;

  const onChunkProgress = (): void => {
    const now = Date.now();
    if (now - lastReport < intervalMs) return;
    lastReport = now;
    const downloaded = [...perChunk.values()].reduce((a, b) => a + b, 0);
    onProgress({ downloaded, total, startedAt, mode: 'parallel' });
  };

  await Promise.all(
    ranges.map(({ start, end }, i) =>
      downloadRange(url, destPath, start, end, i, perChunk, onChunkProgress, signal),
    ),
  );

  const downloaded = [...perChunk.values()].reduce((a, b) => a + b, 0);
  onProgress({ downloaded, total, startedAt, mode: 'parallel' });
}

// ------------------------------------------------------- dispatcher --------

export async function downloadToFile(
  url: string,
  destPath: string,
  onProgress: ProgressReporter,
  intervalMs: number,
  options: DownloadOptions = {},
): Promise<void> {
  const { total, acceptsRanges, signal } = options;

  const wantParallel =
    acceptsRanges === true && typeof total === 'number' && total >= PARALLEL_THRESHOLD_BYTES;

  if (wantParallel && typeof total === 'number') {
    logger.debug({ url, total, chunks: PARALLEL_CHUNKS }, 'parallel chunked download');
    try {
      await downloadParallel(url, destPath, total, PARALLEL_CHUNKS, onProgress, intervalMs, signal);
      return;
    } catch (error) {
      if (signal?.aborted) throw error;
      logger.warn({ err: error, url }, 'parallel download failed, falling back to sequential');
    }
  }

  logger.debug({ url, total, acceptsRanges }, 'sequential download');
  await downloadSequential(url, destPath, onProgress, intervalMs, signal);
}
