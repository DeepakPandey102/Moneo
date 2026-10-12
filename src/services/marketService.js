// Market data (crypto + gold in USD).
//
// 1st choice: straight from the browser to CoinGecko / alternative.me.
//   Fast, no server to wake up, and CoinGecko doesn't block normal users the
//   way it often blocks shared cloud servers.
// Backup: our own backend (backend/src/routes/market.js), which has its own
//   cache and can use a CoinGecko API key.
// Every request gives up after a few seconds, so the page shows a message
// with "Try again" instead of loading forever.

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const COINGECKO = "https://api.coingecko.com/api/v3";
const FEAR_GREED = "https://api.alternative.me/fng/?limit=31";

// Same list and order as the backend.
const ASSETS = [
  { key: "bitcoin", id: "bitcoin", symbol: "BTC", name: "Bitcoin", type: "crypto" },
  { key: "ethereum", id: "ethereum", symbol: "ETH", name: "Ethereum", type: "crypto" },
  { key: "gold", id: "pax-gold", symbol: "XAU", name: "Gold", type: "commodity" },
  { key: "litecoin", id: "litecoin", symbol: "LTC", name: "Litecoin", type: "crypto" },
  { key: "xrp", id: "ripple", symbol: "XRP", name: "XRP", type: "crypto" },
  { key: "solana", id: "solana", symbol: "SOL", name: "Solana", type: "crypto" },
  { key: "bnb", id: "binancecoin", symbol: "BNB", name: "BNB", type: "crypto" },
  { key: "dogecoin", id: "dogecoin", symbol: "DOGE", name: "Dogecoin", type: "crypto" },
];
const BY_KEY = Object.fromEntries(ASSETS.map((a) => [a.key, a]));

// In-browser cache: instant when switching ranges/assets, and the last good
// answer survives a failed refresh.
const memo = new Map();
const TTL_MS = 60_000;

async function fetchJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.message || `HTTP ${res.status}`);
      err.code = json.error || `HTTP_${res.status}`;
      throw err;
    }
    return json;
  } catch (err) {
    if (err.name === "AbortError") {
      const e = new Error("TIMEOUT");
      e.code = "TIMEOUT";
      throw e;
    }
    if (!err.code) err.code = "UNREACHABLE";
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Try the direct source, then the backend. Cached for a minute.
async function load(cacheKey, direct, backendPath, { fresh = false } = {}) {
  const hit = memo.get(cacheKey);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const value = await direct();
    memo.set(cacheKey, { value, at: Date.now() });
    return value;
  } catch (directErr) {
    console.warn(`[market] direct ${cacheKey} failed (${directErr.code}), trying Moneo server`);
    try {
      const value = await fetchJson(`${BACKEND_URL}${backendPath}`, 25_000);
      memo.set(cacheKey, { value, at: Date.now() });
      return value;
    } catch (backendErr) {
      if (hit) return { ...hit.value, stale: true }; // old data beats nothing
      const err = new Error("Market data unavailable");
      err.code = backendErr.code === "UNREACHABLE" ? "BACKEND_UNREACHABLE" : "UNAVAILABLE";
      throw err;
    }
  }
}

function thin(arr, max) {
  if (!Array.isArray(arr) || arr.length <= max) return arr || [];
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
}

function mapMarketRow(meta, r) {
  return {
    key: meta.key, symbol: meta.symbol, name: meta.name, type: meta.type,
    image: r.image, rank: r.market_cap_rank, price: r.current_price,
    change1h: r.price_change_percentage_1h_in_currency ?? null,
    change24h: r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h ?? null,
    change7d: r.price_change_percentage_7d_in_currency ?? null,
    change30d: r.price_change_percentage_30d_in_currency ?? null,
    change1y: r.price_change_percentage_1y_in_currency ?? null,
    high24h: r.high_24h, low24h: r.low_24h, marketCap: r.market_cap, volume24h: r.total_volume,
    ath: r.ath, athDate: r.ath_date, athChangePct: r.ath_change_percentage,
    atl: r.atl, atlDate: r.atl_date,
    circulatingSupply: r.circulating_supply, maxSupply: r.max_supply,
    sparkline: thin(r.sparkline_in_7d?.price || [], 56),
    updatedAt: r.last_updated,
  };
}

