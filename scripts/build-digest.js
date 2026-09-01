'use strict';

// Build today's digest from the latest snapshot. Writes Markdown + a social
// blurb to data/digests/, prints the Markdown.
// Usage: npm run digest [-- --no-write]

const fs = require('fs');
const path = require('path');
const { readLatest, readPrior } = require('../lib/store');
const { buildDigest } = require('../lib/digest');
const config = require('../lib/config');

const noWrite = process.argv.includes('--no-write');

const latest = readLatest();
if (!latest) {
  console.error('No snapshot found. Run `npm run poll` first.');
  process.exit(1);
}

const prior = readPrior(20 * 3600 * 1000); // ~"24h ago" (accept >=20h)
const { markdown, tweet, date, stats } = buildDigest(latest, prior);

console.log(markdown);
console.log('\n----- SOCIAL BLURB -----\n');
console.log(tweet);

if (!noWrite) {
  const dir = path.join(config.dataDir, 'digests');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${date}.md`), markdown + '\n');
  fs.writeFileSync(path.join(dir, `${date}.social.txt`), tweet + '\n');
  console.log(`\n[digest] wrote data/digests/${date}.md  (${JSON.stringify(stats)}, prior=${!!prior})`);
}
