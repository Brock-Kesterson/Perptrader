'use strict';

// Long-running scheduler (pm2 process): poll every POLL_MIN minutes, build the
// digest once per UTC day at/after DIGEST_UTC_HOUR. Keep this the only thing
// that writes snapshots in production so the web server stays read-only.

require('../lib/env');
const fs = require('fs');
const path = require('path');
const { poll } = require('./poll');
const { readLatest, readPrior, readAlertState, writeAlertState } = require('../lib/store');
const { buildDigest } = require('../lib/digest');
const { detectAlerts, renderMessage } = require('../lib/alerts');
const telegram = require('../lib/telegram');
const config = require('../lib/config');

const POLL_MIN = Number(process.env.POLL_MIN) || 15;
const DIGEST_UTC_HOUR = Number(process.env.DIGEST_UTC_HOUR) || 13;
const DIGEST_DIR = path.join(config.dataDir, 'digests');

let running = false;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function digestExists(date) {
  return fs.existsSync(path.join(DIGEST_DIR, `${date}.md`));
}

function maybeBuildDigest() {
  const now = new Date();
  const date = todayUtc();
  if (now.getUTCHours() < DIGEST_UTC_HOUR) return;
  if (digestExists(date)) return;
  const latest = readLatest();
  if (!latest) return;
  const prior = readPrior(20 * 3600 * 1000);
  const { markdown, tweet, stats } = buildDigest(latest, prior);
  fs.mkdirSync(DIGEST_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIGEST_DIR, `${date}.md`), markdown + '\n');
  fs.writeFileSync(path.join(DIGEST_DIR, `${date}.social.txt`), tweet + '\n');
  console.log(`[scheduler] built digest ${date} ${JSON.stringify(stats)} (prior=${!!prior})`);
}

async function runAlerts() {
  const latest = readLatest();
  if (!latest) return;
  const prior = readPrior(POLL_MIN * 60 * 1000 * 0.75); // ~one cycle back
  const state = readAlertState();
  const { events, dropped, nextState } = detectAlerts(latest, prior, state, config.alerts);
  writeAlertState(nextState);

  if (!events.length) return;
  const msgs = events.map((ev) => renderMessage(ev, config.alerts.siteUrl));
  if (!telegram.isConfigured()) {
    console.log(`[alerts] ${events.length} would send (TELEGRAM_* not set):`);
    for (const ev of events) console.log(`  - ${ev.title}`);
    return;
  }
  const { sent, failed } = await telegram.sendBatch(msgs);
  console.log(`[alerts] sent ${sent}/${events.length} (failed ${failed}, dropped ${dropped})`);
}

async function cycle() {
  if (running) { console.log('[scheduler] previous cycle still running, skip'); return; }
  running = true;
  try {
    await poll();
    maybeBuildDigest();
    await runAlerts();
  } catch (err) {
    console.error('[scheduler] cycle error', err.message);
  } finally {
    running = false;
  }
}

console.log(
  `[scheduler] poll every ${POLL_MIN}m, digest at ${DIGEST_UTC_HOUR}:00 UTC, ` +
  `alerts ${telegram.isConfigured() ? 'ON' : 'OFF (no TELEGRAM_* env)'}`
);
cycle();
setInterval(cycle, POLL_MIN * 60 * 1000);
