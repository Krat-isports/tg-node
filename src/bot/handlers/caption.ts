import type { MessageEntity } from 'grammy/types';

export type CaptionFields = {
  caption?: string;
  caption_entities?: MessageEntity[];
};

/**
 * Extracts caption + formatting entities (links, bold, spoilers, …) from a
 * Telegram message so they can be re-used verbatim on a freshly sent media.
 */
export function extractCaption(message: {
  caption?: string;
  caption_entities?: MessageEntity[];
}): CaptionFields {
  const out: CaptionFields = {};

  if (message.caption !== undefined && message.caption.length > 0) {
    out.caption = message.caption;
  }
  if (message.caption_entities !== undefined && message.caption_entities.length > 0) {
    out.caption_entities = message.caption_entities;
  }

  return out;
}
