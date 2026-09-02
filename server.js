'use strict';

// PerpRadar web server: landing page + live funding screener + JSON API.
// Vanilla Node http, no framework. Serves static files from public/ and
// reads the latest snapshot / digest that scripts/poll.js + build-digest.js
// produce under data/.

require('./lib/env');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { readLatest, readPrior, writeAtomic } = require('./lib/store');
const { buildDigest } = require('./lib/digest');
const config = require('./lib/config');

const SUBSCRIBERS_FILE = path.join(config.dataDir, 'subscribers.json');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 4800;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DIGEST_DIR = path.join(config.dataDir, 'digests');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'public, max-age=30',
  });
  res.end(body);
}

function sendText(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*' });
  res.end(text);
}

// --- API -----------------------------------------------------------------
function apiFunding(res, url) {
  const snap = readLatest();
  if (!snap) return sendJson(res, 503, { error: 'no snapshot yet' });

  const minOi = Number(url.searchParams.get('minOi')) || 0;
  let coins = snap.coins.filter((c) => (c.openInterestUsd ?? 0) >= minOi);

  const sort = url.searchParams.get('sort') || 'oi';
  const dir = url.searchParams.get('dir') === 'asc' ? 1 : -1;
  const key = {
    oi: (c) => c.openInterestUsd ?? -1,
    spread: (c) => c.spreadApr ?? -Infinity,
    carry: (c) => c.absMaxApr ?? -1,
    max: (c) => c.maxApr ?? -Infinity,
    min: (c) => c.minApr ?? Infinity,
    coin: (c) => c.coin,
  }[sort] || ((c) => c.openInterestUsd ?? -1);
  coins = [...coins].sort((a, b) => {
    const x = key(a), y = key(b);
    if (typeof x === 'string') return dir * x.localeCompare(y);
    return dir * (x - y);
  });

  const limit = Number(url.searchParams.get('limit')) || coins.length;
  sendJson(res, 200, {
    fetchedAt: snap.fetchedAt,
    ageSeconds: Math.round((Date.now() - snap.fetchedAt) / 1000),
    venueCounts: snap.venueCounts,
    missing: snap.missing || [],
    count: coins.length,
    coins: coins.slice(0, limit),
  });
}

function apiDigest(res, url) {
  const snap = readLatest();
  if (!snap) return sendJson(res, 503, { error: 'no snapshot yet' });
  const prior = readPrior(20 * 3600 * 1000);
  const digest = buildDigest(snap, prior);
  if (url.searchParams.get('format') === 'md') {
    return sendText(res, 200, digest.markdown, 'text/markdown; charset=utf-8');
  }
  sendJson(res, 200, digest);
}

function apiDigestArchive(res) {
  let files = [];
  try {
    files = fs.readdirSync(DIGEST_DIR).filter((f) => f.endsWith('.md')).sort().reverse();
  } catch { /* none yet */ }
  sendJson(res, 200, { dates: files.map((f) => f.replace('.md', '')) });
}

// --- subscribe (lead capture; sending wired later) --------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function readSubscribers() {
  try { return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8')); }
  catch { return []; }
}

function apiSubscribe(req, res) {
  let body = '';
  req.on('data', (c) => {
    body += c;
    if (body.length > 4096) req.destroy();
  });
  req.on('end', () => {
    let email;
    try { email = String(JSON.parse(body).email || '').trim().toLowerCase(); }
    catch { return sendJson(res, 400, { error: 'bad request' }); }
    if (!EMAIL_RE.test(email)) return sendJson(res, 400, { error: 'invalid email' });

    const list = readSubscribers();
    if (!list.some((s) => s.email === email)) {
      list.push({ email, at: new Date().toISOString() });
      try {
        fs.mkdirSync(config.dataDir, { recursive: true });
        writeAtomic(SUBSCRIBERS_FILE, JSON.stringify(list, null, 2));
      } catch (err) {
        console.error('[subscribe] write failed', err);
        return sendJson(res, 500, { error: 'could not save' });
      }
    }
    console.log(`[subscribe] ${email} (total ${list.length})`);
    sendJson(res, 200, { ok: true });
  });
}

// --- static ------------------------------------------------------------
function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const full = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!full.startsWith(PUBLIC_DIR)) return sendText(res, 403, 'nope');
  fs.readFile(full, (err, buf) => {
    if (err) return sendText(res, 404, 'Not found');
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/health') return sendJson(res, 200, { ok: true, hasSnapshot: !!readLatest() });
    if (url.pathname === '/api/funding') return apiFunding(res, url);
    if (url.pathname === '/api/digest') return apiDigest(res, url);
    if (url.pathname === '/api/digests') return apiDigestArchive(res);
    if (url.pathname === '/api/subscribe' && req.method === 'POST') return apiSubscribe(req, res);
    return serveStatic(res, url.pathname);
  } catch (err) {
    console.error('[server] error', err);
    sendJson(res, 500, { error: 'internal' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[server] PerpRadar on http://${HOST}:${PORT}  (snapshot: ${readLatest() ? 'present' : 'MISSING — run npm run poll'})`);
});
