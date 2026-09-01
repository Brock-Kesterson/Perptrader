'use strict';

// Fetch live funding from every venue, print a table. No files written.
// Usage: npm run dry-run [-- --sort=spread|carry|oi] [-- --limit=30]

const { fetchAllVenues } = require('../lib/venues');
const { buildCoinView, VENUE_LABELS } = require('../lib/normalize');
const config = require('../lib/config');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);
const sortKey = args.sort || 'carry';
const limit = Number(args.limit) || 25;

function pct(x, dp = 1) {
  if (x == null) return '   -  ';
  return (x * 100).toFixed(dp).padStart(6) + '%';
}
function usd(x) {
  if (x == null) return '     -';
  if (x >= 1e9) return (x / 1e9).toFixed(2) + 'B';
  if (x >= 1e6) return (x / 1e6).toFixed(0) + 'M';
  return x.toFixed(0);
}

(async () => {
  const t0 = Date.now();
  const { records, errors } = await fetchAllVenues({
    okxCoins: config.okxCoins,
    includeDydx: config.includeDydx,
  });

  console.log(`\nFetched ${records.length} venue rows in ${Date.now() - t0}ms`);
  const byVenue = {};
  for (const r of records) byVenue[r.venue] = (byVenue[r.venue] || 0) + 1;
  console.log('  per venue:', JSON.stringify(byVenue));
  if (errors.length) console.log('  ERRORS:', JSON.stringify(errors));

  const coins = buildCoinView(records);
  console.log(`  ${coins.length} coins after cross-venue merge\n`);

  const sorters = {
    carry: (a, b) => b.absMaxApr - a.absMaxApr,
    spread: (a, b) => (b.spreadApr ?? -1) - (a.spreadApr ?? -1),
    oi: (a, b) => (b.openInterestUsd ?? 0) - (a.openInterestUsd ?? 0),
  };
  const rows = coins
    .filter((c) => (sortKey === 'spread' ? c.spreadApr != null : true))
    .sort(sorters[sortKey] || sorters.carry)
    .slice(0, limit);

  const venueOrder = ['binance', 'bybit', 'okx', 'hyperliquid', 'dydx'];
  const head =
    'COIN'.padEnd(9) +
    venueOrder.map((v) => VENUE_LABELS[v].padStart(8)).join(' ') +
    '  ' + 'SPREAD'.padStart(7) + '  ' + 'L/S'.padEnd(13) + '  ' + 'OI'.padStart(6);
  console.log(head);
  console.log('-'.repeat(head.length));

  for (const c of rows) {
    const cells = venueOrder.map((v) => pct(c.venues[v]?.apr));
    const ls =
      c.spreadApr == null
        ? ''
        : `${short(c.spreadLongVenue)}/${short(c.spreadShortVenue)}`;
    console.log(
      c.coin.padEnd(9) +
        cells.join(' ') +
        '  ' + pct(c.spreadApr) +
        '  ' + ls.padEnd(13) +
        '  ' + usd(c.openInterestUsd).padStart(6)
    );
  }
  console.log(`\n(APR, annualized. "SPREAD" = long L venue / short S venue, market-neutral. sort=${sortKey})`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

function short(v) {
  return { binance: 'BIN', bybit: 'BYB', okx: 'OKX', hyperliquid: 'HL', dydx: 'DYDX' }[v] || v;
}
