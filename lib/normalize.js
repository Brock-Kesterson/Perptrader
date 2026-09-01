'use strict';

// Turn raw per-venue funding records into a per-coin view with annualized
// rates and the best cross-venue delta-neutral spread.
//
// Annualization is simple (non-compounded), the market convention for quoting
// funding APR:  apr = ratePerInterval * (24 / intervalHours) * 365

const VENUE_LABELS = {
  binance: 'Binance',
  bybit: 'Bybit',
  okx: 'OKX',
  hyperliquid: 'Hyperliquid',
  dydx: 'dYdX',
};

function annualize(ratePerInterval, intervalHours) {
  if (!intervalHours) return null;
  return ratePerInterval * (24 / intervalHours) * 365;
}

// Some venues list large-supply memecoins as 1000X / kX contracts. Fold those
// onto the bare ticker so cross-venue rows line up (rate is unit-independent).
function canonicalCoin(coin) {
  let c = coin.toUpperCase();
  c = c.replace(/^1000000/, '').replace(/^1000/, '').replace(/^K(?=[A-Z])/, '');
  return c;
}

function buildCoinView(records) {
  const byCoin = new Map();

  for (const r of records) {
    const coin = canonicalCoin(r.coin);
    if (!byCoin.has(coin)) byCoin.set(coin, { coin, venues: {}, markPrice: null, openInterestUsd: null });
    const bucket = byCoin.get(coin);

    const apr = annualize(r.fundingRate, r.intervalHours);
    // If a venue somehow appears twice, keep the more recent / non-predicted one.
    const existing = bucket.venues[r.venue];
    const isPredicted = /predicted/i.test(r.source);
    if (existing && existing.predicted === false && isPredicted) continue;

    bucket.venues[r.venue] = {
      venue: r.venue,
      label: VENUE_LABELS[r.venue] || r.venue,
      fundingRate: r.fundingRate,
      intervalHours: r.intervalHours,
      apr,
      dailyRate: apr === null ? null : apr / 365,
      nextFundingTime: r.nextFundingTime || null,
      predicted: isPredicted,
      source: r.source,
    };

    if (r.markPrice != null && bucket.markPrice == null) bucket.markPrice = r.markPrice;
    if (r.openInterestUsd != null) {
      bucket.openInterestUsd = Math.max(bucket.openInterestUsd || 0, r.openInterestUsd);
    }
  }

  const coins = [];
  for (const bucket of byCoin.values()) {
    const venueList = Object.values(bucket.venues).filter((v) => v.apr !== null);
    if (venueList.length === 0) continue;

    let hi = venueList[0];
    let lo = venueList[0];
    for (const v of venueList) {
      if (v.apr > hi.apr) hi = v;
      if (v.apr < lo.apr) lo = v;
    }

    const spreadApr = venueList.length >= 2 ? hi.apr - lo.apr : null;
    const absMaxApr = Math.max(Math.abs(hi.apr), Math.abs(lo.apr));

    coins.push({
      coin: bucket.coin,
      markPrice: bucket.markPrice,
      openInterestUsd: bucket.openInterestUsd,
      venueCount: venueList.length,
      venues: bucket.venues,
      maxApr: hi.apr,
      maxAprVenue: hi.venue,
      minApr: lo.apr,
      minAprVenue: lo.venue,
      // Cross-venue market-neutral: long the perp where funding is lowest,
      // short it where funding is highest. Gross, before fees/slippage.
      spreadApr,
      spreadLongVenue: spreadApr === null ? null : lo.venue,
      spreadShortVenue: spreadApr === null ? null : hi.venue,
      // Single-venue basis carry headline (short perp + long spot, or reverse).
      absMaxApr,
    });
  }

  return coins;
}

module.exports = { buildCoinView, annualize, canonicalCoin, VENUE_LABELS };
