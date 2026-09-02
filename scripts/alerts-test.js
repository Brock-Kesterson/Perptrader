'use strict';

// Send one test message to the configured Telegram chat, to confirm the token
// and chat id work. Usage: npm run alerts-test

require('../lib/env');
const telegram = require('../lib/telegram');

if (!telegram.isConfigured()) {
  console.error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set (check .env). Nothing sent.');
  process.exit(1);
}

telegram
  .sendMessage(
    [
      '✅ *PerpRadar alerts connected*',
      'This channel will post when funding gets extreme or a cross-venue spread opens up.',
      '_Not financial advice._',
    ].join('\n')
  )
  .then((r) => console.log('sent ok:', JSON.stringify(r.result?.chat || r)))
  .catch((e) => { console.error('send failed:', e.message); process.exit(1); });
