'use strict';

// Build the daily funding digest (Markdown) and a short social blurb from a
// snapshot. This is both the product's free tier and its marketing engine.

const { VENUE_LABELS } = require('./normalize');
const config = require('./config');

const VENUE_COLS = ['binance', 'bybit', 'okx', 'hyperliquid'];

function fmtApr(x) {
  if (x == null) return '–';
  const s = (x * 100).toFixed(x >= 1 || x <= -1 ? 0 : 1);
  return `${x > 0 ? '+' : ''}${s}%`;
}
function fmtUsd(x) {
  if (x == null) return '–';
  if (x >= 1e9) return `$${(x / 1e9).toFixed(1)}B`;
  if (x >= 1e6) return `$${(x / 1e6).toFixed(0)}M`;
  return `$${(x / 1e3).toFixed(0)}K`;
}
function avgApr(c) {
  const xs = VENUE_COLS.map((v) => c.venues[v]?.apr).filter((x) => x != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function eligible(coins, cfg) {
  return coins.filter((c) => {
    if (c.venueCount < 2) return false;
    if ((c.openInterestUsd ?? 0) < cfg.minOpenInterestUsd) return false;
    const a = avgApr(c);
    // Drop settlement/delisting blowouts that would otherwise dominate.
    if (a != null && Math.abs(a) > cfg.extremeAprCap) return false;
    return true;
  });
}

function venueRow(c) {
  return VENUE_COLS.map((v) => fmtApr(c.venues[v]?.apr)).join(' | ');
}

function table(coins, { extraHeader = '', extraCell } = {}) {
  const header = `| Coin | Avg APR | ${VENUE_COLS.map((v) => VENUE_LABELS[v]).join(' | ')} | OI |${extraHeader}`;
  const sep = `|${'---|'.repeat(7 + (extraHeader ? extraHeader.split('|').length - 1 : 0))}`;
  const rows = coins.map((c) => {
    const base = `| **${c.coin}** | ${fmtApr(avgApr(c))} | ${venueRow(c)} | ${fmtUsd(c.openInterestUsd)} |`;
    return extraCell ? base + extraCell(c) : base;
  });
  return [header, sep, ...rows].join('\n');
}

function buildDigest(latest, prior, opts = {}) {
  const cfg = { ...config.digest, ...opts };
  const date = new Date(latest.fetchedAt).toISOString().slice(0, 10);
  const pool = eligible(latest.coins, cfg);

  // "Paying up" = at least one venue meaningfully above the neutral baseline.
  const longsPay = [...pool]
    .filter((c) => c.maxApr > cfg.baselineApr * 1.5)
    .sort((a, b) => b.maxApr - a.maxApr)
    .slice(0, cfg.topN);
  const shortsPay = [...pool]
    .filter((c) => c.minApr < -cfg.baselineApr * 1.5)
    .sort((a, b) => a.minApr - b.minApr)
    .slice(0, cfg.topN);
  const spreads = [...pool]
    .filter((c) => c.spreadApr != null)
    .sort((a, b) => b.spreadApr - a.spreadApr)
    .slice(0, cfg.topN);

  // 24h movers
  let movers = [];
  if (prior) {
    const priorByCoin = new Map(prior.coins.map((c) => [c.coin, c]));
    movers = pool
      .map((c) => {
        const was = priorByCoin.get(c.coin);
        if (!was) return null;
        const now = avgApr(c);
        const then = avgApr(was);
        if (now == null || then == null) return null;
        return { coin: c.coin, now, then, delta: now - then, oi: c.openInterestUsd };
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, cfg.topN);
  }

  const L = [];
  L.push(`# PerpRadar — Funding Digest · ${date}`);
  L.push('');
  L.push(
    `Perpetual-futures funding across **${VENUE_COLS.map((v) => VENUE_LABELS[v]).join(', ')}**. ` +
    `Positive APR = longs pay shorts. All figures annualized from current funding.`
  );
  L.push('');

  L.push('## 🔥 Longs paying up — shorts get paid to hold');
  L.push('');
  L.push(table(longsPay));
  L.push('');
  L.push(
    `*Classic play: short the perp on the highest-APR venue, hold spot to stay delta-neutral, collect the funding.*`
  );
  L.push('');

  L.push('## 🧊 Shorts paying up — longs get paid to hold');
  L.push('');
  L.push(table(shortsPay));
  L.push('');

  L.push('## ⚖️ Widest cross-venue spreads — market-neutral');
  L.push('');
  L.push('Go long the perp where funding is cheapest, short it where it is richest. No spot leg, no directional risk — just the gap.');
  L.push('');
  L.push(
    table(spreads, {
      extraHeader: ' Long → Short | Spread APR |',
      extraCell: (c) =>
        ` ${VENUE_LABELS[c.spreadLongVenue]} → ${VENUE_LABELS[c.spreadShortVenue]} | **${fmtApr(c.spreadApr)}** |`,
    })
  );
  L.push('');

  if (movers.length) {
    L.push('## 📈 Biggest 24h funding swings');
    L.push('');
    L.push('| Coin | Avg APR now | ~24h ago | Δ |');
    L.push('|---|---|---|---|');
    for (const m of movers) {
      L.push(`| **${m.coin}** | ${fmtApr(m.now)} | ${fmtApr(m.then)} | ${m.delta > 0 ? '▲' : '▼'} ${fmtApr(Math.abs(m.delta))} |`);
    }
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push(
    `Coverage: ${latest.coins.length} contracts · ${pool.length} above ${fmtUsd(cfg.minOpenInterestUsd)} OI. ` +
    `Binance & Bybit rates via Hyperliquid's predicted-funding feed.`
  );
  L.push('');
  L.push('**Not financial advice.** Funding rates move every hour; spreads shown are gross of fees, slippage and borrow cost.');

  const markdown = L.join('\n');
  const tweet = buildTweet({ date, longsPay, shortsPay, spreads });
  return {
    date,
    markdown,
    tweet,
    stats: { contracts: latest.coins.length, eligible: pool.length, movers: movers.length },
  };
}

function buildTweet({ date, longsPay, shortsPay, spreads }) {
  const top = longsPay[0];
  const bot = shortsPay[0];
  const sp = spreads[0];
  const lines = [`PerpRadar funding snapshot · ${date}`, ''];
  if (top) lines.push(`🔥 ${top.coin}: longs paying ${fmtApr(top.maxApr)} APR (${VENUE_LABELS[top.maxAprVenue]})`);
  if (bot) lines.push(`🧊 ${bot.coin}: shorts paying ${fmtApr(Math.abs(bot.minApr))} APR (${VENUE_LABELS[bot.minAprVenue]})`);
  if (sp) lines.push(`⚖️ ${sp.coin}: ${fmtApr(sp.spreadApr)} APR spread — long ${VENUE_LABELS[sp.spreadLongVenue]}, short ${VENUE_LABELS[sp.spreadShortVenue]}`);
  lines.push('', 'Full digest + live screener 👇');
  return lines.join('\n');
}

module.exports = { buildDigest, buildTweet };
