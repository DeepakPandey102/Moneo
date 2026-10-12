import express from "express";

// Market data for the Market page: major cryptocurrencies + gold, in USD.
//
// Sources (both free, no key required):
//   - CoinGecko  → prices, 7-day sparklines, price history, global crypto stats
//   - alternative.me → Crypto Fear & Greed Index
//
// Gold is tracked through PAX Gold (PAXG), a token backed 1:1 by one troy
// ounce of London gold, so it follows the gold spot price closely and comes
// with full price history from the same API.
//
// Everything is cached in memory, so many visitors share a handful of
// upstream calls (CoinGecko's free tier allows ~30 calls/minute). If an
// upstream call fails, the last good answer is served (marked stale).

const router = express.Router();
const COINGECKO = "https://api.coingecko.com/api/v3";
const FEAR_GREED = "https://api.alternative.me/fng/?limit=31";

// Order here = order on the page.
export const ASSETS = [
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
const RANGES = [1, 7, 30, 90, 365];
const MAX_POINTS = 360;

// ---------- caching ----------
// "Stale-while-revalidate": once something is cached, every visitor gets it
// INSTANTLY, and if it's older than its TTL a refresh starts in the
// background. Only the very first request ever waits for CoinGecko.
// Identical requests that arrive together share one upstream call.
const cache = new Map();    // key -> { value, at }
const inflight = new Map(); // key -> Promise

function refresh(key, loader) {
  if (inflight.has(key)) return inflight.get(key);
  const p = loader()
    .then((value) => {
      cache.set(key, { value, at: Date.now() });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit) {
    if (Date.now() - hit.at > ttlMs) {
      refresh(key, loader).catch((err) => console.warn(`[market] background refresh ${key}:`, err.message));
    }
    const ageMs = Date.now() - hit.at;
    // Mark as stale only when it's clearly old (refresh kept failing).
    return ageMs > ttlMs * 3 ? { ...hit.value, stale: true } : hit.value;
  }
  return refresh(key, loader);
}

// ---------- upstream calls ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) {
    const err = new Error(`${new URL(url).host} responded ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// CoinGecko rejects bursts (HTTP 429), especially from shared cloud servers
// like Render. So calls go out one at a time with a small gap, and a 429 is
// retried after a pause. A free "Demo" key allows a faster pace.
let cgQueue = Promise.resolve();
let cgLast = 0;

function coingecko(path) {
  const hasKey = Boolean(process.env.COINGECKO_API_KEY);
  const gapMs = hasKey ? 2200 : 4500;
  const headers = hasKey ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY } : {};

  const run = cgQueue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = cgLast + gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      cgLast = Date.now();
      try {
        return await getJson(`${COINGECKO}${path}`, headers);
      } catch (err) {
        if (err.status === 429 && attempt < 2) {
          console.warn(`[market] CoinGecko 429 on ${path.split("?")[0]}, retrying`);
          await sleep(attempt === 0 ? 8_000 : 20_000);
          continue;
        }
        throw err;
      }
    }
  });
  cgQueue = run.catch(() => {}); // keep the queue going after a failure
  return run;
}

function downsample(points, max) {
  if (!Array.isArray(points) || points.length <= max) return points || [];
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

function unavailable(res, what) {
  res.status(503).json({ error: "market_unavailable", message: `${what} is unavailable right now. Please try again in a minute.` });
}

// GET /api/market/overview → every asset: price, changes, stats, 7-day sparkline
router.get("/overview", async (req, res) => {
  try {
    const value = await cached("overview", 2 * 60_000, loadOverview);
    res.json(value);
  } catch (err) {
    console.error("[market/overview]", err.message);
    unavailable(res, "Market prices");
  }
});

async function loadOverview() {
  const ids = ASSETS.map((a) => a.id).join(",");
  const rows = await coingecko(
    `/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true&price_change_percentage=1h,24h,7d,30d,1y`
  );
  const assets = ASSETS.map((meta) => {
    const r = rows.find((row) => row.id === meta.id);
    if (!r) return null;
    return {
      key: meta.key,
      symbol: meta.symbol,
      name: meta.name,
      type: meta.type,
      image: r.image,
      rank: r.market_cap_rank,
      price: r.current_price,
      change1h: r.price_change_percentage_1h_in_currency ?? null,
      change24h: r.price_change_percentage_24h_in_currency ?? r.price_change_percentage_24h ?? null,
      change7d: r.price_change_percentage_7d_in_currency ?? null,
      change30d: r.price_change_percentage_30d_in_currency ?? null,
      change1y: r.price_change_percentage_1y_in_currency ?? null,
      high24h: r.high_24h,
      low24h: r.low_24h,
      marketCap: r.market_cap,
      volume24h: r.total_volume,
      ath: r.ath,
      athDate: r.ath_date,
      athChangePct: r.ath_change_percentage,
      atl: r.atl,
      atlDate: r.atl_date,
      circulatingSupply: r.circulating_supply,
      maxSupply: r.max_supply,
      sparkline: downsample(r.sparkline_in_7d?.price || [], 56),
      updatedAt: r.last_updated,
    };
  }).filter(Boolean);

  // If an asset is missing from the list (CoinGecko sometimes drops one),
  // fetch just its price so the row still shows.
  const missing = ASSETS.filter((meta) => !assets.some((a) => a.key === meta.key));
  if (missing.length) {
    try {
      const ids = missing.map((m) => m.id).join(",");
      const simple = await coingecko(`/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`);
      for (const meta of missing) {
        const r = simple[meta.id];
        if (!r?.usd) continue;
        assets.push({
          key: meta.key, symbol: meta.symbol, name: meta.name, type: meta.type, image: null, rank: null,
          price: r.usd, change24h: r.usd_24h_change ?? null, change1h: null, change7d: null, change30d: null, change1y: null,
          high24h: null, low24h: null, marketCap: r.usd_market_cap ?? null, volume24h: r.usd_24h_vol ?? null,
          ath: null, athDate: null, athChangePct: null, atl: null, atlDate: null,
          circulatingSupply: null, maxSupply: null, sparkline: [], updatedAt: null,
        });
      }
      assets.sort((a, b) => ASSETS.findIndex((m) => m.key === a.key) - ASSETS.findIndex((m) => m.key === b.key));
    } catch (err) {
      console.warn("[market] fallback price failed:", err.message);
    }
  }
  return { assets, source: "CoinGecko", fetchedAt: new Date().toISOString() };
}

// GET /api/market/global → whole-market indicators + Fear & Greed (30 days)
router.get("/global", async (req, res) => {
  try {
    const value = await cached("global", 10 * 60_000, async () => {
      const [globalRes, fngRes] = await Promise.allSettled([coingecko("/global"), getJson(FEAR_GREED)]);
      if (globalRes.status === "rejected" && fngRes.status === "rejected") throw globalRes.reason;

      const g = globalRes.status === "fulfilled" ? globalRes.value?.data : null;
      const fng = fngRes.status === "fulfilled" ? fngRes.value?.data : null;
      return {
        totalMarketCap: g?.total_market_cap?.usd ?? null,
        totalVolume24h: g?.total_volume?.usd ?? null,
        marketCapChange24h: g?.market_cap_change_percentage_24h_usd ?? null,
        dominance: g ? { btc: g.market_cap_percentage?.btc ?? null, eth: g.market_cap_percentage?.eth ?? null } : null,
        activeCryptos: g?.active_cryptocurrencies ?? null,
        fearGreed: Array.isArray(fng) && fng.length
          ? {
              value: Number(fng[0].value),
              label: fng[0].value_classification,
              // oldest → newest for the mini chart
              history: fng.map((d) => ({ t: Number(d.timestamp) * 1000, value: Number(d.value) })).reverse(),
            }
          : null,
        fetchedAt: new Date().toISOString(),
      };
    });
    res.json(value);
  } catch (err) {
    console.error("[market/global]", err.message);
    unavailable(res, "Market indicators");
  }
});

// GET /api/market/history/bitcoin?days=30 → price history for the chart
router.get("/history/:asset", async (req, res) => {
  const meta = BY_KEY[req.params.asset];
  const days = Number(req.query.days) || 30;
  if (!meta || !RANGES.includes(days)) {
    return res.status(400).json({
      error: "bad_request",
      message: `Use asset ${ASSETS.map((a) => a.key).join("|")} and days ${RANGES.join("|")}.`,
    });
  }
  try {
    // Short ranges change faster, so they're refreshed more often.
    const ttl = days === 1 ? 10 * 60_000 : days <= 7 ? 30 * 60_000 : 2 * 60 * 60_000;
    const value = await cached(`history:${meta.key}:${days}`, ttl, () => loadHistory(meta, days));
    res.json(value);
  } catch (err) {
    console.error("[market/history]", err.message);
    unavailable(res, "Price history");
  }
});

async function loadHistory(meta, days) {
  const json = await coingecko(`/coins/${meta.id}/market_chart?vs_currency=usd&days=${days}`);
  const points = downsample((json.prices || []).map(([t, price]) => ({ t, price })), MAX_POINTS);
  return { asset: meta.key, days, points, fetchedAt: new Date().toISOString() };
}

// Fill the cache right after the server starts (Render wakes it on the first
// visit), so the Market page usually opens instantly. Then keep prices fresh
// while the server is awake.
export function warmMarketCache() {
  const jobs = [
    ["overview", loadOverview],
    ["history:bitcoin:30", () => loadHistory(BY_KEY.bitcoin, 30)],
    ["history:gold:30", () => loadHistory(BY_KEY.gold, 30)],
  ];
  for (const [key, loader] of jobs) {
    refresh(key, loader).catch((err) => console.warn(`[market] warm-up ${key}:`, err.message));
  }
  setInterval(() => {
    refresh("overview", loadOverview).catch(() => {});
  }, 3 * 60_000).unref();
}

export default router;
