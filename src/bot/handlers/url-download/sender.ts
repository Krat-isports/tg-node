import { InputFile } from 'grammy';
import type { BotContext } from '../../context.js';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export type SendKind = 'photo' | 'video' | 'audio' | 'document';

export function pickKind(contentType: string, size: number): SendKind {
  const bare = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (
    bare === 'image/jpeg' ||
    bare === 'image/png' ||
    bare === 'image/webp' ||
    bare === 'image/gif'
  ) {
    return size <= MAX_PHOTO_BYTES ? 'photo' : 'document';
  }
  if (bare.startsWith('video/')) return 'video';
  if (bare.startsWith('audio/')) return 'audio';
  return 'document';
}

export async function sendDownloaded(
  api: BotContext['api'],
  chatId: number,
  filePath: string,
  filename: string,
  kind: SendKind,
): Promise<void> {
  const file = new InputFile(filePath, filename);

  switch (kind) {
    case 'photo':
      await api.sendPhoto(chatId, file);
      return;
    case 'video':
      await api.sendVideo(chatId, file);
      return;
    case 'audio':
      await api.sendAudio(chatId, file, { title: filename });
      return;
    default:
      await api.sendDocument(chatId, file);
  }
}
