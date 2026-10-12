import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ComposedChart, Area, Line, LineChart, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, Minus, AlertCircle, Info, Gauge } from "lucide-react";
import { useApp } from "../context/AppContext";
import {
  getMarketOverview, getMarketGlobal, getMarketHistory, usd, pct, compactNumber,
  seriesStats, sma, rsi, rsiZone, fearGreedColor, TROY_OUNCE_GRAMS, DON_GRAMS,
} from "../services/marketService";

const RANGES = [
  { days: 1, en: "24H", ko: "1일" },
  { days: 7, en: "7D", ko: "7일" },
  { days: 30, en: "1M", ko: "1개월" },
  { days: 90, en: "3M", ko: "3개월" },
  { days: 365, en: "1Y", ko: "1년" },
];

// Korean names + brand colours. The list itself comes from the backend.
const META = {
  bitcoin: { ko: "비트코인", color: "#F7931A" },
  ethereum: { ko: "이더리움", color: "#8C8CF7" },
  gold: { ko: "금", color: "#FBBF24" },
  litecoin: { ko: "라이트코인", color: "#A6B9D6" },
  xrp: { ko: "리플", color: "#5AA9E6" },
  solana: { ko: "솔라나", color: "#9F7AEA" },
  bnb: { ko: "BNB", color: "#F3BA2F" },
  dogecoin: { ko: "도지코인", color: "#C2A633" },
};

const UP = "#34D399";
const DOWN = "#F87171";
const TOOLTIP_STYLE = { background: "#0E1433", border: "1px solid rgba(140,160,255,0.22)", borderRadius: 10, color: "#F4F6FF" };

const FNG_LABELS_KO = {
  "Extreme Fear": "극단적 공포", Fear: "공포", Neutral: "중립", Greed: "탐욕", "Extreme Greed": "극단적 탐욕",
};

// ---------- small visuals ----------

function GoldArt({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="23" fill="rgba(251,191,36,0.14)" />
      <path d="M8 36 L13 26 H35 L40 36 Z" fill="#D99A0B" />
      <path d="M13 26 L16.5 29.5 H31.5 L35 26 Z" fill="#FCD34D" />
      <path d="M15 24 L19.5 14 H28.5 L33 24 Z" fill="#FBBF24" />
      <path d="M19.5 14 L21.5 17.5 H26.5 L28.5 14 Z" fill="#FDE68A" />
    </svg>
  );
}

function AssetIcon({ asset, size = 32 }) {
  const [broken, setBroken] = useState(false);
  if (asset.key === "gold") return <GoldArt size={size} />;
  if (!asset.image || broken) {
    return (
      <span className="mk-icon-fallback" style={{ width: size, height: size, background: META[asset.key]?.color || "#4F7BFF" }}>
        {asset.symbol?.[0]}
      </span>
    );
  }
  return <img src={asset.image} alt="" width={size} height={size} style={{ borderRadius: "50%", flexShrink: 0 }} onError={() => setBroken(true)} />;
}

