'use strict';

const VENUES = ['binance', 'bybit', 'okx', 'hyperliquid'];
const SHORT = { binance: 'BIN', bybit: 'BYB', okx: 'OKX', hyperliquid: 'HL', dydx: 'DYDX' };
const REFRESH_MS = 60_000;

const state = { data: null, sort: 'oi', dir: 'desc', filter: '', liquidOnly: true };

const $ = (s) => document.querySelector(s);
const rowsEl = $('#rows');
const metaEl = $('#meta');

function fmtApr(x) {
  if (x == null) return { txt: '–', cls: 'muted' };
  const p = x * 100;
  const dp = Math.abs(p) >= 100 ? 0 : Math.abs(p) >= 10 ? 1 : 2;
  return { txt: `${x > 0 ? '+' : ''}${p.toFixed(dp)}%`, cls: x > 0.001 ? 'pos' : x < -0.001 ? 'neg' : 'muted' };
}
function fmtUsd(x) {
  if (x == null) return '–';
  if (x >= 1e9) return `$${(x / 1e9).toFixed(1)}B`;
  if (x >= 1e6) return `$${(x / 1e6).toFixed(0)}M`;
  if (x >= 1e3) return `$${(x / 1e3).toFixed(0)}K`;
  return `$${x.toFixed(0)}`;
}

async function load() {
  try {
    const r = await fetch('/api/funding?limit=400');
    if (!r.ok) throw new Error(r.status);
    state.data = await r.json();
    render();
  } catch (e) {
    metaEl.innerHTML = `<span class="stale">could not load funding data (${e.message})</span>`;
  }
}

function tick() {
  if (!state.data) return;
  const age = Math.round((Date.now() - state.data.fetchedAt) / 1000);
  const stale = age > 1500;
  const mins = Math.floor(age / 60);
  const venueList = Object.entries(state.data.venueCounts || {}).map(([v, n]) => `${SHORT[v] || v} ${n}`).join(' · ');
  metaEl.innerHTML =
    `<span class="${stale ? 'stale' : ''}">updated ${mins ? mins + 'm' : age + 's'} ago</span>` +
    ` · ${state.data.count} contracts · ${venueList}` +
    (state.data.missing?.length ? ` · <span class="stale">missing: ${state.data.missing.join(',')}</span>` : '');
}

function sortedRows() {
  let coins = [...(state.data.coins || [])];
  if (state.liquidOnly) {
    coins = coins.filter((c) => {
      if ((c.openInterestUsd ?? 0) < 10e6) return false;
      // Hide settlement / delisting blowouts (|avg APR| > 300%).
      const aprs = VENUES.map((v) => c.venues[v]?.apr).filter((x) => x != null);
      const avg = aprs.length ? aprs.reduce((a, b) => a + b, 0) / aprs.length : 0;
      return Math.abs(avg) <= 3;
    });
  }
  if (state.filter) {
    const f = state.filter.toUpperCase();
    coins = coins.filter((c) => c.coin.includes(f));
  }
  const key = {
    coin: (c) => c.coin,
    oi: (c) => c.openInterestUsd ?? -1,
    spread: (c) => c.spreadApr ?? -Infinity,
    carry: (c) => c.absMaxApr ?? -1,
    binance: (c) => c.venues.binance?.apr ?? -Infinity,
    bybit: (c) => c.venues.bybit?.apr ?? -Infinity,
    okx: (c) => c.venues.okx?.apr ?? -Infinity,
    hyperliquid: (c) => c.venues.hyperliquid?.apr ?? -Infinity,
  }[state.sort] || ((c) => c.openInterestUsd ?? -1);
  const mul = state.dir === 'asc' ? 1 : -1;
  coins.sort((a, b) => {
    const x = key(a), y = key(b);
    return typeof x === 'string' ? mul * x.localeCompare(y) : mul * (x - y);
  });
  return coins;
}

