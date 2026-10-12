// Market data (Bitcoin + Gold in USD) comes from our own backend, which
// fetches it from CoinGecko and caches it. See backend/src/routes/market.js.

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

// Small in-browser cache so switching tabs/ranges back and forth is instant.
const memo = new Map();
const TTL_MS = 60_000;

async function getJson(path, { fresh = false } = {}) {
  const hit = memo.get(path);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let res;
  try {
    res = await fetch(`${BACKEND_URL}${path}`);
  } catch {
    const err = new Error("BACKEND_UNREACHABLE");
    err.code = "BACKEND_UNREACHABLE";
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || "Market data unavailable");
    err.code = json.error || "UNKNOWN";
    throw err;
  }
  memo.set(path, { value: json, at: Date.now() });
  return json;
}

export function getMarketOverview(opts) {
  return getJson("/api/market/overview", opts);
}

export function getMarketGlobal(opts) {
  return getJson("/api/market/global", opts);
}

export function getMarketHistory(asset, days, opts) {
  return getJson(`/api/market/history/${asset}?days=${days}`, opts);
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