function ChangePill({ value }) {
  if (value == null || !Number.isFinite(Number(value))) return <span className="mk-pill">—</span>;
  const up = value > 0;
  const flat = Math.abs(value) < 0.005;
  return (
    <span className={"mk-pill " + (flat ? "" : up ? "up" : "down")}>
      {flat ? <Minus size={12} /> : up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {pct(value)}
    </span>
  );
}

function Sparkline({ values, width = 110, height = 34 }) {
  if (!values?.length) return <svg width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={up ? UP : DOWN} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Half-circle gauge for the Fear & Greed index (0–100).
function FearGreedGauge({ value }) {
  const cx = 60, cy = 58, r = 46;
  const pt = (v) => {
    const a = Math.PI * (1 - v / 100);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const arc = (a, b) => {
    const [x1, y1] = pt(a);
    const [x2, y2] = pt(b);
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  };
  const zones = [[0, 24, "#F87171"], [25, 44, "#FB923C"], [45, 55, "#FBBF24"], [56, 75, "#86EFAC"], [76, 100, "#34D399"]];
  const [nx, ny] = pt(Math.max(0, Math.min(100, value ?? 50)));
  return (
    <svg width="120" height="66" viewBox="0 0 120 66" aria-hidden="true">
      {zones.map(([a, b, c]) => <path key={a} d={arc(a + 0.8, b - 0.8)} stroke={c} strokeWidth="9" fill="none" strokeLinecap="round" opacity="0.9" />)}
      {value != null && (
        <>
          <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#F4F6FF" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={cx} cy={cy} r="4.5" fill="#F4F6FF" />
        </>
      )}
    </svg>
  );
}

// ---------- formatting ----------

function axisLabel(t, days, lang) {
  const d = new Date(t);
  const loc = lang === "ko" ? "ko-KR" : "en-US";
  if (days <= 1) return d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (days <= 90) return d.toLocaleDateString(loc, { month: "short", day: "numeric" });
  return d.toLocaleDateString(loc, { year: "2-digit", month: "short" });
}

function fullDate(t, days, lang) {
  const d = new Date(t);
  const loc = lang === "ko" ? "ko-KR" : "en-US";
  return days <= 7
    ? d.toLocaleString(loc, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleDateString(loc, { year: "numeric", month: "short", day: "numeric" });
}

function shortUsd(v) {
  const n = Math.abs(v);
  if (n >= 1000) return `$${(v / 1000).toFixed(n >= 100000 ? 0 : 1)}K`;
  if (n >= 10) return `$${Math.round(v)}`;
  if (n >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toPrecision(2)}`;
}

function longDate(iso, lang) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ---------- page ----------

export default function Market() {
  const { lang } = useApp();
  const ko = lang === "ko";
  const L = (en, k) => (ko ? k : en);

  const [overview, setOverview] = useState(null);
  const [global, setGlobal] = useState(null);
  const [selected, setSelected] = useState("bitcoin");
  const [compareWith, setCompareWith] = useState("gold");
  const [days, setDays] = useState(30);
  const [histories, setHistories] = useState({}); // "bitcoin:30" -> points
  const [show, setShow] = useState({ ma20: true, ma50: true, rsi: true });
  const [filter, setFilter] = useState("all"); // all | crypto | commodity
  const [sort, setSort] = useState("default"); // default | gainers | losers
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const assetName = (a) => (a ? (ko ? META[a.key]?.ko || a.name : a.name) : "");

  const loadOverview = useCallback(async (fresh = false) => {
    try {
      setOverview(await getMarketOverview({ fresh }));
      setError("");
    } catch (err) {
      setError(err.code === "BACKEND_UNREACHABLE" ? "server" : "data");
    }
  }, []);

  const loadGlobal = useCallback(async (fresh = false) => {
    try { setGlobal(await getMarketGlobal({ fresh })); } catch { /* indicators are optional */ }
  }, []);

  const loadHistory = useCallback(async (asset, range, fresh = false) => {
    try {
      const h = await getMarketHistory(asset, range, { fresh });
      setHistories((prev) => ({ ...prev, [`${asset}:${range}`]: h.points }));
    } catch { /* chart shows its own empty state */ }
  }, []);

  useEffect(() => {
    loadOverview();
    loadGlobal();
    const id = setInterval(() => {
      if (document.hidden) return;
      loadOverview();
      loadGlobal();
    }, 60_000);
    return () => clearInterval(id);
  }, [loadOverview, loadGlobal]);

  // Never compare an asset with itself.
  useEffect(() => {
    if (compareWith === selected) setCompareWith(selected === "bitcoin" ? "gold" : "bitcoin");
  }, [selected, compareWith]);

  useEffect(() => { loadHistory(selected, days); }, [selected, days, loadHistory]);
  useEffect(() => { if (compareWith !== selected) loadHistory(compareWith, days); }, [compareWith, selected, days, loadHistory]);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([loadOverview(true), loadGlobal(true), loadHistory(selected, days, true), loadHistory(compareWith, days, true)]);
    setRefreshing(false);
  }

  const assets = overview?.assets || [];
  const asset = assets.find((a) => a.key === selected);
  const other = assets.find((a) => a.key === compareWith);
  const color = META[selected]?.color || "#4F7BFF";

  const listed = useMemo(() => {
    let rows = assets.filter((a) => filter === "all" || a.type === filter);
    if (sort === "gainers") rows = [...rows].sort((a, b) => (b.change24h ?? -1e9) - (a.change24h ?? -1e9));
    if (sort === "losers") rows = [...rows].sort((a, b) => (a.change24h ?? 1e9) - (b.change24h ?? 1e9));
    return rows;
  }, [assets, filter, sort]);

  // Main chart data with indicators
  const points = histories[`${selected}:${days}`];
  const chart = useMemo(() => {
    if (!points?.length) return null;
    const prices = points.map((p) => p.price);
    const m20 = sma(prices, 20);
    const m50 = sma(prices, 50);
    const r = rsi(prices, 14);
    return points.map((p, i) => ({ t: p.t, price: p.price, ma20: m20[i], ma50: m50[i], rsi: r[i] }));
  }, [points]);
  const stats = useMemo(() => seriesStats(points, days), [points, days]);
  const lastRsi = chart ? chart[chart.length - 1].rsi : null;
  const zone = rsiZone(lastRsi);
  const lineColor = !stats ? color : stats.changePct >= 0 ? UP : DOWN;

  // Comparison, both rebased to 0% at the start of the range
  const otherPoints = histories[`${compareWith}:${days}`];
  const comparison = useMemo(() => {
    if (!points?.length || !otherPoints?.length) return null;
    const a0 = points[0].price;
    const b0 = otherPoints[0].price;
    let j = 0;
    return points.map((p) => {
      while (j < otherPoints.length - 1 && otherPoints[j + 1].t <= p.t) j++;
      return { t: p.t, a: ((p.price - a0) / a0) * 100, b: ((otherPoints[j].price - b0) / b0) * 100 };
    });
  }, [points, otherPoints]);
  const otherStats = useMemo(() => seriesStats(otherPoints, days), [otherPoints, days]);

  const rangeText = ko
    ? { 1: "최근 24시간", 7: "최근 7일", 30: "최근 1개월", 90: "최근 3개월", 365: "최근 1년" }[days]
    : { 1: "the last 24 hours", 7: "the last 7 days", 30: "the last month", 90: "the last 3 months", 365: "the last year" }[days];

  const updated = overview?.fetchedAt
    ? new Date(overview.fetchedAt).toLocaleTimeString(ko ? "ko-KR" : "en-US", { hour: "2-digit", minute: "2-digit" })
    : null;

  const fng = global?.fearGreed;
  const fngAgo = (n) => (fng?.history?.length > n ? fng.history[fng.history.length - 1 - n].value : null);
  const dom = global?.dominance;

  return (
    <div className="page market-page">
      <div className="page-header mk-header">
        <div>
          <h1>{L("Market", "시장")}</h1>
          <p className="mk-sub">{L("Crypto and gold prices, trends and indicators in US dollars", "암호화폐·금 시세, 추세, 지표 (미국 달러 기준)")}</p>
        </div>
        <div className="mk-header-actions">
          {updated && <span className="mk-updated">{L("Updated", "업데이트")} {updated}{overview?.stale ? L(" · cached", " · 저장된 값") : ""}</span>}
          <button type="button" className="btn-secondary mk-refresh" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? "mk-spin" : ""} /> {L("Refresh", "새로고침")}
          </button>
        </div>
      </div>

      {error && (
        <div className="card mk-error" role="alert">
          <AlertCircle size={18} />
          <span>
            {error === "server"
              ? L("Can't reach the Moneo server. It may be waking up, so try again in a moment.", "Moneo 서버에 연결할 수 없어요. 서버가 깨어나는 중일 수 있으니 잠시 후 다시 시도해주세요.")
              : L("Market prices are unavailable right now. Please try again in a minute.", "지금은 시세를 불러올 수 없어요. 잠시 후 다시 시도해주세요.")}
          </span>
          <button type="button" className="btn-secondary" onClick={refresh}>{L("Try again", "다시 시도")}</button>
        </div>
      )}

      {/* ---------- Market-wide indicators ---------- */}
      <div className="mk-indicators">
        <div className="mk-ind">
          <span className="mk-ind-label">{L("Crypto market cap", "암호화폐 시가총액")}</span>
          <b className="mk-ind-value">{global?.totalMarketCap ? usd(global.totalMarketCap, { compact: true }) : "—"}</b>
          <ChangePill value={global?.marketCapChange24h} />
        </div>
        <div className="mk-ind">
          <span className="mk-ind-label">{L("24h trading volume", "24시간 거래량")}</span>
          <b className="mk-ind-value">{global?.totalVolume24h ? usd(global.totalVolume24h, { compact: true }) : "—"}</b>
          <span className="mk-muted">{global?.activeCryptos ? L(`${compactNumber(global.activeCryptos)} coins tracked`, `코인 ${compactNumber(global.activeCryptos)}개 집계`) : ""}</span>
        </div>
        <div className="mk-ind">
          <span className="mk-ind-label">{L("Bitcoin dominance", "비트코인 점유율")}</span>
          <b className="mk-ind-value">{dom?.btc != null ? `${dom.btc.toFixed(1)}%` : "—"}</b>
          {dom?.btc != null && (
            <>
              <div className="mk-dom-bar" aria-hidden="true">
                <span style={{ width: `${dom.btc}%`, background: META.bitcoin.color }} />
                <span style={{ width: `${dom.eth || 0}%`, background: META.ethereum.color }} />
              </div>
              <span className="mk-muted">BTC {dom.btc.toFixed(1)}% · ETH {(dom.eth || 0).toFixed(1)}% · {L("Others", "기타")} {Math.max(0, 100 - dom.btc - (dom.eth || 0)).toFixed(1)}%</span>
            </>
          )}
        </div>
        <div className="mk-ind mk-fng">
          <span className="mk-ind-label"><Gauge size={13} /> {L("Fear & Greed index", "공포·탐욕 지수")}</span>
          <div className="mk-fng-row">
            <FearGreedGauge value={fng?.value} />
            <div>
              <b className="mk-ind-value" style={{ color: fearGreedColor(fng?.value) }}>{fng ? fng.value : "—"}</b>
              <div className="mk-fng-label" style={{ color: fearGreedColor(fng?.value) }}>{fng ? (ko ? FNG_LABELS_KO[fng.label] || fng.label : fng.label) : ""}</div>
            </div>
          </div>
          {fng && (
            <span className="mk-muted">
              {L("Yesterday", "어제")} {fngAgo(1) ?? "—"} · {L("7d ago", "7일 전")} {fngAgo(7) ?? "—"} · {L("30d ago", "30일 전")} {fngAgo(30) ?? "—"}
            </span>
          )}
        </div>
      </div>

      {/* ---------- Watchlist ---------- */}
      <div className="card mk-watch">
        <div className="mk-watch-head">
          <span className="card-title">{L("Watchlist", "관심 종목")}</span>
          <div className="mk-chip-row">
            {[["all", "All", "전체"], ["crypto", "Crypto", "암호화폐"], ["commodity", "Gold", "금"]].map(([v, en, k]) => (
              <button key={v} type="button" className={"mk-chip" + (filter === v ? " active" : "")} onClick={() => setFilter(v)} aria-pressed={filter === v}>{L(en, k)}</button>
            ))}
            <span className="mk-chip-sep" />
            {[["default", "Default", "기본"], ["gainers", "Top gainers", "상승률순"], ["losers", "Top losers", "하락률순"]].map(([v, en, k]) => (
              <button key={v} type="button" className={"mk-chip" + (sort === v ? " active" : "")} onClick={() => setSort(v)} aria-pressed={sort === v}>{L(en, k)}</button>
            ))}
          </div>
        </div>

        <div className="mk-table" role="table" aria-label={L("Asset prices", "자산 시세")}>
          <div className="mk-tr mk-th" role="row">
            <span role="columnheader">{L("Asset", "자산")}</span>
            <span role="columnheader" className="r">{L("Price", "가격")}</span>
            <span role="columnheader" className="r">24h</span>
            <span role="columnheader" className="r mk-hide-sm">7d</span>
            <span role="columnheader" className="r mk-hide-sm">{L("Last 7 days", "최근 7일")}</span>
            <span role="columnheader" className="r mk-hide-md">{L("Market cap", "시가총액")}</span>
          </div>
          {!overview && !error && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="mk-tr" role="row"><span className="mk-skel" style={{ width: 160 }} /></div>
          ))}
          {listed.map((a) => (
            <button
              key={a.key}
              type="button"
              role="row"
              className={"mk-tr mk-row-btn" + (selected === a.key ? " active" : "")}
              style={{ "--mk-accent": META[a.key]?.color }}
              onClick={() => setSelected(a.key)}
              aria-pressed={selected === a.key}
            >
              <span role="cell" className="mk-asset-cell">
                <AssetIcon asset={a} size={30} />
                <span className="mk-asset-names">
                  <b>{assetName(a)}</b>
                  <em>{a.symbol}{a.key === "gold" ? L(" · per oz", " · 온스당") : ""}</em>
                </span>
              </span>
              <span role="cell" className="r mk-num">{usd(a.price)}</span>
              <span role="cell" className="r"><ChangePill value={a.change24h} /></span>
              <span role="cell" className="r mk-hide-sm"><ChangePill value={a.change7d} /></span>
              <span role="cell" className="r mk-hide-sm"><Sparkline values={a.sparkline} /></span>
              <span role="cell" className="r mk-num mk-hide-md">{a.key === "gold" ? "—" : usd(a.marketCap, { compact: true })}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Selected asset chart ---------- */}
      {asset && (
        <div className="card">
          <div className="mk-chart-head">
            <div className="mk-chart-title">
              <AssetIcon asset={asset} size={40} />
              <div>
                <div className="card-title">{assetName(asset)} <span className="mk-muted">&nbsp;{asset.symbol}</span></div>
                <div className="mk-chart-price">
                  {usd(asset.price)}
                  {stats && <ChangePill value={stats.changePct} />}
                  {stats && <span className="mk-muted">{rangeText}</span>}
                </div>
              </div>
            </div>
            <div className="mk-ranges" role="group" aria-label={L("Time range", "기간")}>
              {RANGES.map((r) => (
                <button key={r.days} type="button" className={"mk-range" + (days === r.days ? " active" : "")} onClick={() => setDays(r.days)} aria-pressed={days === r.days}>
                  {L(r.en, r.ko)}
                </button>
              ))}
            </div>
          </div>

          <div className="mk-chip-row mk-toggles" role="group" aria-label={L("Indicators", "지표")}>
            <span className="mk-muted">{L("Indicators", "지표")}</span>
            <button type="button" className={"mk-chip" + (show.ma20 ? " active" : "")} onClick={() => setShow((s) => ({ ...s, ma20: !s.ma20 }))} aria-pressed={show.ma20}><i className="mk-swatch" style={{ background: "#22D3EE" }} />MA 20</button>
            <button type="button" className={"mk-chip" + (show.ma50 ? " active" : "")} onClick={() => setShow((s) => ({ ...s, ma50: !s.ma50 }))} aria-pressed={show.ma50}><i className="mk-swatch" style={{ background: "#C084FC" }} />MA 50</button>
            <button type="button" className={"mk-chip" + (show.rsi ? " active" : "")} onClick={() => setShow((s) => ({ ...s, rsi: !s.rsi }))} aria-pressed={show.rsi}>RSI 14</button>
          </div>

          <div style={{ height: 290 }}>
            {!chart ? (
              <div className="empty-state">{L("Loading chart…", "차트를 불러오는 중…")}</div>
            ) : (
              <ResponsiveContainer>
                <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} syncId="mk">
                  <defs>
                    <linearGradient id="mkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={lineColor} stopOpacity={0.26} />
                      <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="t" tickFormatter={(t) => axisLabel(t, days, lang)} tick={{ fontSize: 11, fill: "#8A93B5" }} minTickGap={36} hide={show.rsi} />
                  <YAxis domain={["auto", "auto"]} tickFormatter={shortUsd} tick={{ fontSize: 11, fill: "#8A93B5" }} width={58} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(t) => fullDate(t, days, lang)}
                    formatter={(v, name) => [usd(v), name === "price" ? assetName(asset) : name === "ma20" ? "MA 20" : "MA 50"]}
                  />
                  {stats && <ReferenceLine y={stats.first} stroke="rgba(255,255,255,0.22)" strokeDasharray="4 4" />}
                  <Area type="monotone" dataKey="price" stroke={lineColor} strokeWidth={2.2} fill="url(#mkFill)" isAnimationActive={false} />
                  {show.ma20 && <Line type="monotone" dataKey="ma20" stroke="#22D3EE" strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />}
                  {show.ma50 && <Line type="monotone" dataKey="ma50" stroke="#C084FC" strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {show.rsi && chart && (
            <div style={{ height: 96 }} className="mk-rsi">
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} syncId="mk">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="t" tickFormatter={(t) => axisLabel(t, days, lang)} tick={{ fontSize: 11, fill: "#8A93B5" }} minTickGap={36} />
                  <YAxis domain={[0, 100]} ticks={[30, 70]} tick={{ fontSize: 10, fill: "#8A93B5" }} width={58} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(t) => fullDate(t, days, lang)} formatter={(v) => [v == null ? "—" : v.toFixed(1), "RSI 14"]} />
                  <ReferenceLine y={70} stroke="rgba(248,113,113,0.5)" strokeDasharray="3 3" />
                  <ReferenceLine y={30} stroke="rgba(52,211,153,0.5)" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="rsi" stroke="#FBBF24" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {stats && (
            <div className="mk-stats">
              <div><span>{L("Trend", "추세")}</span><b className={stats.trend === "up" ? "up" : stats.trend === "down" ? "down" : ""}>{{ up: L("Uptrend", "상승 추세"), down: L("Downtrend", "하락 추세"), flat: L("Sideways", "보합") }[stats.trend]}</b></div>
              <div><span>{L("Change", "변동률")}</span><b className={stats.changePct >= 0 ? "up" : "down"}>{pct(stats.changePct)}</b></div>
              <div><span>{L("Period high", "기간 최고")}</span><b>{usd(stats.high)}</b></div>
              <div><span>{L("Period low", "기간 최저")}</span><b>{usd(stats.low)}</b></div>
              <div><span>{L("Price swing", "변동 폭")}</span><b>{stats.swingPct.toFixed(1)}%</b></div>
              <div>
                <span>RSI 14</span>
                <b className={zone === "overbought" ? "down" : zone === "oversold" ? "up" : ""}>
                  {lastRsi != null ? lastRsi.toFixed(0) : "—"}
                  {zone && <small> · {{ overbought: L("overbought", "과매수"), oversold: L("oversold", "과매도"), neutral: L("neutral", "중립") }[zone]}</small>}
                </b>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="dash-grid">
        {/* ---------- Details ---------- */}
        <div className="card">
          <div className="card-title-row"><span className="card-title">{asset ? L(`${assetName(asset)} details`, `${assetName(asset)} 상세 정보`) : L("Details", "상세 정보")}</span></div>
          {!asset ? (
            <div className="empty-state">{L("Loading…", "불러오는 중…")}</div>
          ) : (
            <div className="mk-details">
              <Row label={L("24h high / low", "24시간 최고 / 최저")} value={`${usd(asset.high24h)} / ${usd(asset.low24h)}`} />
              <Row label={L("1 hour", "1시간")} value={<ChangePill value={asset.change1h} />} />
              <Row label={L("7 days", "7일")} value={<ChangePill value={asset.change7d} />} />
              <Row label={L("30 days", "30일")} value={<ChangePill value={asset.change30d} />} />
              <Row label={L("1 year", "1년")} value={<ChangePill value={asset.change1y} />} />
              {asset.key === "gold" ? (
                <>
                  <Row label={L("Per gram", "1그램")} value={usd(asset.price / TROY_OUNCE_GRAMS)} />
                  <Row label={L("Per don (3.75 g, Korean unit)", "1돈 (3.75g)")} value={usd((asset.price / TROY_OUNCE_GRAMS) * DON_GRAMS)} />
                  <Row label={L("Per kilogram", "1킬로그램")} value={usd((asset.price / TROY_OUNCE_GRAMS) * 1000, { compact: true })} />
                </>
              ) : (
                <>
                  <Row label={L("Market cap", "시가총액")} value={`${usd(asset.marketCap, { compact: true })}${asset.rank ? ` · #${asset.rank}` : ""}`} />
                  <Row label={L("24h volume", "24시간 거래량")} value={usd(asset.volume24h, { compact: true })} />
                  <Row label={L("Supply", "유통량")} value={`${compactNumber(asset.circulatingSupply)} / ${asset.maxSupply ? compactNumber(asset.maxSupply) : "∞"} ${asset.symbol}`} />
                  <Row label={L("All-time high", "역대 최고가")} value={`${usd(asset.ath)} · ${longDate(asset.athDate, lang)}`} />
                  <Row label={L("From all-time high", "최고가 대비")} value={<ChangePill value={asset.athChangePct} />} />
                </>
              )}
            </div>
          )}
        </div>

        {/* ---------- Compare ---------- */}
        <div className="card">
          <div className="card-title-row mk-compare-head">
            <span className="card-title">{L("Compare", "비교")}</span>
            <label className="mk-compare-pick">
              <span>{assetName(asset)} vs</span>
              <select value={compareWith} onChange={(e) => setCompareWith(e.target.value)} aria-label={L("Compare with", "비교 대상")}>
                {assets.filter((a) => a.key !== selected).map((a) => <option key={a.key} value={a.key}>{assetName(a)}</option>)}
              </select>
            </label>
          </div>
          {!comparison ? (
            <div className="empty-state">{L("Loading…", "불러오는 중…")}</div>
          ) : (
            <>
              <div style={{ height: 210 }}>
                <ResponsiveContainer>
                  <LineChart data={comparison} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="t" tickFormatter={(t) => axisLabel(t, days, lang)} tick={{ fontSize: 11, fill: "#8A93B5" }} minTickGap={40} />
                    <YAxis tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} tick={{ fontSize: 11, fill: "#8A93B5" }} width={46} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(t) => fullDate(t, days, lang)} formatter={(v, name) => [pct(v), name === "a" ? assetName(asset) : assetName(other)]} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
                    <Legend formatter={(v) => (v === "a" ? assetName(asset) : assetName(other))} wrapperStyle={{ fontSize: 12.5 }} iconSize={10} />
                    <Line type="monotone" dataKey="a" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="b" stroke="#E2E8F0" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {stats && otherStats && (
                <p className="mk-insight">
                  {L(
                    `Over ${rangeText}, ${assetName(asset)} ${stats.changePct >= 0 ? "rose" : "fell"} ${Math.abs(stats.changePct).toFixed(1)}% and ${assetName(other)} ${otherStats.changePct >= 0 ? "rose" : "fell"} ${Math.abs(otherStats.changePct).toFixed(1)}%. ${assetName(asset)}'s price swung ${stats.swingPct.toFixed(1)}% versus ${otherStats.swingPct.toFixed(1)}%${otherStats.swingPct > 0 ? `, about ${(stats.swingPct / otherStats.swingPct).toFixed(1)}× as much` : ""}.`,
                    `${rangeText} 동안 ${assetName(asset)}은(는) ${Math.abs(stats.changePct).toFixed(1)}% ${stats.changePct >= 0 ? "상승" : "하락"}, ${assetName(other)}은(는) ${Math.abs(otherStats.changePct).toFixed(1)}% ${otherStats.changePct >= 0 ? "상승" : "하락"}했어요. 변동 폭은 ${stats.swingPct.toFixed(1)}% 대 ${otherStats.swingPct.toFixed(1)}%${otherStats.swingPct > 0 ? `로 약 ${(stats.swingPct / otherStats.swingPct).toFixed(1)}배예요` : "예요"}.`
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="card mk-learn">
        <div className="card-title-row"><span className="card-title"><Info size={15} style={{ marginRight: 6 }} />{L("How to read the indicators", "지표 읽는 법")}</span></div>
        <div className="mk-learn-grid">
          <p><b>MA 20 / MA 50</b> {L("Moving averages smooth out the price. When the price stays above them, the trend is usually up; below them, usually down.", "이동평균선은 가격 흐름을 부드럽게 보여줘요. 가격이 선 위에 있으면 대체로 상승, 아래에 있으면 하락 추세예요.")}</p>
          <p><b>RSI 14</b> {L("Measures how fast the price moved. Above 70 means it rose very fast (overbought); below 30 means it fell very fast (oversold).", "가격이 얼마나 빠르게 움직였는지 보여줘요. 70 이상은 급등(과매수), 30 이하는 급락(과매도)이에요.")}</p>
          <p><b>{L("Fear & Greed", "공포·탐욕 지수")}</b> {L("A 0–100 mood score for the crypto market, built from volatility, momentum, social media and more.", "변동성, 모멘텀, SNS 등을 바탕으로 한 암호화폐 시장 심리 점수(0–100)예요.")}</p>
          <p><b>{L("Dominance", "점유율")}</b> {L("Bitcoin's share of the whole crypto market's value. Rising dominance often means money is moving to safer coins.", "전체 암호화폐 시가총액 중 비트코인의 비중이에요. 점유율이 오르면 비교적 안전한 코인으로 돈이 몰린다는 뜻일 때가 많아요.")}</p>
        </div>
      </div>

      <p className="mk-note">
        <Info size={13} />
        {L(
          "Prices from CoinGecko, refreshed every minute; Fear & Greed from alternative.me. Moving averages and RSI use the chart's data points (hourly on 7D, daily on 1Y). Gold is tracked through PAX Gold (PAXG), a token backed by one troy ounce of gold, so it follows the gold spot price closely. For information only, not investment advice.",
          "시세: CoinGecko (1분마다 갱신), 공포·탐욕 지수: alternative.me. 이동평균선과 RSI는 차트의 데이터 간격(7일은 1시간, 1년은 1일)을 기준으로 계산해요. 금 시세는 금 1트로이온스로 뒷받침되는 PAX Gold(PAXG)로 추적해 실제 금 현물 가격과 거의 같아요. 참고용 정보이며 투자 조언이 아니에요."
        )}
      </p>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="mk-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
