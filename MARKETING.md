# PerpRadar — marketing playbook

Everything here is copy-paste ready. Brock's job: run one command a day, paste the output,
and post the launch content below when the site is live. Claude writes/refreshes all of it.

**Hard rules (don't break these):**
- Always keep the "not financial advice" framing. We publish data, we don't tell people to trade.
- No return promises, no "guaranteed", no "risk-free" (funding arb has real risks — venue, execution, liquidation on the short leg).
- On Reddit, be a participant first. Answer questions, don't just drop links. Most subs remove
  posts from accounts that only ever self-promote.
- One post per subreddit per launch item, spaced out. Don't cross-post the same text to 6 subs in an hour.

---

## The daily loop (~3 min)

```bash
cd ~/perpradar        # or the Windows folder while developing
npm run digest        # prints the digest + a "SOCIAL BLURB" block, writes data/digests/
```

1. Copy the **SOCIAL BLURB** → post to X (add the site link as the last line).
2. Once a week, take the full digest markdown → paste into the newsletter (Substack) and send.
3. Skim the digest for anything genuinely weird (a coin at -200% APR on every venue, a huge
   new spread). If something jumps out, that's a standalone post — quote the number, ask
   "anyone know why?" People love explaining.

---

## Launch posts (use once, when the site is live at a real URL)

### 1. X — pinned thread

> 1/ Perp funding rates decide whether being long or short *costs* you or *pays* you — often
> more than the price move itself. But the rate is different on every exchange, and nobody
> shows them side by side.
>
> So I built PerpRadar. [URL]
>
> 2/ It pulls funding from Binance, Bybit, OKX and Hyperliquid every 15 min, annualizes each
> one, and lines them up per coin. Green = longs are paying shorts. Red = shorts are paying longs.
>
> 3/ The useful column is "spread": for each coin, the gap between the venue with the richest
> funding and the cheapest. Long the cheap one, short the rich one, and you're market-neutral
> while the gap closes. Gross of fees — do your own math.
>
> 4/ There's a free daily digest (biggest funding, widest spreads, 24h moves) — email signup
> on the site. Live screener is free too.
>
> 5/ Not financial advice, funding changes hourly, the short leg can still liquidate you.
> It's a data tool, not a strategy. Feedback welcome — what would make it more useful?

### 2. Reddit — r/algotrading

**Title:** I built a free cross-venue perp funding-rate screener (Binance/Bybit/OKX/Hyperliquid)

> Funding-rate arb keeps coming up here so I built a tool for the boring first step: seeing
> where funding actually is across venues at a glance.
>
> [URL] — pulls funding every 15 min, annualizes it, shows all four venues per coin plus the
> widest long-cheap/short-rich spread. Free screener + a free daily digest. No signup for the
> screener.
>
> Stack is dumb-simple: vanilla Node, no dependencies, public exchange endpoints only (funny
> detail — Binance and Bybit both geoblock US IPs, so their rates come in via Hyperliquid's
> predicted-funding feed, which isn't blocked).
>
> Known limitations: Binance/Bybit rates are *predicted* not settled, open-interest numbers
> are rough, and I dropped dYdX because its funding field didn't reconcile. Curious what
> people who actually run funding strategies would want added — historical charts? alerts on
> a spread threshold? per-venue fee-adjusted net?
>
> Not financial advice etc. — it's a data tool.

### 3. Reddit — r/perptrading (or r/defi, r/CryptoMarkets)

**Title:** Made a thing that shows perp funding across Binance/Bybit/OKX/Hyperliquid side by side

> Got tired of opening four tabs to compare funding, so: [URL]
>
> Free screener, updates every 15 min, sortable by funding size or by the cross-venue spread.
> There's also a daily email digest with the biggest rates and moves if that's useful.
>
> Would love feedback on what's missing. Not advice, just data.

### 4. Show HN (once it's on a real domain with HTTPS)

**Title:** Show HN: PerpRadar – cross-venue perpetual futures funding rates

> Funding rates on perpetual futures are quoted per-exchange and per-interval (8h on Binance,
> 1h on Hyperliquid), which makes them hard to compare. PerpRadar normalizes everything to APR
> and shows Binance/Bybit/OKX/Hyperliquid per coin, plus the widest market-neutral spread.
>
> No dependencies, public endpoints only. Binance and Bybit geoblock US IPs so those rates
> come via Hyperliquid's predicted-funding endpoint. Free screener and daily digest.
>
> Happy to answer questions about the data pipeline or the funding mechanics.

---

## Cold outreach (X DMs) — for later, once the site has a track record

Target: people who tweet about "delta neutral", "funding farming", "basis trade", "cash and carry".
Don't pitch on first contact.

> saw your post on [their topic]. built a free tool that tracks funding across Binance/Bybit/
> OKX/HL side by side — [URL]. no signup for the screener. would genuinely like your take on
> whether the spread column is calculated the way you'd want it.

---

## Newsletter (Substack)

- Name suggestion: "The Funding Digest" or just "PerpRadar"
- Cadence: daily is ideal but weekly is fine to start (Sunday, "the week in funding")
- Each issue = the full `data/digests/YYYY-MM-DD.md` + 2-3 sentences of human commentary on
  the standout item
- Every issue ends with a link to the live screener and the "not advice" line
- After ~10 issues, add a soft mention of the paid tier (alerts) at the bottom

---

## What "working" looks like (checkpoints, not promises)

| Month | Rough target |
|---|---|
| 1 | Site live, 30+ newsletter subs, posting daily without it feeling forced |
| 2 | 100+ subs, one post got real traction, first "this is useful" replies |
| 3 | Paid tier live (alerts), 300+ subs, first 1-5 paying users |
| 6 | 1,000+ subs, 10-30 paying users, SEO pages starting to pull traffic |

If month 1-2 gets no traction at all despite consistent posting, that's real signal — we'd
rethink the niche, not just push harder.
