'use strict';

// Send one test message to the configured Telegram chat, to confirm the token
// and chat id work. Usage: npm run alerts-test

require('../lib/env');
const telegram = require('../lib/telegram');
const config = require('../lib/config');

if (!telegram.isConfigured()) {
  console.error('TELEGRAM_BOT_TOKEN not set (check .env). Nothing sent.');
  process.exit(1);
}

telegram
  .sendMessage(
    [
      '✅ *PerpRadar alerts connected*',
      'This channel will post when funding gets extreme or a cross-venue spread opens up.',
      '_Not financial advice._',
    ].join('\n'),
    { chatId: config.alerts.chatId }
  )
  .then((r) => console.log('sent ok to', config.alerts.chatId, JSON.stringify(r.result?.chat?.title || r.result?.chat || r)))
  .catch((e) => { console.error('send failed:', e.message); process.exit(1); });