function render() {
  tick();
  const coins = sortedRows();
  if (!coins.length) {
    rowsEl.innerHTML = `<tr><td colspan="7" class="empty">No coins match.</td></tr>`;
  } else {
    rowsEl.innerHTML = coins.map((c) => {
      const cells = VENUES.map((v) => {
        const f = fmtApr(c.venues[v]?.apr);
        const pred = c.venues[v]?.predicted ? ' title="predicted (via Hyperliquid feed)"' : '';
        return `<td class="${f.cls}"${pred}>${f.txt}</td>`;
      }).join('');
      const spread = c.spreadApr == null
        ? '<td class="muted">–</td>'
        : `<td><span class="spread">${fmtApr(c.spreadApr).txt}</span> <span class="route">${SHORT[c.spreadLongVenue]}→${SHORT[c.spreadShortVenue]}</span></td>`;
      return `<tr><td class="coin">${c.coin}</td>${cells}${spread}<td class="muted">${fmtUsd(c.openInterestUsd)}</td></tr>`;
    }).join('');
  }
  document.querySelectorAll('thead th').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.k === state.sort);
  });
  document.querySelectorAll('#sortseg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.sort === state.sort);
  });
}

// --- events ---
$('#filter').addEventListener('input', (e) => { state.filter = e.target.value.trim(); render(); });
$('#liquidOnly').addEventListener('change', (e) => { state.liquidOnly = e.target.checked; render(); });
document.querySelectorAll('#sortseg button').forEach((b) => {
  b.addEventListener('click', () => { state.sort = b.dataset.sort; state.dir = 'desc'; render(); });
});
document.querySelectorAll('thead th').forEach((th) => {
  th.addEventListener('click', () => {
    const k = th.dataset.k;
    if (state.sort === k) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else { state.sort = k; state.dir = k === 'coin' ? 'asc' : 'desc'; }
    render();
  });
});

// --- digest (tiny markdown renderer: headings, tables, hr, bold, code) ---
function mdToHtml(md) {
  const esc = (s) => s.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
  const inline = (s) => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\|.*\|$/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || '')) {
      const head = line.split('|').slice(1, -1).map((c) => `<th>${inline(c.trim())}</th>`).join('');
      i += 2;
      const body = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i])) {
        body.push('<tr>' + lines[i].split('|').slice(1, -1).map((c) => `<td>${inline(c.trim())}</td>`).join('') + '</tr>');
        i++;
      }
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body.join('')}</tbody></table>`);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      const lvl = line.match(/^#+/)[0].length;
      out.push(`<h${lvl}>${inline(line.replace(/^#+\s/, ''))}</h${lvl}>`);
    } else if (/^---+$/.test(line)) {
      out.push('<hr>');
    } else if (line.trim() === '') {
      // skip
    } else {
      out.push(`<p>${inline(line)}</p>`);
    }
    i++;
  }
  return out.join('\n');
}

async function loadDigest() {
  try {
    const r = await fetch('/api/digest?format=md');
    if (!r.ok) throw new Error(r.status);
    $('#digestBody').innerHTML = mdToHtml(await r.text());
  } catch {
    $('#digestBody').textContent = 'Digest unavailable.';
  }
}

// --- subscribe ---
$('#subForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const msg = $('#subMsg');
  btn.disabled = true;
  msg.className = 'submsg';
  msg.textContent = '';
  try {
    const r = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: $('#email').value.trim() }),
    });
    const j = await r.json();
    if (r.ok) { msg.className = 'submsg ok'; msg.textContent = "You're on the list. First digest lands tomorrow."; e.target.reset(); }
    else { msg.className = 'submsg err'; msg.textContent = j.error || 'Something went wrong.'; }
  } catch {
    msg.className = 'submsg err';
    msg.textContent = 'Network error — try again.';
  }
  btn.disabled = false;
});

load();
loadDigest();
setInterval(load, REFRESH_MS);
setInterval(tick, 1000);
