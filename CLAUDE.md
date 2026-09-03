# CLAUDE.md — PerpRadar

## What this is

Perpetual-futures **funding-rate intelligence**. Two products from one data pipeline:

1. **Free daily digest** (`data/digests/*.md`) — cross-venue funding highlights. Doubles as the
   marketing engine: it gets posted to X / Reddit / a newsletter every day.
2. **Paid tier** (not built yet) — live screener UI, real-time Telegram/Discord alerts on funding
   thresholds and cross-venue spreads, historical charts. ~$19/mo via Stripe.

Target user: funding-rate arbitrage / delta-neutral "funding farming" traders.

## Stack / conventions

- Node.js, **zero runtime dependencies** so far (global `fetch`, built-in `http`/`fs`). Keep it that
  way unless a dependency is genuinely load-bearing (Stripe SDK, a Telegram lib later are fine).
- CommonJS (`require`), not ESM.
- Plain JSON files under `data/` for state — no database yet. `data/` is gitignored.
- 2-space indent, `camelCase` funcs, `SCREAMING_SNAKE` module-level consts.
- Tunables live in `lib/config.js`, not inline magic numbers.
- Dev copy lives in OneDrive → file writes must be atomic-with-retry (`lib/store.js` `writeAtomic`),
  same EPERM-mid-sync footgun as the trading-dashboard project.

## Layout

| File | Role |
|---|---|
| `lib/http.js` | `fetch` wrapper (timeout, retry) + `mapPool` bounded concurrency |
| `lib/venues.js` | Per-venue adapters → raw funding records |
| `lib/normalize.js` | Raw records → per-coin view: annualized APR, cross-venue spread |
| `lib/store.js` | Snapshot JSON persistence under `data/` |
| `lib/digest.js` | Snapshot → digest Markdown + social blurb |
| `lib/config.js` | All tunables |
| `lib/alerts.js` | Snapshot (+ prior) + fire-state → alert events (pure) |
| `lib/telegram.js` | Telegram sendMessage wrapper; `isConfigured()` gates sending |
| `lib/env.js` | Zero-dep `.env` loader — `require` it first |
| `scripts/dry-run.js` | Fetch + print table, no writes (`npm run dry-run`) |
| `scripts/poll.js` | One fetch → snapshot cycle (`npm run poll`), for cron |
| `scripts/build-digest.js` | Latest snapshot → digest files (`npm run digest`) |
| `scripts/alerts-dry.js` | Preview which alerts would fire (`npm run alerts-dry [-- --fresh]`) |
| `scripts/alerts-test.js` | Send one test message to the Telegram chat (`npm run alerts-test`) |
| `scripts/scheduler.js` | Prod loop: poll 15m + digest daily + alerts each cycle |
| `server.js` | Landing page + screener + JSON API + SEO pages (port 4800) |
| `lib/pages.js` | Server-rendered SEO pages (per-coin, index, spreads, sitemap) |

## SEO pages

Server-rendered (not JS) so search engines index real numbers: `/funding/<COIN>` (per-coin
funding + spread + honest templated prose + JSON-LD Dataset), `/funding` (coin index),
`/spreads` (widest-spread ranking), `/sitemap.xml`, `/robots.txt`. All render the latest
snapshot on each request, `cache-control: max-age=300`. Canonical/OG/sitemap URLs come from
`PERPRADAR_URL` env — **must be updated when the real domain is live** or every canonical
tag points at the placeholder.

## Alerts

Broadcast model: one public Telegram channel, the free-tier funnel (per-user custom
thresholds are the paid tier, after Stripe). `scheduler.js` runs `detectAlerts` after every
poll. Types: `funding_extreme` (|APR| ≥ 50% on a venue), `spread_wide` (cross-venue spread
≥ 30% APR), `funding_flip` (avg funding crossed zero since last poll). One alert per coin
per cycle (spread > extreme > flip), max 6/cycle, 12h cooldown per key, fire-state in
`data/alert-state.json`. If `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` are unset the engine
still runs and logs what it *would* send — fully testable with no bot.

## Venue reality (verified 2026-09-01, from a US IP)

- **Binance** `fapi.binance.com` → HTTP 451 (US-geoblocked). **Bybit** `api.bybit.com` → HTTP 403
  (CloudFront country block). Same wall the trading bot hit.
- **Workaround:** Hyperliquid's `POST /info {"type":"predictedFundings"}` returns Binance + Bybit +
  Hyperliquid predicted funding for ~230 coins, and is US-accessible. Those two venues' rates are
  therefore *predicted*, not confirmed prints — flagged `predicted` in the source string. If we ever
  need confirmed Binance/Bybit prints, the fix is a ~$5/mo non-US proxy VPS.
- **OKX** `www.okx.com` → works from US. No bulk funding endpoint, so we fan out one request per
  instrument over a curated ~130-coin list in `config.js`.
- **Hyperliquid** `metaAndAssetCtxs` → authoritative HL funding + mark + OI. Funds hourly.
- **dYdX v4** → US-accessible but its `nextFundingRate` values don't reconcile with the other four
  venues; **disabled by default** (`config.includeDydx = false`). Adapter kept for later.

## Gotchas

- **11.0% APR is the neutral-funding baseline**, not a signal — it's the 0.01%-per-8h interest
  component that applies when premium ≈ 0. The digest filters rows within `config.digest.baselineApr`.
- Funding intervals differ by venue (Binance/Bybit/OKX 8h, HL/dYdX 1h). `normalize.js` annualizes
  everything to a common APR: `rate * (24/intervalHours) * 365` (simple, non-compounded — market
  convention).
- Open-interest figures are "max across venues that reported it" and are the least reliable field —
  don't build hard logic on exact OI values.
- Large-supply memecoins are listed as `1000X` / `kX` on some venues; `canonicalCoin()` folds them
  onto the bare ticker so cross-venue rows line up.

## Not financial advice

Everything output carries a disclaimer. We publish data, not trade recommendations. No custody, no
order execution, no managed funds — keep it that way.
