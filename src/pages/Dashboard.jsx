import React, { useMemo, useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, animate, AnimatePresence } from "framer-motion";
import {
  ArrowUp, ArrowDown, ArrowRight, ChevronDown, X, Wallet, ShoppingCart, Target, Zap, PieChart,
  PlusCircle, Trophy, LineChart, Lightbulb, StickyNote, Send, Maximize2, RotateCcw,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import CategoryIcon from "../components/CategoryIcon";
import { categoryById, categoryLabel } from "../data/categories";
import { getAssistantResponse } from "../services/assistantService";
import { savingStreak, currency } from "../utils/calculations";
import { parseLocalDate, todayLocal } from "../utils/dates";
import { SparkleIcon } from "../components/icons/FilledIcons";

// ---------- helpers ----------
const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
const sum = (list) => list.reduce((s, t) => s + (Number(t.amount) || 0), 0);
const inMonth = (tx, y, m) => { const d = parseLocalDate(tx.date); return d.getFullYear() === y && d.getMonth() === m; };
function pctChange(now, before) {
  if (!before) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}
function shortWon(v) {
  const n = Math.abs(v);
  if (n >= 1000000) return `₩${(v / 1000000).toFixed(n >= 10000000 ? 0 : 1)}M`;
  if (n >= 1000) return `₩${Math.round(v / 1000)}K`;
  return `₩${Math.round(v)}`;
}
function useCountUp(value, duration = 1) {
  const [display, setDisplay] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const c = animate(from.current, value, { duration, ease: "easeOut", onUpdate: setDisplay, onComplete: () => { from.current = value; } });
    return () => { c.stop(); from.current = value; };
  }, [value, duration]);
  return display;
}
const enter = (i) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: 0.05 * i, ease: [0.2, 0.8, 0.2, 1] } });

