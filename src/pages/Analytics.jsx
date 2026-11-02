import React, { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronDown, ReceiptText, Pencil } from "lucide-react";
import CategoryIcon from "../components/CategoryIcon";
import { parseLocalDate } from "../utils/dates";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, LabelList,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";
import { useApp } from "../context/AppContext";
import {
  spendingByCategory, dailySpendSeries, totalIncome, totalExpenses,
  monthComparison, currency, monthTransactions,
} from "../utils/calculations";
import { categoryLabel, categoryById } from "../data/categories";

const COLORS = ["#34D399", "#10B981", "#FBBF24", "#A78BFA", "#F87171", "#2BB4C9", "#EC6FA8", "#6B8CFF", "#8890A3"];

// ₩2,600,000 → ₩2.6M so axis labels stay short on phones
function shortWon(v) {
  const n = Math.abs(v);
  if (n >= 1000000) return `₩${(v / 1000000).toFixed(n >= 10000000 ? 0 : 1)}M`;
  if (n >= 1000) return `₩${Math.round(v / 1000)}K`;
  return `₩${v}`;
}

export default function Analytics() {
  const { data, lang, t } = useApp();
  const { transactions } = data;

  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selected = params.get("category");
  const detailRef = useRef(null);

  const catData = useMemo(() => {
    const map = spendingByCategory(transactions);
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    const counts = {};
    monthTransactions(transactions).filter((tx) => tx.type === "expense").forEach((tx) => { counts[tx.category] = (counts[tx.category] || 0) + 1; });
    return Object.entries(map)
      .map(([id, value]) => ({ id, name: categoryLabel(id, lang), value, color: categoryById(id).color, count: counts[id] || 0, pct: total ? Math.round((value / total) * 100) : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, lang]);

  const select = (id) => {
    const next = new URLSearchParams(params);
    if (!id || id === selected) next.delete("category"); else next.set("category", id);
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if (selected) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }, [selected]);

  const daily = dailySpendSeries(transactions);
  const income = totalIncome(transactions);
  const expenses = totalExpenses(transactions);
  const { lastMonthExpenses, thisMonthExpenses } = monthComparison(transactions);

  const incomeExpenseData = [{ name: t("thisMonth"), income, expenses }];
  const comparisonData = [
    { name: lang === "ko" ? "지난달" : "Last month", amount: lastMonthExpenses },
    { name: lang === "ko" ? "이번달" : "This month", amount: thisMonthExpenses },
  ];

  return (
    <div className="page">
      <div className="page-header"><h1>{t("analytics")}</h1></div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-title-row">
            <span className="card-title">{t("spendingByCategory")}</span>
            <span className="an-hint">{lang === "ko" ? "카테고리를 누르면 상세 내역" : "Tap a category for details"}</span>
          </div>
          {catData.length === 0 ? <div className="empty-state">{t("noTransactionsYet")}</div> : (
            <div className="an-cat">
              <div className="an-cat-chart">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={catData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={86} paddingAngle={2}
                      onClick={(d) => select(d?.payload?.id || d?.id)} style={{ cursor: "pointer" }}
                    >
                      {catData.map((c) => (
                        <Cell key={c.id} fill={c.color} stroke={c.id === selected ? "#FFFFFF" : "none"} strokeWidth={c.id === selected ? 2 : 0} opacity={selected && c.id !== selected ? 0.4 : 1} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => currency(v, lang)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="an-cat-list">
                {catData.map((c) => (
                  <li key={c.id}>
                    <button type="button" className={"an-cat-row" + (c.id === selected ? " active" : "")} onClick={() => select(c.id)} aria-pressed={c.id === selected}>
                      <i style={{ background: c.color }} />
                      <span className="an-cat-name">{c.name}<small>{c.count} {lang === "ko" ? "건" : c.count === 1 ? "record" : "records"}</small></span>
                      <b>{currency(c.value, lang)}</b>
                      <em>{c.pct}%</em>
                      <ChevronRight size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title-row"><span className="card-title">{t("income")} vs {t("expenses")}</span></div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={incomeExpenseData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8A93B5" }} />
                <YAxis tick={{ fontSize: 11, fill: "#8A93B5" }} width={52} tickFormatter={shortWon} />
                <Tooltip formatter={(v) => currency(v, lang)} />
                <Legend wrapperStyle={{ fontSize: 12.5, paddingTop: 6 }} iconSize={10} />
                <Bar dataKey="income" fill="#10B981" radius={[6, 6, 0, 0]} name={t("income")} />
                <Bar dataKey="expenses" fill="#F87171" radius={[6, 6, 0, 0]} name={t("expenses")} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div ref={detailRef} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            <CategoryDetail categoryId={selected} transactions={transactions} lang={lang} onClose={() => select(null)} onEdit={() => navigate("/app/transactions")} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="dash-grid">
        <div className="card">
          <div className="card-title-row"><span className="card-title">{lang === "ko" ? "누적 지출 추세" : "Cumulative Spending Trend"}</span></div>
          {daily.length === 0 ? <div className="empty-state">{t("noTransactionsYet")}</div> : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8A93B5" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#8A93B5" }} width={52} tickFormatter={shortWon} />
                  <Tooltip formatter={(v) => currency(v, lang)} />
                  <Line type="monotone" dataKey="cumulative" stroke="#34D399" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title-row"><span className="card-title">{lang === "ko" ? "월 비교" : "Month Comparison"}</span></div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8A93B5" }} />
                <YAxis tick={{ fontSize: 11, fill: "#8A93B5" }} width={52} tickFormatter={shortWon} />
                <Tooltip formatter={(v) => currency(v, lang)} />
                <Bar dataKey="amount" fill="#A78BFA" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- one category, this month, in detail ----------
function CategoryDetail({ categoryId, transactions, lang, onClose, onEdit }) {
  const ko = lang === "ko";
  const cat = categoryById(categoryId);
  const [openId, setOpenId] = useState(null);
  const list = useMemo(() => monthTransactions(transactions)
    .filter((tx) => tx.type === "expense" && tx.category === categoryId)
    .sort((a, b) => (parseLocalDate(b.date) - parseLocalDate(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
  [transactions, categoryId]);

  const total = list.reduce((s, tx) => s + Number(tx.amount || 0), 0);
  const biggest = list.reduce((m, tx) => (Number(tx.amount) > Number(m?.amount || 0) ? tx : m), null);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const byDay = Array.from({ length: Math.min(daysInMonth, now.getDate()) }, (_, i) => ({ day: i + 1, amount: 0 }));
  list.forEach((tx) => { const d = parseLocalDate(tx.date).getDate(); if (byDay[d - 1]) byDay[d - 1].amount += Number(tx.amount || 0); });
  // Every record as its own bar / slice, oldest first: #1, #2, #3 …
  const records = [...list].reverse().map((tx, i) => ({
    id: tx.id, n: i + 1, label: `#${i + 1}`, amount: Number(tx.amount || 0),
    name: tx.merchant || categoryLabel(tx.category, lang), date: tx.date,
  }));
  const RECORD_COLORS = [cat.color, "#8B5CF6", "#22D3EE", "#F59E0B", "#34D399", "#F472B6", "#60A5FA", "#FB7185", "#A3E635", "#94A3B8"];
  const slices = (() => {
    const sorted = [...records].sort((a, b) => b.amount - a.amount);
    const top = sorted.length > 9 ? sorted.slice(0, 8) : sorted;
    const rest = sorted.length > 9 ? sorted.slice(8).reduce((s, r) => s + r.amount, 0) : 0;
    const out = top.map((r) => ({ ...r, key: r.id, color: RECORD_COLORS[(r.n - 1) % RECORD_COLORS.length] }));
    if (rest) out.push({ key: "_rest", label: ko ? "기타" : "Others", name: ko ? `나머지 ${sorted.length - 8}건` : `${sorted.length - 8} more records`, amount: rest, color: "#64748B" });
    return out.map((s) => ({ ...s, pct: total ? Math.round((s.amount / total) * 100) : 0 }));
  })();
  const [view, setView] = useState("records");
  const [focusId, setFocusId] = useState(null);
  const fmtShort = (s) => parseLocalDate(s).toLocaleDateString(ko ? "ko-KR" : "en-US", { month: "short", day: "numeric" });
  const recordTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload;
    return (
      <div className="an-tip">
        <b>{r.label} · {currency(r.amount, lang)}</b>
        <span>{r.date ? `${fmtShort(r.date)} · ` : ""}{r.name}</span>
      </div>
    );
  };
  const pickRecord = (r) => {
    if (!r?.id) return;
    setFocusId(r.id);
    const tx = list.find((x) => x.id === r.id);
    if (tx && Array.isArray(tx.items) && tx.items.length) setOpenId(r.id);
    setTimeout(() => document.getElementById(`rec-${r.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const shops = {};
  list.forEach((tx) => { const k = (tx.merchant || (ko ? "가맹점 없음" : "No merchant")).trim(); shops[k] = (shops[k] || 0) + Number(tx.amount || 0); });
  const topShops = Object.entries(shops).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const monthName = now.toLocaleDateString(ko ? "ko-KR" : "en-US", { month: "long", year: "numeric" });
  const fmtDate = (s) => parseLocalDate(s).toLocaleDateString(ko ? "ko-KR" : "en-US", { month: "short", day: "numeric", weekday: "short" });

  return (
    <section className="card an-detail" aria-label={categoryLabel(categoryId, lang)}>
      <div className="an-detail-head">
        <span className="an-detail-icon" style={{ background: cat.color + "26", color: cat.color }}><CategoryIcon categoryId={categoryId} size={20} /></span>
        <div>
          <h2>{categoryLabel(categoryId, lang)}</h2>
          <p>{monthName} · {list.length} {ko ? "건" : list.length === 1 ? "record" : "records"}</p>
        </div>
        <button type="button" className="an-close" onClick={onClose} aria-label={ko ? "닫기" : "Close"}><X size={18} /></button>
      </div>

      <div className="an-detail-stats">
        <div><span>{ko ? "이번 달 합계" : "Total this month"}</span><b>{currency(total, lang)}</b></div>
        <div><span>{ko ? "평균 금액" : "Average per record"}</span><b>{currency(list.length ? total / list.length : 0, lang)}</b></div>
        <div><span>{ko ? "가장 큰 지출" : "Largest"}</span><b>{biggest ? currency(biggest.amount, lang) : "—"}</b><small>{biggest?.merchant || ""}</small></div>
        <div><span>{ko ? "자주 간 곳" : "Top places"}</span><b className="an-shops">{topShops.length ? topShops.map(([n]) => n).join(", ") : "—"}</b></div>
      </div>

      <div className="an-view-tabs" role="tablist" aria-label={ko ? "차트 보기" : "Chart view"}>
        <button type="button" role="tab" aria-selected={view === "records"} className={view === "records" ? "on" : ""} onClick={() => setView("records")}>{ko ? "기록별" : "Each record"}</button>
        <button type="button" role="tab" aria-selected={view === "days"} className={view === "days" ? "on" : ""} onClick={() => setView("days")}>{ko ? "날짜별" : "By day"}</button>
      </div>

      {view === "records" ? (
        <div className="an-records-charts">
          <div className="an-detail-chart">
            <ResponsiveContainer>
              <BarChart data={records} margin={{ top: 26, right: 6, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: "#B8B1D9" }} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: "#9590B5" }} width={52} tickFormatter={shortWon} />
                <Tooltip content={recordTip} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]} isAnimationActive={false} onClick={(d) => pickRecord(d?.payload || d)} style={{ cursor: "pointer" }} maxBarSize={56}>
                  {records.map((r) => <Cell key={r.id} fill={RECORD_COLORS[(r.n - 1) % RECORD_COLORS.length]} opacity={focusId && focusId !== r.id ? 0.45 : 1} />)}
                  {records.length <= 14 && <LabelList dataKey="amount" position="top" formatter={shortWon} style={{ fill: "#E9E5FF", fontSize: 11, fontWeight: 700 }} />}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="an-record-pie">
            <div className="an-pie-box">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={slices} dataKey="amount" nameKey="label" innerRadius={44} outerRadius={74} paddingAngle={slices.length > 1 ? 2 : 0} isAnimationActive={false} onClick={(d) => pickRecord(d?.payload || d)} style={{ cursor: "pointer" }}>
                    {slices.map((s) => <Cell key={s.key} fill={s.color} stroke="none" opacity={focusId && focusId !== s.id ? 0.45 : 1} />)}
                  </Pie>
                  <Tooltip content={recordTip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="an-pie-legend">
              {slices.slice(0, 6).map((s) => (
                <li key={s.key}><i style={{ background: s.color }} /><span>{s.label} · {s.name}</span><b>{s.pct}%</b></li>
              ))}
              {slices.length > 6 && <li className="more">{ko ? `외 ${slices.length - 6}개` : `+${slices.length - 6} more`}</li>}
            </ul>
          </div>
        </div>
      ) : (
      <div className="an-detail-chart">
        <ResponsiveContainer>
          <BarChart data={byDay} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9590B5" }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tick={{ fontSize: 11, fill: "#9590B5" }} width={52} tickFormatter={shortWon} />
            <Tooltip formatter={(v) => currency(v, lang)} labelFormatter={(d) => (ko ? `${now.getMonth() + 1}월 ${d}일` : `${now.toLocaleString("en-US", { month: "short" })} ${d}`)} />
            <Bar dataKey="amount" fill={cat.color} radius={[5, 5, 0, 0]} name={categoryLabel(categoryId, lang)} isAnimationActive={false} minPointSize={0} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      )}

      <h3 className="an-detail-sub">{ko ? "모든 기록" : "All records"}</h3>
      {list.length === 0 ? (
        <p className="empty-state">{ko ? "이번 달 기록이 없어요." : "No records this month."}</p>
      ) : (
        <ul className="an-records">
          {list.map((tx) => {
            const hasItems = Array.isArray(tx.items) && tx.items.length > 0;
            const open = openId === tx.id;
            return (
              <li key={tx.id} id={`rec-${tx.id}`} className={(open ? "open" : "") + (focusId === tx.id ? " focus" : "")}>
                <button type="button" className="an-record" onClick={() => { setFocusId(tx.id); if (hasItems) setOpenId(open ? null : tx.id); }} aria-expanded={hasItems ? open : undefined}>
                  <span className="an-record-date"><em className="an-rec-num">#{records.find((r) => r.id === tx.id)?.n}</em>{fmtDate(tx.date)}</span>
                  <span className="an-record-main">
                    <b>{tx.merchant || categoryLabel(tx.category, lang)}</b>
                    <small>
                      {tx.paymentMethod || ""}{tx.source === "receipt" || hasItems ? ` · ${ko ? "영수증" : "Receipt"}` : ""}{tx.note ? ` · ${tx.note}` : ""}
                    </small>
                  </span>
                  <b className="an-record-amt">{currency(tx.amount, lang)}</b>
                  {hasItems ? (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="an-record-pad" />}
                </button>
                {open && hasItems && (
                  <ul className="an-items">
                    {tx.items.map((it, k) => (
                      <li key={k}>
                        <ReceiptText size={13} />
                        <span>{it.name || it.name_original}{it.name_original && it.name && it.name_original !== it.name ? <small> · {it.name_original}</small> : null}</span>
                        <em>× {it.quantity || 1}</em>
                        <b>{currency(it.price, lang)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="btn-secondary an-edit" onClick={onEdit}><Pencil size={14} /> {ko ? "거래 내역에서 수정하기" : "Edit in Transactions"}</button>
    </section>
  );
}
