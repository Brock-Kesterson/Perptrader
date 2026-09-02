'use strict';

// Broadcast alert engine. Given the latest snapshot (+ the prior one for
// change detection) and the persisted fire-state, decide which alert messages
// to send now. Pure — no I/O, no Telegram. The scheduler persists nextState
// and hands events to lib/telegram.

const { VENUE_LABELS } = require('./normalize');

const VENUES = ['binance', 'bybit', 'okx', 'hyperliquid'];
const STATE_TTL_MS = 7 * 24 * 3600 * 1000;

function avgApr(c) {
  const xs = VENUES.map((v) => c.venues[v]?.apr).filter((x) => x != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
function pct(x) {
  if (x == null) return '–';
  const p = x * 100;
  return `${p > 0 ? '+' : ''}${p.toFixed(Math.abs(p) >= 100 ? 0 : 1)}%`;
}
function usd(x) {
  if (x == null) return '?';
  if (x >= 1e9) return `$${(x / 1e9).toFixed(1)}B`;
  if (x >= 1e6) return `$${(x / 1e6).toFixed(0)}M`;
  return `$${(x / 1e3).toFixed(0)}K`;
}
// venue apr list, richest first, as "Bybit +120%, Binance +80%"
function venueBreakdown(c, dir) {
  return VENUES
    .map((v) => ({ v, apr: c.venues[v]?.apr }))
    .filter((x) => x.apr != null)
    .sort((a, b) => (dir === 'short' ? a.apr - b.apr : b.apr - a.apr))
    .map((x) => `${VENUE_LABELS[x.v]} ${pct(x.apr)}`)
    .join(', ');
}

function pruneState(state, now) {
  const out = {};
  for (const [k, v] of Object.entries(state || {})) {
    if (now - (v.firedAt || 0) < STATE_TTL_MS) out[k] = v;
  }
  return out;
}

function detectAlerts(latest, prior, prevState, cfg) {
  const now = latest.fetchedAt || Date.now();
  const state = pruneState(prevState, now);
  const cooldownMs = cfg.cooldownHours * 3600 * 1000;
  const events = [];
  const pending = {}; // key -> state entry, committed only for surviving events
  const priorByCoin = prior ? new Map(prior.coins.map((c) => [c.coin, c])) : null;

  const pool = latest.coins.filter(
    (c) => c.venueCount >= 2 && (c.openInterestUsd ?? 0) >= cfg.minOpenInterestUsd
  );

  // Caller has already checked the fire threshold. Fire now unless this key
  // fired recently — then require both a cooldown AND a materially bigger value.
  const consider = (key, value, makeEvent) => {
    const prev = state[key];
    if (prev) {
      const cooled = now - prev.firedAt >= cooldownMs;
      const bigger = Math.abs(value) >= Math.abs(prev.lastValue) * 1.5;
      if (!(cooled && bigger)) return;
    }
    events.push(makeEvent());
    // Record intent, but only commit to `state` for events that survive the
    // per-coin dedup + cap below — otherwise a suppressed alert would wrongly
    // sit on cooldown having never been sent.
    pending[key] = { firedAt: now, lastValue: value };
  };

  // Clear keys whose condition has relaxed, so they can fire fresh later.
  const clearIfBelow = (key, magnitude, floor) => {
    if (state[key] && magnitude < floor) delete state[key];
  };

  for (const c of pool) {
    const oi = c.openInterestUsd;

    // --- funding extreme: longs paying ---
    clearIfBelow(`x:${c.coin}:long`, c.maxApr, cfg.clearApr);
    if (c.maxApr >= cfg.extremeApr) {
      consider(`x:${c.coin}:long`, c.maxApr, () => ({
        key: `x:${c.coin}:long`,
        type: 'funding_extreme',
        severity: c.maxApr >= cfg.extremeApr * 2 ? 'high' : 'normal',
        coin: c.coin,
        title: `🔥 ${c.coin} — longs paying up`,
        lines: [
          `Longs paying *${pct(c.maxApr)} APR* on ${VENUE_LABELS[c.maxAprVenue]}.`,
          `_${venueBreakdown(c, 'long')}_`,
          `OI ~${usd(oi)}`,
        ],
      }));
    }

    // --- funding extreme: shorts paying ---
    clearIfBelow(`x:${c.coin}:short`, -c.minApr, cfg.clearApr);
    if (c.minApr <= -cfg.extremeApr) {
      consider(`x:${c.coin}:short`, c.minApr, () => ({
        key: `x:${c.coin}:short`,
        type: 'funding_extreme',
        severity: -c.minApr >= cfg.extremeApr * 2 ? 'high' : 'normal',
        coin: c.coin,
        title: `🧊 ${c.coin} — shorts paying up`,
        lines: [
          `Shorts paying *${pct(Math.abs(c.minApr))} APR* on ${VENUE_LABELS[c.minAprVenue]}.`,
          `_${venueBreakdown(c, 'short')}_`,
          `OI ~${usd(oi)}`,
        ],
      }));
    }

    // --- wide cross-venue spread ---
    if (c.spreadApr != null) {
      clearIfBelow(`s:${c.coin}`, c.spreadApr, cfg.spreadClearApr);
      if (c.spreadApr >= cfg.spreadApr) {
        consider(`s:${c.coin}`, c.spreadApr, () => ({
          key: `s:${c.coin}`,
          type: 'spread_wide',
          severity: c.spreadApr >= cfg.spreadApr * 2 ? 'high' : 'normal',
          coin: c.coin,
          title: `⚖️ ${c.coin} — wide venue spread`,
          lines: [
            `*${pct(c.spreadApr)} APR* gap: long ${VENUE_LABELS[c.spreadLongVenue]}, short ${VENUE_LABELS[c.spreadShortVenue]}.`,
            `_${venueBreakdown(c, 'long')}_`,
            `OI ~${usd(oi)} · market-neutral, gross of fees`,
          ],
        }));
      }
    }

    // --- funding flip (sign change vs prior snapshot) ---
    if (priorByCoin) {
      const was = priorByCoin.get(c.coin);
      const nowA = avgApr(c);
      const thenA = was ? avgApr(was) : null;
      if (nowA != null && thenA != null && Math.sign(nowA) !== Math.sign(thenA)
          && Math.abs(nowA) >= cfg.flipMinApr && Math.abs(thenA) >= cfg.flipMinApr) {
        const key = `f:${c.coin}:${new Date(now).toISOString().slice(0, 13)}`;
        if (!state[key] && !pending[key]) {
          events.push({
            key,
            type: 'funding_flip',
            severity: 'normal',
            coin: c.coin,
            title: `🔄 ${c.coin} — funding flipped ${thenA > 0 ? 'positive → negative' : 'negative → positive'}`,
            lines: [
              `Avg funding went from *${pct(thenA)}* to *${pct(nowA)} APR* since last check.`,
              `OI ~${usd(oi)}`,
            ],
          });
          pending[key] = { firedAt: now, lastValue: nowA };
        }
      }
    }
  }

  // One alert per coin per cycle — a coin blowing up on every axis is a single
  // story. Priority: wide spread > funding extreme > flip.
  const typeRank = { spread_wide: 0, funding_extreme: 1, funding_flip: 2 };
  const bestPerCoin = new Map();
  for (const ev of events) {
    const cur = bestPerCoin.get(ev.coin);
    if (!cur || typeRank[ev.type] < typeRank[cur.type]) bestPerCoin.set(ev.coin, ev);
  }
  const unique = [...bestPerCoin.values()];

  // High severity first, then cap.
  unique.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
  const capped = unique.slice(0, cfg.maxPerCycle);
  const dropped = unique.length - capped.length;

  // Commit fire-state only for the alerts we're actually sending.
  for (const ev of capped) if (pending[ev.key]) state[ev.key] = pending[ev.key];

  return { events: capped, dropped, nextState: state };
}

function renderMessage(ev, siteUrl) {
  return [`${ev.title}`, ...ev.lines, `[open screener](${siteUrl})`].join('\n');
}

module.exports = { detectAlerts, renderMessage };