// Smooth line through points, for the small charts in the stat cards.
function sparkPath(values, w = 120, h = 40) {
  const v = values.length > 1 ? values : [0, 0];
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * w, h - 4 - ((y - min) / span) * (h - 8)]);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}
function Sparkline({ values, color }) {
  return (
    <svg className="db-spark" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true">
      <path d={sparkPath(values)} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// Donut chart drawn with SVG strokes.
function Donut({ parts, total, lang }) {
  const r = 52, c = 2 * Math.PI * r, gap = parts.length > 1 ? 4 : 0;
  let offset = 0;
  return (
    <div className="db-donut">
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(167,139,250,0.12)" strokeWidth="20" />
        {total > 0 && parts.map((p) => {
          const len = Math.max(0, (p.value / total) * c - gap);
          const el = (
            <circle key={p.id} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="20" strokeLinecap="round"
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
          );
          offset += (p.value / total) * c;
          return el;
        })}
      </svg>
      <div className="db-donut-center">
        <b>{shortWon(total)}</b>
        <span>{lang === "ko" ? "총 지출" : "Total Spent"}</span>
      </div>
    </div>
  );
}

// The friendly robot in the Ask Anything panel.
function RobotArt() {
  return (
    <svg className="db-robot" viewBox="0 0 220 170" aria-hidden="true">
      <defs>
        <linearGradient id="rbHead" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#D9D2FF" /></linearGradient>
        <linearGradient id="rbVisor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1C1747" /><stop offset="1" stopColor="#2E2470" /></linearGradient>
        <radialGradient id="rbGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#8B6CFF" stopOpacity="0.55" /><stop offset="1" stopColor="#8B6CFF" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="110" cy="78" r="78" fill="url(#rbGlow)" />
      <path d="M40 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#B9A5FF" />
      <path d="M178 22 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5z" fill="#D8CCFF" />
      <path d="M186 96 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#B9A5FF" />
      <path d="M30 104 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#D8CCFF" />
      <rect x="66" y="128" width="88" height="34" rx="17" fill="url(#rbHead)" />
      <rect x="96" y="118" width="28" height="14" rx="6" fill="#C9BFFF" />
      <rect x="52" y="64" width="16" height="34" rx="8" fill="#BFB3FF" />
      <rect x="152" y="64" width="16" height="34" rx="8" fill="#BFB3FF" />
      <rect x="60" y="34" width="100" height="90" rx="40" fill="url(#rbHead)" />
      <rect x="72" y="52" width="76" height="52" rx="24" fill="url(#rbVisor)" />
      <path d="M90 76 q7 -9 14 0" stroke="#5EEAD4" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M116 76 q7 -9 14 0" stroke="#5EEAD4" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M100 90 q10 7 20 0" stroke="#5EEAD4" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function StatCard({ i, tone, icon: Icon, label, value, change, goodWhenUp, spark, lang, children }) {
  const shown = useCountUp(value);
  const up = change !== null && change >= 0;
  const good = change === null ? null : up === goodWhenUp;
  return (
    <motion.div className={"db-stat " + tone} {...enter(i)}>
      <span className={"db-stat-icon " + tone}><Icon size={22} /></span>
      <div className="db-stat-body">
        <span className="db-stat-label">{label}</span>
        <b className="db-stat-value">{currency(shown, lang)}</b>
        {children || (
          <div className="db-stat-foot">
            {change === null
              ? <span className="db-muted">{lang === "ko" ? "지난달 대비 —" : "vs last month —"}</span>
              : <span className={good ? "db-good" : "db-bad"}>{up ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{up ? "+" : "-"}{Math.abs(change)}%</span>}
            {spark && <Sparkline values={spark} color={tone === "green" ? "#34D399" : "#F87171"} />}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function relativeDay(dateStr, lang) {
  const d = parseLocalDate(dateStr);
  const today = parseLocalDate(todayLocal());
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return lang === "ko" ? "오늘" : "Today";
  if (diff === 1) return lang === "ko" ? "어제" : "Yesterday";
  return d.toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", { month: "short", day: "numeric" });
}

// ---------- page ----------
export default function Dashboard() {
  const { data, lang, t, user, assistantMode, unlockAchievement } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ko = lang === "ko";
  const L = (en, k) => (ko ? k : en);
  const { transactions, budgets } = data;

  const now = new Date();
  const [sel, setSel] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [hideQuick, setHideQuick] = useState(() => { try { return localStorage.getItem("moneo-hide-quick") === "1"; } catch { return false; } });
  const [hideAsk, setHideAsk] = useState(() => { try { return localStorage.getItem("moneo-hide-ask") === "1"; } catch { return false; } });
  const remember = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* ignore */ } };

  const monthOptions = useMemo(() => {
    const keys = new Set([monthKey(now.getFullYear(), now.getMonth())]);
    transactions.forEach((tx) => { const d = parseLocalDate(tx.date); if (!isNaN(d)) keys.add(monthKey(d.getFullYear(), d.getMonth())); });
    return [...keys].sort().reverse().slice(0, 12).map((k) => { const [y, m] = k.split("-").map(Number); return { y, m: m - 1 }; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);
  const monthName = ({ y, m }) => {
    const cy = now.getFullYear(), cm = now.getMonth();
    if (y === cy && m === cm) return L("This Month", "이번 달");
    const pm = cm === 0 ? 11 : cm - 1, py = cm === 0 ? cy - 1 : cy;
    if (y === py && m === pm) return L("Last Month", "지난달");
    return new Date(y, m, 1).toLocaleDateString(ko ? "ko-KR" : "en-US", { month: "short", year: "numeric" });
  };

  // Header cards always describe the current month.
  const stats = useMemo(() => {
    const y = now.getFullYear(), m = now.getMonth();
    const py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1;
    const exp = (l) => sum(l.filter((tx) => tx.type === "expense"));
    const inc = (l) => sum(l.filter((tx) => tx.type === "income"));
    const cur = transactions.filter((tx) => inMonth(tx, y, m));
    const prev = transactions.filter((tx) => inMonth(tx, py, pm));
    const upTo = (date) => transactions.filter((tx) => parseLocalDate(tx.date) <= date);
    const balanceAt = (date) => { const l = upTo(date); return inc(l) - exp(l); };
    const balance = balanceAt(now);
    const prevBalance = balanceAt(new Date(y, m, 0));

    // last 14 days: running balance, and spending per day
    const balSeries = [], spendSeries = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(y, m, now.getDate() - i, 23, 59);
      balSeries.push(balanceAt(d));
      spendSeries.push(exp(transactions.filter((tx) => { const td = parseLocalDate(tx.date); return td.toDateString() === d.toDateString(); })));
    }
    const limit = budgets.reduce((s, b) => s + (Number(b.limit) || 0), 0);
    const budgetCats = new Set(budgets.map((b) => b.category));
    const usedInBudgets = exp(cur.filter((tx) => budgetCats.has(tx.category)));
    return {
      balance, balanceChange: pctChange(balance, prevBalance), balSeries,
      spent: exp(cur), spentChange: pctChange(exp(cur), exp(prev)), spendSeries,
      limit, budgetPct: limit ? Math.round((usedInBudgets / limit) * 100) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, budgets]);

  // Spending Overview follows the month picked in its dropdown.
  const overview = useMemo(() => {
    const list = transactions.filter((tx) => tx.type === "expense" && inMonth(tx, sel.y, sel.m));
    const total = sum(list);
    const byCat = {};
    list.forEach((tx) => { byCat[tx.category] = (byCat[tx.category] || 0) + Number(tx.amount); });
    const sorted = Object.entries(byCat).map(([id, value]) => ({ id, value, color: categoryById(id).color, name: categoryLabel(id, lang) })).sort((a, b) => b.value - a.value);
    let parts = sorted;
    if (sorted.length > 4) {
      const rest = sorted.slice(3).reduce((s, p) => s + p.value, 0);
      parts = [...sorted.slice(0, 3), { id: "_others", value: rest, color: "#8B5CF6", name: L("Others", "기타") }];
    }
    parts = parts.map((p) => ({ ...p, pct: total ? Math.round((p.value / total) * 100) : 0 }));
    const week = [0, 0, 0, 0, 0, 0, 0]; // Mon..Sun
    list.forEach((tx) => { const d = parseLocalDate(tx.date).getDay(); week[(d + 6) % 7] += Number(tx.amount); });
    return { total, parts, week };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, sel, lang]);

  const recent = useMemo(() => [...transactions]
    .sort((a, b) => (parseLocalDate(b.date) - parseLocalDate(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 3), [transactions]);

  const streak = savingStreak(transactions, budgets);
  useEffect(() => { if (streak >= 7) unlockAchievement("streak_7"); }, [streak]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Ask Anything panel ----------
  const firstName = (user?.name || "").split(" ")[0];
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatBoxRef = useRef(null);
  useEffect(() => { const b = chatBoxRef.current; if (b) b.scrollTo({ top: b.scrollHeight, behavior: "smooth" }); }, [chat, thinking]);

  async function ask(question) {
    const q = (question ?? chatInput).trim();
    if (!q || thinking) return;
    setChatInput("");
    setChat((c) => [...c, { from: "user", text: q }].slice(-8));
    setThinking(true);
    try {
      const answer = await getAssistantResponse(q, data, lang, assistantMode);
      setChat((c) => [...c, { from: "ai", text: answer }].slice(-8));
    } catch {
      setChat((c) => [...c, { from: "ai", text: L("Something went wrong. Please try again.", "문제가 생겼어요. 다시 시도해주세요.") }]);
    } finally {
      setThinking(false);
    }
  }
  const onChatKey = (e) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229) return; // Korean IME
    e.preventDefault();
    ask();
  };

  const hour = now.getHours();
  const greet = hour < 12 ? L("Good morning", "좋은 아침이에요") : hour < 18 ? L("Good afternoon", "좋은 오후예요") : L("Good evening", "좋은 저녁이에요");
  const maxDay = Math.max(...overview.week, 1);
  const days = ko ? ["월", "화", "수", "목", "금", "토", "일"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const chips = [
    { icon: LineChart, tone: "green", text: L("Show my spending this month", "이번 달 지출 보여줘"), run: () => ask(L("Show my spending this month", "이번 달 지출 보여줘")) },
    { icon: PieChart, tone: "blue", text: L("Create a budget for food", "식비 예산 만들기"), run: () => navigate("/app/budgets?action=add") },
    { icon: Lightbulb, tone: "amber", text: L("Any tips to save more money?", "돈을 더 모으는 팁 있어?"), run: () => ask(L("Any tips to save more money?", "돈을 더 모으는 팁 있어?")) },
    { icon: StickyNote, tone: "sky", text: L("Add a note about my trip", "여행 메모 추가하기"), run: () => navigate("/app/notes") },
  ];

  const quick = [
    { key: "ask", tone: "purple", icon: SparkleIcon, title: t("askAnything"), sub: L("Get help from Moneo AI", "Moneo AI에게 도움받기"), to: "/app/ask", badge: L("New", "New") },
    { key: "budget", tone: "blue", icon: PieChart, title: t("createBudget"), sub: L("Plan your spending", "지출 계획하기"), to: "/app/budgets?action=add" },
    { key: "tx", tone: "green", icon: PlusCircle, title: t("addTransaction"), sub: L("Track expenses", "지출 기록하기"), to: "/app/transactions?action=add" },
    { key: "goal", tone: "amber", icon: Trophy, title: L("Set Goal", "목표 설정"), sub: L("Achieve your dreams", "꿈을 이뤄보세요"), to: "/app/goals" },
  ];

  const banner = budgets.length === 0
    ? { title: L("Start your journey with a budget!", "예산으로 시작해 보세요!"), sub: L("Set your monthly budget first, then track your spending.", "먼저 월 예산을 정하고, 지출을 기록하세요."), cta: t("createBudget"), to: "/app/budgets?action=add" }
    : transactions.length === 0
      ? { title: L("Great start! Now add your first transaction", "좋아요! 이제 첫 거래를 추가하세요"), sub: L("Moneo compares your spending with your budget automatically.", "Moneo가 지출을 예산과 자동으로 비교해요."), cta: t("addTransaction"), to: "/app/transactions?action=add" }
      : null;

  return (
    <div className={"db-page" + (hideAsk ? " no-ask" : "")}>
      <div className="db-main">
        {params.get("welcome") === "1" && <div className="db-welcome">🎉 {t("welcomeMessage")}, {user?.name}!</div>}

        <motion.header className="db-head" {...enter(0)}>
          <h1>{greet}, <span className="db-name">{firstName}</span>! <span className="db-wave">👋</span></h1>
          <p>{L("Plan smart. Spend better. Live more.", "현명하게 계획하고, 똑똑하게 쓰고, 더 즐겁게 살아요.")}</p>
        </motion.header>

        {banner && (
          <motion.section className="db-banner" {...enter(1)}>
            <span className="db-banner-icon"><Wallet size={26} /></span>
            <div className="db-banner-text">
              <h2>{banner.title}</h2>
              <p>{banner.sub}</p>
            </div>
            <svg className="db-banner-arrow" viewBox="0 0 90 30" aria-hidden="true"><path d="M2 26 C30 26 50 6 84 8 M76 2 L85 8 L77 14" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <button type="button" className="db-banner-btn" onClick={() => navigate(banner.to)}>{banner.cta} <ArrowRight size={17} /></button>
          </motion.section>
        )}

        <div className="db-stats">
          <StatCard i={2} tone="green" icon={Wallet} lang={lang} label={L("Total Balance", "총 잔액")} value={stats.balance} change={stats.balanceChange} goodWhenUp spark={stats.balSeries} />
          <StatCard i={3} tone="red" icon={ShoppingCart} lang={lang} label={L("This Month Spent", "이번 달 지출")} value={stats.spent} change={stats.spentChange} goodWhenUp={false} spark={stats.spendSeries} />
          <StatCard i={4} tone="purple" icon={Target} lang={lang} label={L("Monthly Budget", "월 예산")} value={stats.limit}>
            {stats.limit > 0 ? (
              <div className="db-budget-bar">
                <span className="db-bar"><i style={{ width: Math.min(100, stats.budgetPct) + "%" }} className={stats.budgetPct > 100 ? "over" : ""} /></span>
                <b>{stats.budgetPct}%</b>
              </div>
            ) : (
              <button type="button" className="db-link" onClick={() => navigate("/app/budgets?action=add")}>{t("createBudget")} <ArrowRight size={14} /></button>
            )}
          </StatCard>
        </div>

        <motion.section className="db-card db-overview" {...enter(5)}>
          <div className="db-card-head">
            <h3><span className="db-head-icon"><BarsIcon /></span>{L("Spending Overview", "지출 개요")}</h3>
            <label className="db-select">
              <select value={monthKey(sel.y, sel.m)} onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); setSel({ y, m: m - 1 }); }} aria-label={L("Month", "월")}>
                {monthOptions.map((o) => <option key={monthKey(o.y, o.m)} value={monthKey(o.y, o.m)}>{monthName(o)}</option>)}
              </select>
              <ChevronDown size={15} />
            </label>
          </div>
          <div className="db-overview-body">
            <div className="db-overview-left">
              <Donut parts={overview.parts} total={overview.total} lang={lang} />
              <ul className="db-legend">
                {overview.parts.length === 0 && <li className="db-muted">{L("No spending yet", "아직 지출이 없어요")}</li>}
                {overview.parts.map((p) => (
                  <li key={p.id}><i style={{ background: p.color }} /><span>{p.name}</span><b>{p.pct}%</b></li>
                ))}
              </ul>
            </div>
            <div className="db-week" role="img" aria-label={L("Spending by day of the week", "요일별 지출")}>
              {overview.week.map((v, i) => (
                <div key={days[i]} className="db-week-col" title={`${days[i]} · ${currency(v, lang)}`}>
                  <span className="db-week-bar"><i style={{ height: overview.total ? Math.max(4, (v / maxDay) * 100) + "%" : "4%" }} /></span>
                  <em>{days[i]}</em>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        <div className={"db-bottom" + (hideQuick ? " solo" : "")}>
          {!hideQuick && (
            <motion.section className="db-card db-quick" {...enter(6)}>
              <div className="db-card-head">
                <h3><Zap size={18} className="db-zap" />{L("Quick Actions", "빠른 실행")}</h3>
                <button type="button" className="db-x" onClick={() => { setHideQuick(true); remember("moneo-hide-quick", true); }} aria-label={L("Hide quick actions", "빠른 실행 숨기기")}><X size={16} /></button>
              </div>
              <div className="db-quick-grid">
                {quick.map((q) => (
                  <button key={q.key} type="button" className={"db-tile " + q.tone} onClick={() => navigate(q.to)} data-tour={q.key === "ask" ? "dash-ask-tile" : undefined}>
                    {q.badge && <em className="db-new">{q.badge}</em>}
                    <span className="db-tile-icon"><q.icon size={20} /></span>
                    <b>{q.title}</b>
                    <small>{q.sub} <ArrowRight size={12} /></small>
                  </button>
                ))}
              </div>
            </motion.section>
          )}
          <motion.section className="db-card db-recent" {...enter(7)}>
            <div className="db-card-head">
              <h3>{L("Recent Activity", "최근 활동")}</h3>
              <button type="button" className="db-seeall" onClick={() => navigate("/app/transactions")}>{L("See all", "전체 보기")} <ArrowRight size={14} /></button>
            </div>
            {recent.length === 0 ? (
              <p className="db-empty">{L("No activity yet. Your latest transactions will show here.", "아직 활동이 없어요. 최근 거래가 여기에 표시돼요.")}</p>
            ) : (
              <ul className="db-recent-list">
                {recent.map((tx) => {
                  const cat = categoryById(tx.category);
                  return (
                    <li key={tx.id}>
                      <span className="db-recent-icon" style={{ background: cat.color + "26", color: cat.color }}><CategoryIcon categoryId={tx.category} size={18} /></span>
                      <span className="db-recent-text">
                        <b>{categoryLabel(tx.category, lang)}</b>
                        <small>{relativeDay(tx.date, lang)} · {tx.merchant || (tx.type === "income" ? L("Income", "수입") : L("Expense", "지출"))}</small>
                      </span>
                      <b className={"db-amount " + (tx.type === "income" ? "in" : "out")}>{tx.type === "income" ? "+ " : "- "}{currency(tx.amount, lang)}</b>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.section>
        </div>
      </div>

      {/* ---------- Ask Anything panel ---------- */}
      <AnimatePresence>
        {!hideAsk && (
          <motion.aside className="db-ask" data-tour="dash-ask" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.3 }}>
            <div className="db-ask-head">
              <SparkleIcon size={22} className="db-ask-spark" />
              <h3>{t("askAnything")}</h3>
              <em>Beta</em>
              <span className="db-ask-tools">
                {chat.length > 0 && <button type="button" onClick={() => setChat([])} aria-label={L("Clear chat", "대화 지우기")}><RotateCcw size={16} /></button>}
                <button type="button" onClick={() => navigate("/app/ask")} aria-label={L("Open full chat", "전체 채팅 열기")}><Maximize2 size={16} /></button>
                <button type="button" onClick={() => { setHideAsk(true); remember("moneo-hide-ask", true); }} aria-label={L("Close", "닫기")}><X size={18} /></button>
              </span>
            </div>

            {chat.length === 0 ? (
              <div className="db-ask-hello">
                <RobotArt />
                <div className="db-bubble">
                  <b>{L("Hi", "안녕하세요")}{firstName ? ` ${firstName}` : ""}! 👋</b>
                  <span>{L("How can I help you today?", "무엇을 도와드릴까요?")}</span>
                </div>
                <div className="db-chips">
                  {chips.map((c) => (
                    <button key={c.text} type="button" className="db-chip" onClick={c.run} disabled={thinking}>
                      <span className={"db-chip-icon " + c.tone}><c.icon size={16} /></span>{c.text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="db-ask-msgs" ref={chatBoxRef}>
                {chat.map((m, i) => <div key={i} className={"db-msg " + m.from}>{m.text}</div>)}
                {thinking && <div className="db-msg ai"><span className="db-typing"><i /><i /><i /></span></div>}
              </div>
            )}

            <div className="db-ask-input">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={onChatKey} placeholder={L("Ask anything...", "무엇이든 물어보세요...")} aria-label={t("askAnything")} />
              <button type="button" onClick={() => ask()} disabled={thinking || !chatInput.trim()} aria-label={L("Send", "보내기")}><Send size={16} /></button>
            </div>
            <p className="db-ask-hint"><Lightbulb size={16} /> {L("Try asking something like \"Show my budget status\"", "\"내 예산 상태 보여줘\"처럼 물어보세요")}</p>
            <svg className="db-ask-wave" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 45 C70 15 140 70 210 40 C250 25 280 30 300 35 V80 H0Z" fill="#3B2C80" opacity="0.45" />
              <path d="M0 62 C80 45 150 80 220 58 C255 48 285 52 300 55 V80 H0Z" fill="#5B3FB8" opacity="0.35" />
            </svg>
          </motion.aside>
        )}
      </AnimatePresence>
      {hideAsk && (
        <button type="button" className="db-ask-fab" onClick={() => { setHideAsk(false); remember("moneo-hide-ask", false); }}>
          <SparkleIcon size={18} /> {t("askAnything")}
        </button>
      )}
    </div>
  );
}

function BarsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="12" width="4.4" height="9" rx="1.6" /><rect x="9.8" y="7.5" width="4.4" height="13.5" rx="1.6" /><rect x="16.1" y="3" width="4.4" height="18" rx="1.6" />
    </svg>
  );
}
