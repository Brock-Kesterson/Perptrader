'use strict';

// Central tunables. Env vars override where noted.

// OKX has no bulk funding-rate endpoint, so we fan out one request per
// instrument. A curated ~130-name list covers essentially everything liquid;
// set to [] to hit every OKX swap (~450 requests, slow + rate-limit risk).
const OKX_COINS = [
  'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'LINK', 'AVAX', 'SUI',
  'TON', 'TRX', 'DOT', 'BCH', 'NEAR', 'LTC', 'APT', 'ARB', 'OP', 'POL',
  'ATOM', 'FIL', 'HBAR', 'ICP', 'UNI', 'AAVE', 'INJ', 'SEI', 'TIA', 'STX',
  'RUNE', 'ORDI', 'WIF', 'PEPE', 'BONK', 'FLOKI', 'SHIB', 'JUP', 'PYTH', 'JTO',
  'ENA', 'W', 'ETHFI', 'STRK', 'DYM', 'PIXEL', 'PORTAL', 'MANTA', 'ALT', 'AI',
  'FET', 'RENDER', 'GRT', 'LDO', 'CRV', 'MKR', 'SNX', 'COMP', 'DYDX', 'GMX',
  'HYPE', 'ONDO', 'POPCAT', 'MEW', 'MOODENG', 'GOAT', 'PNUT', 'ACT', 'XMR', 'ZK',
  'ETC', 'XLM', 'ALGO', 'VET', 'FTM', 'S', 'AXS', 'SAND', 'MANA', 'GALA',
  'IMX', 'FLOW', 'CHZ', 'EGLD', 'THETA', 'EOS', 'KAVA', 'ROSE', 'ZIL', 'ONE',
  'ENS', 'DYDX', 'BLUR', '1INCH', 'SUSHI', 'YFI', 'BAL', 'ZRX', 'KSM', 'AR',
  'JASMY', 'IOTA', 'NEO', 'QNT', 'RPL', 'SSV', 'MAGIC', 'HOOK', 'ID', 'ACE',
  'TAO', 'PENDLE', 'MOVE', 'ME', 'VIRTUAL', 'AIXBT', 'GRIFFAIN', 'ZEREBRO',
  'AI16Z', 'FARTCOIN', 'KAITO', 'BERA', 'LAYER', 'IP', 'TRUMP', 'MELANIA',
  'PENGU', 'USUAL', 'MORPHO', 'EIGEN', 'APEX', 'ATH', 'DEEP', 'NC',
];

module.exports = {
  // Coins to fan OKX per-instrument funding requests over. [] = every OKX swap.
  okxCoins: OKX_COINS,

  // dYdX v4 disabled by default: its `nextFundingRate` field returns values
  // that don't reconcile with the other four venues (see dry-run notes).
  includeDydx: false,

  // Digest thresholds
  digest: {
    topN: 8,                          // rows per digest section
    minOpenInterestUsd: 10_000_000,   // liquidity floor for digest rows
    baselineApr: 0.12,                // |APR| below this ≈ neutral funding, not a signal
    extremeAprCap: 3.0,               // |avg APR| above this ≈ settlement/delisting artifact, drop
    spreadHighlightApr: 0.15,         // 15% APR cross-venue spread worth calling out
  },

  // Where snapshots + digests are written
  dataDir: require('path').join(__dirname, '..', 'data'),
};
