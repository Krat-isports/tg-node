import type { BotContext } from '../../context.js';

/** Edits a single Telegram message, throttled to avoid API rate limits. */
export class StatusReporter {
  private lastEditAt = 0;
  private lastText = '';

  constructor(
    private readonly api: BotContext['api'],
    private readonly chatId: number,
    private readonly messageId: number,
    private readonly minIntervalMs = 500,
  ) {}

  async set(text: string, force = false): Promise<void> {
    if (text === this.lastText) return;
    const now = Date.now();
    if (!force && now - this.lastEditAt < this.minIntervalMs) return;
    this.lastEditAt = now;
    this.lastText = text;
    try {
      await this.api.editMessageText(this.chatId, this.messageId, text);
    } catch {
      /* message gone or rate-limited — ignore */
    }
  }
}
