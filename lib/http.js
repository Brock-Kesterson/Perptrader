'use strict';

// Tiny fetch wrapper: JSON only, timeout, one retry on network/5xx.
// No dependencies — relies on global fetch (Node >= 18).

const DEFAULT_TIMEOUT_MS = 12000;
const USER_AGENT = 'PerpRadar/0.1 (+https://perpradar.example)';

async function httpJson(url, opts = {}) {
  const { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1 } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'accept': 'application/json',
          'user-agent': USER_AGENT,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const err = new Error(`HTTP ${res.status} for ${url} ${text.slice(0, 200)}`);
        err.status = res.status;
        // Retry only transient server errors.
        if (res.status >= 500 && attempt < retries) { lastErr = err; continue; }
        throw err;
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr;
}

// Run async tasks with bounded concurrency; never rejects — returns
// { value } / { error } per input so one bad instrument can't sink a poll.
async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { value: await fn(items[i], i) };
      } catch (error) {
        results[i] = { error };
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

module.exports = { httpJson, mapPool };
