'use strict';

// Thin Telegram Bot API wrapper — just sendMessage. Credentials from env:
//   TELEGRAM_BOT_TOKEN  (from @BotFather)
//   TELEGRAM_CHAT_ID    (the channel/chat to post to; @channelusername also works)
//
// If either is unset, isConfigured() is false and callers should log instead of
// send — so the alert engine is fully testable with no bot.

const { httpJson } = require('./http');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// Configured to send as long as there's a token — the chat id can come from
// config (broadcast channel) rather than the env fallback.
function isConfigured() {
  return Boolean(TOKEN);
}

async function sendMessage(text, { chatId = CHAT_ID, parseMode = 'Markdown', disablePreview = true } = {}) {
  if (!TOKEN || !chatId) throw new Error('telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)');
  return httpJson(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    body: {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: disablePreview,
    },
    timeoutMs: 10000,
    retries: 2,
  });
}

// Send several messages in sequence, pausing to stay under Telegram's ~20 msg/min
// broadcast limit. Never throws — returns { sent, failed }.
async function sendBatch(messages, { gapMs = 1200, chatId } = {}) {
  let sent = 0;
  let failed = 0;
  for (const msg of messages) {
    try {
      await sendMessage(msg, chatId ? { chatId } : {});
      sent++;
    } catch (err) {
      failed++;
      console.error('[telegram] send failed:', err.message);
    }
    if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
  }
  return { sent, failed };
}

module.exports = { isConfigured, sendMessage, sendBatch };
