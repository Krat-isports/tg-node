import { Composer, InlineKeyboard } from 'grammy';
import { mkdtemp, rm, stat as fsStat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BotContext } from '../../context.js';
import { logger } from '../../../utils/logger.js';
import { humanBytes, humanDuration, humanSpeed } from './format.js';
import { probeUrl } from './probe.js';
import { ensureExtension, sanitizeFilename } from './filename.js';
import { downloadToFile } from './downloader.js';
import { MAX_UPLOAD_BYTES, pickKind, sendDownloaded } from './sender.js';
import { StatusReporter } from './status.js';
import {
  clearPending,
  getPending,
  setPending,
  updatePending,
  type PendingDownload,
} from './state.js';

export const urlDownload = new Composer<BotContext>();

const URL_RE = /https?:\/\/[^\s<>"']+/iu;
const PROGRESS_INTERVAL_MS = 10_000;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mainKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✏️ Rename', 'dl:rename')
    .text('✅ Use default', 'dl:keep')
    .row()
    .text('❌ Cancel', 'dl:cancel');
}

function cancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('❌ Cancel', 'dl:cancel');
}

async function safeDelete(
  api: BotContext['api'],
  chatId: number,
  messageId: number | undefined,
): Promise<void> {
  if (messageId === undefined) return;
  await api.deleteMessage(chatId, messageId).catch(() => {});
}

async function beginProbe(
  ctx: BotContext,
  url: string,
  commandMessageId: number | undefined,
): Promise<void> {
  if (ctx.chat?.type !== 'private' || !ctx.from) return;

  clearPending(ctx.from.id);

  const status = await ctx.api.sendMessage(ctx.chat.id, '🔍 Inspecting URL…');
  await safeDelete(ctx.api, ctx.chat.id, commandMessageId);

  try {
    const probe = await probeUrl(url);

    const pending: PendingDownload = {
      userId: ctx.from.id,
      chatId: ctx.chat.id,
      statusMessageId: status.message_id,
      url: probe.url,
      contentType: probe.contentType,
      contentLength: probe.contentLength,
      defaultFilename: probe.suggestedFilename,
      createdAt: Date.now(),
      mode: 'awaiting_filename',
    };
    setPending(pending);

    const sizeText =
      probe.contentLength === null ? 'unknown' : humanBytes(probe.contentLength);

    const lines = [
      '📎 <b>Ready to download</b>',
      '',
      `📄 <b>Suggested name:</b> <code>${escapeHtml(probe.suggestedFilename)}</code>`,
      `🧩 <b>Type:</b> <code>${escapeHtml(probe.contentType)}</code>`,
      `📦 <b>Size:</b> <code>${escapeHtml(sizeText)}</code>`,
      '',
      'Tap ✏️ to rename, ✅ to keep the suggestion, or simply reply with the new name.',
    ];

    await ctx.api.editMessageText(ctx.chat.id, status.message_id, lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: mainKeyboard(),
    });
  } catch (error) {
    logger.warn({ err: error, url }, 'failed to probe url');
    await ctx.api
      .editMessageText(
        ctx.chat.id,
        status.message_id,
        `❌ Failed to inspect URL: ${escapeHtml(String(error))}`,
        { parse_mode: 'HTML' },
      )
      .catch(() => {});
    clearPending(ctx.from.id);
  }
}

/**
 * Switch the card into rename mode. Telegram only accepts InlineKeyboardMarkup
 * in editMessageText (ForceReply is not allowed on edits), so we show the
 * prompt inline with a Cancel button — the user's next text message is the
 * new filename.
 */
async function promptForFilename(
  api: BotContext['api'],
  chatId: number,
  messageId: number,
  pending: PendingDownload,
): Promise<void> {
  const lines = [
    '✏️ <b>Rename</b>',
    '',
    `📄 Current: <code>${escapeHtml(pending.defaultFilename)}</code>`,
    '',
    'Send the new filename as your next message.',
    'The correct extension will be appended if you leave it out.',
  ];

  await api
    .editMessageText(chatId, messageId, lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: cancelKeyboard(),
    })
    .catch(() => {});
}

async function cancelPending(
  api: BotContext['api'],
  chatId: number,
  statusMessageId: number,
  extraMessageIds: readonly (number | undefined)[] = [],
): Promise<void> {
  await safeDelete(api, chatId, statusMessageId);
  for (const id of extraMessageIds) await safeDelete(api, chatId, id);
}

