'use strict';

// Snapshot persistence. Plain JSON files under data/ — no database yet.
// Atomic write (tmp + rename) with retry, because the dev copy lives in
// OneDrive which briefly locks files mid-sync (same footgun as the trading bot).

const fs = require('fs');
const path = require('path');
const config = require('./config');

const SNAP_DIR = path.join(config.dataDir, 'snapshots');
const LATEST = path.join(config.dataDir, 'latest.json');
const MAX_SNAPSHOTS = 240;

function ensureDirs() {
  fs.mkdirSync(SNAP_DIR, { recursive: true });
}

function writeAtomic(file, text, tries = 6) {
  const tmp = `${file}.${process.pid}.tmp`;
  for (let i = 0; i < tries; i++) {
    try {
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      if ((err.code === 'EPERM' || err.code === 'EBUSY') && i < tries - 1) {
        const wait = 120 * (i + 1);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
        continue;
      }
      throw err;
    }
  }
}

function saveSnapshot(snapshot) {
  ensureDirs();
  const stamp = new Date(snapshot.fetchedAt || Date.now()).toISOString().replace(/[:.]/g, '-');
  const file = path.join(SNAP_DIR, `${stamp}.json`);
  const text = JSON.stringify(snapshot);
  writeAtomic(file, text);
  writeAtomic(LATEST, text);
  pruneSnapshots();
  return file;
}

function pruneSnapshots() {
  const files = listSnapshotFiles();
  for (const f of files.slice(MAX_SNAPSHOTS)) {
    try { fs.unlinkSync(path.join(SNAP_DIR, f)); } catch { /* ignore */ }
  }
}

// Newest first.
function listSnapshotFiles() {
  try {
    return fs.readdirSync(SNAP_DIR).filter((f) => f.endsWith('.json')).sort().reverse();
  } catch {
    return [];
  }
}

function readLatest() {
  try {
    return JSON.parse(fs.readFileSync(LATEST, 'utf8'));
  } catch {
    return null;
  }
}

// The most recent snapshot at least `minAgeMs` older than the latest — used by
// the digest for "24h change". Returns null if none old enough.
function readPrior(minAgeMs) {
  const files = listSnapshotFiles();
  if (files.length < 2) return null;
  const latest = readLatest();
  const cutoff = (latest?.fetchedAt || Date.now()) - minAgeMs;
  for (const f of files) {
    try {
      const snap = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, f), 'utf8'));
      if (snap.fetchedAt <= cutoff) return snap;
    } catch { /* skip */ }
  }
  return null;
}

module.exports = { saveSnapshot, readLatest, readPrior, listSnapshotFiles, writeAtomic, SNAP_DIR };
