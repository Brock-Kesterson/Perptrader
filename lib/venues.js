'use strict';

// Venue adapters. Each returns an array of raw funding records:
//   { venue, coin, fundingRate, intervalHours, nextFundingTime,
//     markPrice?, openInterestUsd?, source }
// fundingRate is the decimal rate paid over ONE funding interval
// (e.g. 0.0001 = 1bp per intervalHours). Longs pay shorts when positive.
//
// US-IP note: Binance and Bybit block US IPs directly (HTTP 451/403), so we
// read their funding via Hyperliquid's `predictedFundings` endpoint, which is
// US-accessible. Those rates are Hyperliquid's *prediction* of the upcoming
// settlement, not a confirmed historical print — close enough for the digest
// and the screener, flagged as `predicted` in the source string.

const { httpJson, mapPool } = require('./http');

const HL_INFO = 'https://api.hyperliquid.xyz/info';
const OKX_BASE = 'https://www.okx.com/api/v5';
const DYDX_MARKETS = 'https://indexer.dydx.trade/v4/perpetualMarkets';

const HL_VENUE_MAP = { BinPerp: 'binance', BybitPerp: 'bybit', HlPerp: 'hyperliquid' };

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// --- Hyperliquid: predicted funding for Binance + Bybit + Hyperliquid --------
async function fetchPredictedFundings() {
  const data = await httpJson(HL_INFO, { method: 'POST', body: { type: 'predictedFundings' } });
  const out = [];
  for (const [coin, venues] of data) {
    if (!Array.isArray(venues)) continue;
    for (const entry of venues) {
      if (!entry || !Array.isArray(entry)) continue;
      const [venueKey, info] = entry;
      const venue = HL_VENUE_MAP[venueKey];
      if (!venue || !info) continue;
      const rate = num(info.fundingRate);
      if (rate === null) continue;
      out.push({
        venue,
        coin: String(coin).toUpperCase(),
        fundingRate: rate,
        intervalHours: num(info.fundingIntervalHours) || 8,
        nextFundingTime: num(info.nextFundingTime),
        source: `hyperliquid:predictedFundings${venue === 'hyperliquid' ? '' : ' (predicted)'}`,
      });
    }
  }
  return out;
}

// --- Hyperliquid: authoritative own funding + mark + OI ---------------------
async function fetchHyperliquidCtx() {
  const data = await httpJson(HL_INFO, { method: 'POST', body: { type: 'metaAndAssetCtxs' } });
  const universe = data[0]?.universe || [];
  const ctxs = data[1] || [];
  const out = [];
  for (let i = 0; i < universe.length; i++) {
    const u = universe[i];
    const c = ctxs[i];
    if (!u || !c || u.isDelisted) continue;
    const rate = num(c.funding);
    const mark = num(c.markPx);
    const oiCoins = num(c.openInterest);
    if (rate === null) continue;
    out.push({
      venue: 'hyperliquid',
      coin: String(u.name).toUpperCase(),
      fundingRate: rate,
      intervalHours: 1, // Hyperliquid funds hourly
      nextFundingTime: null,
      markPrice: mark,
      openInterestUsd: oiCoins !== null && mark !== null ? oiCoins * mark : null,
      source: 'hyperliquid:metaAndAssetCtxs',
    });
  }
  return out;
}

// --- OKX: per-instrument funding (no bulk endpoint) ------------------------
async function fetchOkx(coins) {
  // Map wanted coins -> OKX USDT-margined swap instIds.
  const tickers = await httpJson(`${OKX_BASE}/market/tickers?instType=SWAP`);
  const oiResp = await httpJson(`${OKX_BASE}/public/open-interest?instType=SWAP`).catch(() => null);
  const oiByInst = new Map();
  for (const r of oiResp?.data || []) oiByInst.set(r.instId, num(r.oiUsd));

  const wanted = new Set(coins.map((c) => c.toUpperCase()));
  const instIds = [];
  for (const t of tickers.data || []) {
    if (!t.instId.endsWith('-USDT-SWAP')) continue;
    const base = t.instId.replace('-USDT-SWAP', '').toUpperCase();
    if (wanted.size && !wanted.has(base)) continue;
    instIds.push({ instId: t.instId, base, last: num(t.last) });
  }

  const settled = await mapPool(instIds, 8, async ({ instId, base, last }) => {
    const fr = await httpJson(`${OKX_BASE}/public/funding-rate?instId=${instId}`);
    const row = fr.data?.[0];
    if (!row) return null;
    const rate = num(row.fundingRate);
    if (rate === null) return null;
    const next = num(row.nextFundingTime);
    const cur = num(row.fundingTime);
    const intervalHours = next && cur ? Math.round((next - cur) / 3.6e6) : 8;
    return {
      venue: 'okx',
      coin: base,
      fundingRate: rate,
      intervalHours: intervalHours || 8,
      nextFundingTime: cur,
      markPrice: last,
      openInterestUsd: oiByInst.get(instId) ?? null,
      source: 'okx:funding-rate',
    };
  });

  return settled.map((s) => s.value).filter(Boolean);
}

// --- dYdX v4: one call, all markets ---------------------------------------
async function fetchDydx() {
  const data = await httpJson(DYDX_MARKETS);
  const out = [];
  for (const [ticker, m] of Object.entries(data.markets || {})) {
    if (m.status !== 'ACTIVE') continue;
    const rate = num(m.nextFundingRate);
    if (rate === null) continue;
    const base = ticker.replace(/-USD$/, '').toUpperCase();
    const oracle = num(m.oraclePrice);
    const oiCoins = num(m.openInterest);
    out.push({
      venue: 'dydx',
      coin: base,
      fundingRate: rate,
      intervalHours: 1, // dYdX funds hourly
      nextFundingTime: null,
      markPrice: oracle,
      openInterestUsd: oiCoins !== null && oracle !== null ? oiCoins * oracle : null,
      source: 'dydx:perpetualMarkets',
    });
  }
  return out;
}

// Pull everything. `okxCoins` limits the OKX per-instrument fan-out; pass [] for all.
async function fetchAllVenues({ okxCoins = [], includeDydx = true } = {}) {
  const jobs = {
    predicted: fetchPredictedFundings(),
    hlCtx: fetchHyperliquidCtx(),
    okx: fetchOkx(okxCoins),
    dydx: includeDydx ? fetchDydx() : Promise.resolve([]),
  };

  const records = [];
  const errors = [];
  await Promise.all(
    Object.entries(jobs).map(async ([name, p]) => {
      try {
        const rows = await p;
        records.push(...rows);
      } catch (err) {
        errors.push({ job: name, message: err.message });
      }
    })
  );

  // Prefer Hyperliquid's authoritative ctx over its own predicted self-row.
  const seenHlCtx = new Set(
    records.filter((r) => r.source === 'hyperliquid:metaAndAssetCtxs').map((r) => r.coin)
  );
  const deduped = records.filter(
    (r) => !(r.venue === 'hyperliquid' && r.source.startsWith('hyperliquid:predictedFundings') && seenHlCtx.has(r.coin))
  );

  return { records: deduped, errors, fetchedAt: Date.now() };
}

module.exports = {
  fetchAllVenues,
  fetchPredictedFundings,
  fetchHyperliquidCtx,
  fetchOkx,
  fetchDydx,
};
