'use strict';

// Long-running scheduler (pm2 process): poll every POLL_MIN minutes, build the
// digest once per UTC day at/after DIGEST_UTC_HOUR. Keep this the only thing
// that writes snapshots in production so the web server stays read-only.

const fs = require('fs');
const path = require('path');
const { poll } = require('./poll');
const { readLatest, readPrior } = require('../lib/store');
const { buildDigest } = require('../lib/digest');
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

async function cycle() {
  if (running) { console.log('[scheduler] previous cycle still running, skip'); return; }
  running = true;
  try {
    await poll();
    maybeBuildDigest();
  } catch (err) {
    console.error('[scheduler] cycle error', err.message);
  } finally {
    running = false;
  }
}

console.log(`[scheduler] poll every ${POLL_MIN}m, digest at ${DIGEST_UTC_HOUR}:00 UTC`);
cycle();
setInterval(cycle, POLL_MIN * 60 * 1000);
