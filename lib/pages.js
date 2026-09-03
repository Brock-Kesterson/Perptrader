'use strict';

// Server-rendered SEO pages: per-coin funding pages, a coin index, a spreads
// page, and sitemap.xml. These render the current snapshot into static HTML on
// every request so search engines index real, fresh numbers without running JS.

const { VENUE_LABELS } = require('./normalize');

const VENUES = ['binance', 'bybit', 'okx', 'hyperliquid'];
const SITE_URL = (process.env.PERPRADAR_URL || 'https://perpradar.example').replace(/\/$/, '');
const BRAND = 'PerpRadar';

// --- formatting ---
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
function pct(x, dp) {
  if (x == null) return '—';
  const p = x * 100;
  const d = dp != null ? dp : Math.abs(p) >= 100 ? 0 : Math.abs(p) >= 10 ? 1 : 2;
  return `${p > 0 ? '+' : ''}${p.toFixed(d)}%`;
}
function usd(x) {
  if (x == null) return '—';
  if (x >= 1e9) return `$${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `$${(x / 1e6).toFixed(0)}M`;
  if (x >= 1e3) return `$${(x / 1e3).toFixed(0)}K`;
  return `$${x.toFixed(0)}`;
}
function ago(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)}h ago`;
}
function avgApr(c) {
  const xs = VENUES.map((v) => c.venues[v]?.apr).filter((x) => x != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

const STYLE = `
:root{--bg:#0b0e13;--panel:#131822;--line:#263041;--text:#d7dee8;--dim:#8794a7;--pos:#37d67a;--neg:#ff5c6c;--accent:#4c9ffe}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:0 20px}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
header{border-bottom:1px solid var(--line);padding:16px 0}
header .brand{font-weight:700;color:#fff}
main{padding:30px 0 60px}
h1{font-size:26px;color:#fff;margin:0 0 6px}
.upd{color:var(--dim);font-size:13px;margin-bottom:24px}
h2{font-size:18px;color:#fff;margin:32px 0 10px}
table{width:100%;border-collapse:collapse;font-size:14px;margin:10px 0;overflow-x:auto;display:block}
@media(min-width:560px){table{display:table}}
th,td{border:1px solid var(--line);padding:8px 12px;text-align:right}
th:first-child,td:first-child{text-align:left}
thead th{background:var(--panel);color:var(--dim)}
.pos{color:var(--pos)}.neg{color:var(--neg)}.dim{color:var(--dim)}
.lead{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px 20px}
.pill{display:inline-block;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:3px 8px;margin:3px 4px 3px 0;font-size:13px;font-family:ui-monospace,Menlo,Consolas,monospace}
footer{border-top:1px solid var(--line);padding:20px 0;color:var(--dim);font-size:13px}
.note{color:var(--dim);font-size:13px;margin-top:24px}
`;

function shell({ title, description, canonical, body, jsonLd }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%F0%9F%93%A1%3C/text%3E%3C/svg%3E">
<style>${STYLE}</style>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
</head>
<body>
<header><div class="wrap"><a class="brand" href="/">📡 ${BRAND}</a> · <a href="/funding">All coins</a> · <a href="/spreads">Spreads</a></div></header>
<main><div class="wrap">${body}</div></main>
<footer><div class="wrap">${BRAND} tracks perpetual-futures funding across ${VENUES.map((v) => VENUE_LABELS[v]).join(', ')}. Data refreshes every ~15 minutes. <strong>Not financial advice</strong> — funding rates change hourly and figures shown are gross of fees, slippage and borrow cost.</div></footer>
</body>
</html>`;
}

function venueTable(c) {
  const rows = VENUES.map((v) => {
    const d = c.venues[v];
    if (!d) return `<tr><td>${VENUE_LABELS[v]}</td><td class="dim">not listed</td><td class="dim">—</td><td class="dim">—</td></tr>`;
    const cls = d.apr > 0.001 ? 'pos' : d.apr < -0.001 ? 'neg' : 'dim';
    const per = d.intervalHours ? `${d.intervalHours}h` : '—';
    const nxt = d.nextFundingTime ? new Date(d.nextFundingTime).toISOString().slice(11, 16) + ' UTC' : '—';
    return `<tr><td>${VENUE_LABELS[v]}${d.predicted ? ' <span class="dim">(predicted)</span>' : ''}</td><td class="${cls}">${pct(d.apr)}</td><td class="dim">${per}</td><td class="dim">${nxt}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Venue</th><th>Funding APR</th><th>Interval</th><th>Next</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// Honest templated prose — real numbers, no hype.
function explainer(c) {
  const hi = c.venues[c.maxAprVenue];
  const lo = c.venues[c.minAprVenue];
  const dirWord = c.maxApr > 0 && c.minApr > 0 ? 'positive on every venue' :
    c.maxApr < 0 && c.minApr < 0 ? 'negative on every venue' : 'mixed across venues';
  const bits = [];
  bits.push(`As of ${ago(c._fetchedAt)}, ${c.coin} perpetual funding is <strong>${dirWord}</strong>.`);
  if (hi) {
    const daily = hi.apr / 365;
    bits.push(`The richest rate is <strong>${pct(hi.apr)} APR</strong> on ${VENUE_LABELS[c.maxAprVenue]} — a long there pays roughly ${pct(daily, 3)} per day while the rate holds (a short collects it).`);
  }
  if (lo && c.minAprVenue !== c.maxAprVenue) {
    bits.push(`The cheapest is <strong>${pct(lo.apr)} APR</strong> on ${VENUE_LABELS[c.minAprVenue]}.`);
  }
  if (c.spreadApr != null && c.spreadApr > 0.02) {
    bits.push(`The widest market-neutral spread is <strong>${pct(c.spreadApr)} APR</strong>: long the ${c.coin} perp on ${VENUE_LABELS[c.spreadLongVenue]}, short it on ${VENUE_LABELS[c.spreadShortVenue]}, and the position has no ${c.coin} price exposure — just the funding gap (before fees).`);
  }
  if (c.openInterestUsd != null) bits.push(`Tracked open interest is around ${usd(c.openInterestUsd)}.`);
  return bits.join(' ');
}

function coinPage(coin, snapshot) {
  const c = snapshot.coins.find((x) => x.coin === coin.toUpperCase());
  if (!c) return null;
  c._fetchedAt = snapshot.fetchedAt;
  const title = `${c.coin} Funding Rates — Binance, Bybit, OKX, Hyperliquid | ${BRAND}`;
  const description =
    `Live ${c.coin} perpetual futures funding rates across Binance, Bybit, OKX and Hyperliquid, annualized. ` +
    `Currently ${pct(avgApr(c))} average APR. Cross-venue spread ${c.spreadApr != null ? pct(c.spreadApr) : 'n/a'}.`;
  const canonical = `${SITE_URL}/funding/${c.coin}`;
  const body = `
<h1>${c.coin} Perpetual Funding Rates</h1>
<p class="upd">Updated ${ago(snapshot.fetchedAt)} · annualized from current funding</p>
<p class="lead">${explainer(c)}</p>
<h2>Funding by venue</h2>
${venueTable(c)}
<h2>Cross-venue spread</h2>
<p>${c.spreadApr != null
    ? `Long ${c.coin} on <strong>${VENUE_LABELS[c.spreadLongVenue]}</strong>, short on <strong>${VENUE_LABELS[c.spreadShortVenue]}</strong> → <strong>${pct(c.spreadApr)} APR</strong> gross, delta-neutral.`
    : `Not enough venues quoting ${c.coin} to compute a spread right now.`}</p>
<p class="note">See the <a href="/">live screener</a> for all coins, or the <a href="/spreads">widest spreads right now</a>.</p>`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${c.coin} perpetual funding rates`,
    description,
    url: canonical,
    creator: { '@type': 'Organization', name: BRAND },
    dateModified: new Date(snapshot.fetchedAt).toISOString(),
  };
  return shell({ title, description, canonical, body, jsonLd });
}

function coinIndex(snapshot) {
  const coins = [...snapshot.coins]
    .filter((c) => c.venueCount >= 2)
    .sort((a, b) => (b.openInterestUsd ?? 0) - (a.openInterestUsd ?? 0));
  const links = coins.map((c) => `<a class="pill" href="/funding/${c.coin}">${c.coin} ${pct(avgApr(c))}</a>`).join('');
  const body = `
<h1>All Perpetual Funding Rates</h1>
<p class="upd">Updated ${ago(snapshot.fetchedAt)} · ${coins.length} contracts on 2+ venues</p>
<p>Per-coin funding across Binance, Bybit, OKX and Hyperliquid. Tap any coin for the venue-by-venue breakdown and the cross-venue spread.</p>
<div>${links}</div>`;
  return shell({
    title: `All Perp Funding Rates — Binance, Bybit, OKX, Hyperliquid | ${BRAND}`,
    description: `Perpetual futures funding rates for ${coins.length} coins across four venues, annualized and updated every 15 minutes.`,
    canonical: `${SITE_URL}/funding`,
    body,
  });
}

function spreadsPage(snapshot) {
  const rows = [...snapshot.coins]
    .filter((c) => c.spreadApr != null && c.venueCount >= 2 && (c.openInterestUsd ?? 0) >= 5e6)
    .sort((a, b) => b.spreadApr - a.spreadApr)
    .slice(0, 40);
  const trs = rows.map((c) => `<tr>
<td><a href="/funding/${c.coin}">${c.coin}</a></td>
<td class="pos">${pct(c.spreadApr)}</td>
<td class="dim">${VENUE_LABELS[c.spreadLongVenue]}</td>
<td class="dim">${VENUE_LABELS[c.spreadShortVenue]}</td>
<td class="dim">${usd(c.openInterestUsd)}</td></tr>`).join('');
  const body = `
<h1>Widest Funding-Rate Spreads Right Now</h1>
<p class="upd">Updated ${ago(snapshot.fetchedAt)} · market-neutral, gross of fees</p>
<p>For each coin, the gap between the venue with the richest funding and the cheapest. Long the cheap venue, short the rich one, and you hold the coin with no price exposure — just the spread.</p>
<table><thead><tr><th>Coin</th><th>Spread APR</th><th>Long</th><th>Short</th><th>OI</th></tr></thead><tbody>${trs}</tbody></table>
<p class="note">Spreads move fast and close as arbitrageurs act. Always net out taker fees on both legs and any spot borrow.</p>`;
  return shell({
    title: `Widest Perp Funding Spreads Right Now | ${BRAND}`,
    description: `Live ranking of the widest cross-venue perpetual funding spreads across Binance, Bybit, OKX and Hyperliquid. Updated every 15 minutes.`,
    canonical: `${SITE_URL}/spreads`,
    body,
  });
}

function sitemap(snapshot) {
  const urls = [`${SITE_URL}/`, `${SITE_URL}/funding`, `${SITE_URL}/spreads`];
  for (const c of snapshot.coins) if (c.venueCount >= 2) urls.push(`${SITE_URL}/funding/${c.coin}`);
  const lastmod = new Date(snapshot.fetchedAt).toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n')}
</urlset>`;
}

function robots() {
  return `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

module.exports = { coinPage, coinIndex, spreadsPage, sitemap, robots, SITE_URL };
