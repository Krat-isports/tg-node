import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

export type DownloadProgress = {
  downloaded: number;
  total: number | null;
  startedAt: number;
};

export type ProgressReporter = (p: DownloadProgress) => void;

export async function downloadToFile(
  url: string,
  destPath: string,
  onProgress: ProgressReporter,
  intervalMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, { redirect: 'follow', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  if (!res.body) throw new Error('Response has no body');

  const lengthHeader = res.headers.get('content-length');
  const total = lengthHeader && /^\d+$/u.test(lengthHeader) ? Number(lengthHeader) : null;
  const startedAt = Date.now();

  let downloaded = 0;
  let lastReport = startedAt;

  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      downloaded += chunk.length;
      const now = Date.now();
      if (now - lastReport >= intervalMs) {
        lastReport = now;
        onProgress({ downloaded, total, startedAt });
      }
      cb(null, chunk);
    },
  });

  const source = Readable.fromWeb(res.body as unknown as NodeReadableStream<Uint8Array>);
  const sink = createWriteStream(destPath);

  await pipeline(source, counter, sink);
  onProgress({ downloaded, total, startedAt });
}
