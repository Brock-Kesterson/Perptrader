'use strict';

// One poll cycle: fetch every venue, merge, persist a snapshot.
// Run from cron / pm2 every ~15 min.

const { fetchAllVenues } = require('../lib/venues');
const { buildCoinView } = require('../lib/normalize');
const { saveSnapshot } = require('../lib/store');
const config = require('../lib/config');

async function poll() {
  const t0 = Date.now();
  const { records, errors, fetchedAt } = await fetchAllVenues({
    okxCoins: config.okxCoins,
    includeDydx: config.includeDydx,
  });

  const venueCounts = {};
  for (const r of records) venueCounts[r.venue] = (venueCounts[r.venue] || 0) + 1;

  // A venue returning zero rows means its adapter or endpoint broke — worth
  // failing loudly rather than silently shipping a thinner snapshot.
  const expected = config.includeDydx
    ? ['binance', 'bybit', 'okx', 'hyperliquid', 'dydx']
    : ['binance', 'bybit', 'okx', 'hyperliquid'];
  const missing = expected.filter((v) => !venueCounts[v]);

  const coins = buildCoinView(records);
  const snapshot = {
    fetchedAt,
    tookMs: Date.now() - t0,
    venueCounts,
    missing,
    errors,
    coins,
  };

  const file = saveSnapshot(snapshot);
  console.log(
    `[poll] ${new Date(fetchedAt).toISOString()} ${records.length} rows -> ${coins.length} coins ` +
    `in ${snapshot.tookMs}ms -> ${file}`
  );
  if (missing.length) console.error(`[poll] WARNING missing venues: ${missing.join(', ')}`);
  if (errors.length) console.error(`[poll] errors: ${JSON.stringify(errors)}`);
  return snapshot;
}

if (require.main === module) {
  poll().catch((e) => { console.error('[poll] FATAL', e); process.exit(1); });
}

module.exports = { poll };
