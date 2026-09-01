# PerpRadar

Cross-venue **perpetual-futures funding-rate** intelligence.

- **Free daily digest** — where funding is fattest across Binance, Bybit, OKX & Hyperliquid, and the
  widest market-neutral spreads between them.
- **Paid tier** (in progress) — live screener, real-time funding & spread alerts, historical charts.

## Quick start

```bash
node scripts/dry-run.js          # live funding table, nothing written
node scripts/poll.js             # fetch + save a snapshot to data/
node scripts/build-digest.js     # build today's digest from the latest snapshot
```

No dependencies, no build step. Node ≥ 20.

## How it works

`poll.js` pulls funding from every venue (`lib/venues.js`), merges them into a per-coin view with
annualized APRs and cross-venue spreads (`lib/normalize.js`), and writes a JSON snapshot
(`lib/store.js`). `build-digest.js` turns the latest snapshot into a Markdown digest plus a short
social blurb (`lib/digest.js`).

Run `poll.js` on a ~15-minute cron and `build-digest.js` once a day.

See `CLAUDE.md` for architecture notes and the venue-access situation.

## Disclaimer

PerpRadar publishes market data. Nothing here is financial advice. Funding rates change hourly;
spreads shown are gross of fees, slippage, and borrow cost.