export function getMarketOverview(opts) {
  return load("overview", async () => {
    const ids = ASSETS.map((a) => a.id).join(",");
    const rows = await fetchJson(
      `${COINGECKO}/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true&price_change_percentage=1h,24h,7d,30d,1y`,
      9_000
    );
    const assets = ASSETS.map((meta) => {
      const r = rows.find((row) => row.id === meta.id);
      return r ? mapMarketRow(meta, r) : null;
    }).filter(Boolean);
    if (!assets.length) throw Object.assign(new Error("EMPTY"), { code: "EMPTY" });
    return { assets, source: "CoinGecko", fetchedAt: new Date().toISOString() };
  }, "/api/market/overview", opts);
}

export function getMarketGlobal(opts) {
  return load("global", async () => {
    const [g, f] = await Promise.allSettled([
      fetchJson(`${COINGECKO}/global`, 9_000),
      fetchJson(FEAR_GREED, 9_000),
    ]);
    if (g.status === "rejected" && f.status === "rejected") throw g.reason;
    const d = g.status === "fulfilled" ? g.value?.data : null;
    const fng = f.status === "fulfilled" ? f.value?.data : null;
    return {
      totalMarketCap: d?.total_market_cap?.usd ?? null,
      totalVolume24h: d?.total_volume?.usd ?? null,
      marketCapChange24h: d?.market_cap_change_percentage_24h_usd ?? null,
      dominance: d ? { btc: d.market_cap_percentage?.btc ?? null, eth: d.market_cap_percentage?.eth ?? null } : null,
      activeCryptos: d?.active_cryptocurrencies ?? null,
      fearGreed: Array.isArray(fng) && fng.length
        ? {
            value: Number(fng[0].value),
            label: fng[0].value_classification,
            history: fng.map((x) => ({ t: Number(x.timestamp) * 1000, value: Number(x.value) })).reverse(),
          }
        : null,
      fetchedAt: new Date().toISOString(),
    };
  }, "/api/market/global", opts);
}

export function getMarketHistory(asset, days, opts) {
  const meta = BY_KEY[asset];
  return load(`history:${asset}:${days}`, async () => {
    if (!meta) throw Object.assign(new Error("UNKNOWN_ASSET"), { code: "UNKNOWN_ASSET" });
    const json = await fetchJson(`${COINGECKO}/coins/${meta.id}/market_chart?vs_currency=usd&days=${days}`, 10_000);
    const points = thin((json.prices || []).map(([t, price]) => ({ t, price })), 360);
    if (!points.length) throw Object.assign(new Error("EMPTY"), { code: "EMPTY" });
    return { asset, days, points, fetchedAt: new Date().toISOString() };
  }, `/api/market/history/${asset}?days=${days}`, opts);
}

// ---------- helpers used by the Market page ----------

export const TROY_OUNCE_GRAMS = 31.1034768;
export const DON_GRAMS = 3.75; // 1돈, the unit Korean gold shops use

export function usd(value, { compact = false } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (n > 0 && n < 1) {
    // small prices (DOGE, XRP) need more decimals to be meaningful
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 4 }).format(n);
  }
  if (compact) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(n);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
    minimumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
}

export function compactNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(Number(value));
}

export function pct(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

// Summary of a price series: change, high/low, how much it swung, trend.
export function seriesStats(points, days) {
  if (!points?.length) return null;
  const prices = points.map((p) => p.price);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const changePct = first ? ((last - first) / first) * 100 : 0;
  const swingPct = low ? ((high - low) / low) * 100 : 0;
  // A move smaller than this counts as "sideways" for the chosen range.
  const flat = days <= 1 ? 0.5 : days <= 7 ? 1.5 : days <= 30 ? 3 : 5;
  const trend = changePct > flat ? "up" : changePct < -flat ? "down" : "flat";
  return { first, last, high, low, changePct, swingPct, trend };
}

// ---------- technical indicators ----------
// Both work on the chart's data points (5-minute on 24H, hourly on 7D,
// a few hours on 1M/3M, daily on 1Y).

// Simple moving average; null until there are enough points.
export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// Relative Strength Index (Wilder's smoothing). 0–100:
// above 70 = "overbought" (rose fast), below 30 = "oversold" (fell fast).
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function rsiZone(value) {
  if (value == null) return null;
  if (value >= 70) return "overbought";
  if (value <= 30) return "oversold";
  return "neutral";
}

// Fear & Greed colour by zone
export function fearGreedColor(v) {
  if (v == null) return "#8A93B5";
  if (v < 25) return "#F87171";
  if (v < 45) return "#FB923C";
  if (v <= 55) return "#FBBF24";
  if (v <= 75) return "#86EFAC";
  return "#34D399";
}