async function runDownload(
  ctx: BotContext,
  pending: PendingDownload,
  filename: string,
): Promise<void> {
  const { api } = ctx;
  const { chatId, statusMessageId, url, contentType } = pending;

  updatePending(pending.userId, { mode: 'downloading' });
  const status = new StatusReporter(api, chatId, statusMessageId);

  const dir = await mkdtemp(join(tmpdir(), 'tgbot-dl-'));
  const dest = join(dir, filename);

  try {
    await status.set(`⬇️ Downloading…\n📄 ${filename}\n📥 0 B`, true);

    await downloadToFile(
      url,
      dest,
      (p) => {
        const totalText = p.total !== null ? ` / ${humanBytes(p.total)}` : '';
        const pct =
          p.total !== null && p.total > 0
            ? ` (${Math.floor((p.downloaded / p.total) * 100)}%)`
            : '';
        const elapsed = Date.now() - p.startedAt;
        const text = [
          '⬇️ Downloading…',
          `📄 ${filename}`,
          `📥 ${humanBytes(p.downloaded)}${totalText}${pct}`,
          `⏱️ ${humanDuration(elapsed)} · ${humanSpeed(p.downloaded, elapsed)}`,
        ].join('\n');
        void status.set(text);
      },
      PROGRESS_INTERVAL_MS,
    );

    const fileStat = await fsStat(dest);
    if (fileStat.size > MAX_UPLOAD_BYTES) {
      await status.set(
        `⚠️ File is ${humanBytes(fileStat.size)} — larger than Telegram's ` +
          `${humanBytes(MAX_UPLOAD_BYTES)} upload limit.`,
        true,
      );
      return;
    }

    const kind = pickKind(contentType, fileStat.size);
    await status.set(`⬆️ Uploading as ${kind} (${humanBytes(fileStat.size)})…`, true);

    await sendDownloaded(api, chatId, dest, filename, kind);

    // Remove the file from disk the moment the upload completes.
    await unlink(dest).catch((error: unknown) =>
      logger.debug({ err: error, dest }, 'failed to unlink temp file after send'),
    );
    logger.debug({ dest }, 'temp file deleted after send');

    await status.set(
      `✅ Sent as ${kind}\n📄 ${filename}\n📦 ${humanBytes(fileStat.size)}`,
      true,
    );
  } catch (error) {
    logger.warn({ err: error, url }, 'download/upload failed');
    await status.set(`❌ Failed: ${String(error)}`, true);
  } finally {
    clearPending(pending.userId);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// --- /download <url> -----------------------------------------------------
urlDownload.command(['download', 'dl'], async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  const raw = ctx.match?.trim() ?? '';
  const url = raw.match(URL_RE)?.[0];
  if (!url) {
    await ctx.reply('Usage: <code>/download &lt;url&gt;</code>', { parse_mode: 'HTML' });
    return;
  }
  await beginProbe(ctx, url, ctx.message?.message_id);
});

// --- /cancel — deletes every message involved in the flow ----------------
urlDownload.command('cancel', async (ctx) => {
  if (ctx.chat.type !== 'private' || !ctx.from) return;
  const pending = getPending(ctx.from.id);

  if (!pending) {
    await ctx.reply('Nothing to cancel.').catch(() => {});
    return;
  }

  clearPending(ctx.from.id);
  await cancelPending(ctx.api, pending.chatId, pending.statusMessageId, [
    ctx.message?.message_id,
  ]);
});

// --- /keep (alias /skip) -------------------------------------------------
urlDownload.command(['keep', 'skip'], async (ctx) => {
  if (ctx.chat.type !== 'private' || !ctx.from) return;
  const pending = getPending(ctx.from.id);
  if (!pending || pending.mode !== 'awaiting_filename') {
    await ctx.reply('No pending download.');
    return;
  }
  clearPending(ctx.from.id);
  await runDownload(ctx, pending, pending.defaultFilename);
});

// --- Inline buttons ------------------------------------------------------
urlDownload.callbackQuery(/^dl:(keep|cancel|rename)$/u, async (ctx) => {
  if (!ctx.from) return;
  const action = ctx.match?.[1];
  const pending = getPending(ctx.from.id);

  await ctx.answerCallbackQuery().catch(() => {});

  if (!pending) {
    await ctx.editMessageText('⌛ This request expired.').catch(() => {});
    return;
  }

  if (action === 'cancel') {
    clearPending(ctx.from.id);
    await cancelPending(ctx.api, pending.chatId, pending.statusMessageId);
    return;
  }

  if (action === 'rename') {
    await promptForFilename(ctx.api, pending.chatId, pending.statusMessageId, pending);
    return;
  }

  // action === 'keep'
  clearPending(ctx.from.id);
  await runDownload(ctx, pending, pending.defaultFilename);
});

// --- Bare URL message OR filename reply ----------------------------------
urlDownload.on('message:text', async (ctx, next) => {
  if (ctx.chat.type !== 'private' || !ctx.from) return next();

  const msg = ctx.message;
  if (!msg) return next();

  const text = msg.text.trim();
  if (text.length === 0) return next();

  const pending = getPending(ctx.from.id);

  if (pending && pending.mode === 'awaiting_filename') {
    await ctx.api.deleteMessage(ctx.chat.id, msg.message_id).catch(() => {});
    const base = sanitizeFilename(text, pending.defaultFilename);
    const filename = ensureExtension(base, pending.contentType);
    clearPending(ctx.from.id);
    await runDownload(ctx, pending, filename);
    return;
  }

  const match = text.match(URL_RE);
  if (match && match[0].length >= text.length - 3) {
    await beginProbe(ctx, match[0], msg.message_id);
    return;
  }

  return next();
});
