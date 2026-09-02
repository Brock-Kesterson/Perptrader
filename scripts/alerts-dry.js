'use strict';

// Preview which alerts would fire from the latest snapshot — no Telegram send,
// no state written. Usage: npm run alerts-dry [-- --fresh]
// --fresh ignores the persisted fire-state (shows everything currently eligible).

require('../lib/env');
const { readLatest, readPrior, readAlertState } = require('../lib/store');
const { detectAlerts, renderMessage } = require('../lib/alerts');
const config = require('../lib/config');

const fresh = process.argv.includes('--fresh');

const latest = readLatest();
if (!latest) { console.error('No snapshot. Run `npm run poll`.'); process.exit(1); }
const prior = readPrior(45 * 60 * 1000); // ~one poll ago, for flip detection
const state = fresh ? {} : readAlertState();

const { events, dropped, nextState } = detectAlerts(latest, prior, state, config.alerts);

console.log(`\nSnapshot ${new Date(latest.fetchedAt).toISOString()} · prior=${prior ? 'yes' : 'no'} · state keys=${Object.keys(state).length}\n`);
if (!events.length) {
  console.log('No alerts would fire.');
} else {
  events.forEach((ev, i) => {
    console.log(`--- [${i + 1}] ${ev.type} (${ev.severity}) ---`);
    console.log(renderMessage(ev, config.alerts.siteUrl));
    console.log('');
  });
}
if (dropped) console.log(`(+${dropped} more suppressed by maxPerCycle=${config.alerts.maxPerCycle})`);
console.log(`\nWould write ${Object.keys(nextState).length} state keys. (dry run — nothing saved)`);
