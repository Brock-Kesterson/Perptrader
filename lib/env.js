'use strict';

// Minimal .env loader (no dependency). Reads KEY=VALUE lines from ./.env into
// process.env without overwriting anything already set. Require this first,
// before any module that reads process.env.

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', '.env');
try {
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // no .env — fine, env vars may be set another way (pm2, shell)
}
