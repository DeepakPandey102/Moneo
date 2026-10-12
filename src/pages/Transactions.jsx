import React, { useState, useMemo, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Trash2, Pencil, X, Camera, Check, AlertCircle,
  Sparkles, ReceiptText, CopyX,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import CategoryIcon from "../components/CategoryIcon";
import Celebration from "../components/Celebration";
import { CATEGORIES, PAYMENT_METHODS, categoryLabel } from "../data/categories";
import { currency } from "../utils/calculations";
import { extractReceiptData, friendlyReceiptError, warmUpBackend } from "../services/assistantService";
import { todayLocal, parseLocalDate } from "../utils/dates";
import { fileFingerprint, findDuplicate } from "../utils/duplicates";

// A function, not a constant: the old constant computed "today" once when
// the file loaded (and in UTC), so the default date was wrong before 9am in
// Korea and stayed stuck on yesterday if the tab was left open overnight.
function emptyForm() {
  return { type: "expense", amount: "", category: "food", merchant: "", date: todayLocal(), paymentMethod: "Card", note: "" };
}

// Gemini returns free text like "신용카드" or "VISA ****1234" — map it onto
// one of the app's fixed options so the dropdown and filters stay consistent.
function normalizePaymentMethod(raw) {
  const v = String(raw || "").toLowerCase();
  if (!v) return "Card";
  if (/cash|현금/.test(v)) return "Cash";
  if (/transfer|이체|계좌|bank/.test(v)) return "Transfer";
  if (/card|카드|credit|debit|visa|master|amex|체크|신용|pay|페이/.test(v)) return "Card";
  return PAYMENT_METHODS.includes(raw) ? raw : "Other";
}

// What the AI read off a receipt, in the shape findDuplicate() compares.
function scanCandidate(r) {
  return {
    type: "expense",
    amount: Number(r.total),
    date: r.date,
    merchant: r.merchant,
    merchantOriginal: r.merchant_original,
    category: r.category,
    receiptHash: r.receiptHash || null,
    receiptTime: r.receipt_time || "",
    approvalNo: r.approval_number || "",
  };
}

const ANALYZE_STEPS_EN = ["Reading merchant...", "Checking total...", "Detecting category...", "Extracting items..."];
const ANALYZE_STEPS_KO = ["가맹점 확인 중...", "총액 확인 중...", "카테고리 분석 중...", "항목 추출 중..."];

export default function Transactions() {
  const { data, addTransaction, updateTransaction, deleteTransaction, unlockAchievement, showToast, lang, t } = useApp();
  const { transactions } = data;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(() => params.get("q") || "");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterSource, setFilterSource] = useState(() => (params.get("source") === "ai" ? "ai" : "all")); // all | ai
  const [celebrateTrigger, setCelebrateTrigger] = useState(0);
  const [celebrateLabel, setCelebrateLabel] = useState("");
  const fileInputRef = useRef(null);

  // Receipt review flow state
  const [scanState, setScanState] = useState("idle"); // idle | analyzing | review | error
  const [scanStep, setScanStep] = useState(0);
  const [scanSlow, setScanSlow] = useState(false); // shown if the server is still waking up
  const [scanResult, setScanResult] = useState(null); // backend response
  const [scanError, setScanError] = useState("");
  const [reviewEditing, setReviewEditing] = useState(false);
  // Duplicate popup: { kind: "photo" | "scan" | "manual", match, candidate, onContinue, onCancel }
  const [dupDialog, setDupDialog] = useState(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false); // user chose "save anyway"

  // Re-checked live, so editing the date/amount in review updates the warning.
  const scanDuplicate = useMemo(
    () => (scanResult ? findDuplicate(transactions, scanCandidate(scanResult)) : null),
    [scanResult, transactions]
  );

  const filtered = useMemo(() => {
    return [...transactions]
      .filter((tx) => filterCategory === "all" || tx.category === filterCategory)
      .filter((tx) => filterType === "all" || tx.type === filterType)
      .filter((tx) => filterSource !== "ai" || tx.source === "ai_receipt")
      .filter((tx) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return [tx.merchant, tx.merchantOriginal, tx.note].some((v) => (v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => (parseLocalDate(b.date) - parseLocalDate(a.date)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }, [transactions, filterCategory, filterType, filterSource, search]);

  function openAdd() {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(tx) {
    setForm({ ...tx, amount: String(tx.amount) });
    setEditingId(tx.id);
    setShowForm(true);
  }

  function saveTransaction(payload, { isFirst, celebrateText } = {}) {
    addTransaction(payload);
    unlockAchievement("first_transaction");
    showToast(lang === "ko" ? "거래가 추가됐어요." : "Transaction added.");
    setCelebrateLabel(celebrateText || (isFirst
      ? (lang === "ko" ? "🎉 첫 거래 기록 완료!" : "🎉 First transaction logged!")
      : (lang === "ko" ? "✨ 거래가 추가됐어요" : "✨ Added!")));
    setCelebrateTrigger((n) => n + 1);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast(lang === "ko" ? "0보다 큰 금액을 입력해주세요." : "Please enter an amount greater than 0.", "error");
      return;
    }
    const payload = { ...form, amount };
    // Same date + amount + merchant already saved? Let the user decide —
    // manual entries can be real repeats (e.g. two bus fares in a day).
    const dup = findDuplicate(transactions, payload, { ignoreId: editingId });
    if (dup) {
      setDupDialog({
        kind: "manual",
        match: dup,
        candidate: payload,
        onContinue: () => finishSubmit({ ...payload, duplicateOf: dup.tx.id }),
      });
      return;
    }
    finishSubmit(payload);
  }

  function finishSubmit(payload) {
    if (editingId) {
      updateTransaction(editingId, payload);
      showToast(lang === "ko" ? "거래가 수정됐어요." : "Transaction updated.");
    } else {
      saveTransaction(payload, { isFirst: transactions.length === 0 });
    }
    setShowForm(false);
  }

  function handleDelete(id) {
    if (!window.confirm(lang === "ko" ? "이 거래를 삭제할까요?" : "Delete this transaction?")) return;
    deleteTransaction(id);
    showToast(lang === "ko" ? "거래가 삭제됐어요." : "Transaction deleted.", "error");
  }

  // ---------- Receipt scanning: always calls the real backend/Gemini.
  // Never fakes a result — if the backend or key isn't set up, this
  // shows a clear error instead of pretending it worked. ----------

  function triggerReceiptUpload() {
    fileInputRef.current?.click();
  }

  const stepTimerRef = useRef(null);

  async function handleReceiptFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAllowDuplicate(false);

    // Same photo as a saved receipt? Ask first — before spending an AI call.
    const receiptHash = await fileFingerprint(file);
    const samePhoto = receiptHash ? findDuplicate(transactions, { receiptHash }) : null;
    if (samePhoto) {
      setDupDialog({
        kind: "photo",
        match: samePhoto,
        onContinue: () => { setAllowDuplicate(true); analyzeReceipt(file, receiptHash, true); },
      });
      return;
    }
    analyzeReceipt(file, receiptHash, false);
  }

  async function analyzeReceipt(file, receiptHash, alreadyConfirmed) {
    setScanState("analyzing");
    setScanStep(0);
    setScanError("");
    setScanSlow(false);

    const steps = lang === "ko" ? ANALYZE_STEPS_KO : ANALYZE_STEPS_EN;
    const started = Date.now();
    stepTimerRef.current = setInterval(() => {
      setScanStep((s) => (s + 1) % steps.length);
      if (Date.now() - started > 9000) setScanSlow(true);
    }, 900);

    try {
      const result = await extractReceiptData(file, lang);
      clearInterval(stepTimerRef.current);
      const next = { ...result, receiptHash, payment_method: normalizePaymentMethod(result.payment_method) };
      setScanResult(next);
      setReviewEditing(false);
      setScanState("review");

      // A different photo of a receipt that's already saved → pop up the choice.
      const dup = alreadyConfirmed ? null : findDuplicate(transactions, scanCandidate(next));
      if (dup) {
        setDupDialog({
          kind: "scan",
          match: dup,
          candidate: scanCandidate(next),
          onContinue: () => setAllowDuplicate(true), // back to the review screen
          onCancel: closeScanFlow,
        });
      }
    } catch (err) {
      clearInterval(stepTimerRef.current);
      console.error("Receipt scan failed:", err);
      setScanError(friendlyReceiptError(err, lang));
      setScanState("error");
    }
  }

  useEffect(() => () => clearInterval(stepTimerRef.current), []);
  useEffect(() => { warmUpBackend(); }, []);

  // Links from the dashboard / top search bar / sidebar:
  //   ?q=...  -> search, ?source=ai -> Receipts view, ?action=add|scan -> open that flow
  useEffect(() => {
    const q = params.get("q");
    if (q !== null) setSearch(q);
    setFilterSource(params.get("source") === "ai" ? "ai" : "all");
    const action = params.get("action");
    if (action === "add") openAdd();
    if (action === "scan") setTimeout(() => fileInputRef.current?.click(), 50);
    if (action) {
      const next = new URLSearchParams(params);
      next.delete("action");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function closeScanFlow() {
    setScanState("idle");
    setScanResult(null);
    setScanError("");
    setReviewEditing(false);
    setAllowDuplicate(false);
  }

  function confirmReceiptSave(force = false) {
    if (!scanResult) return;
    const amount = Number(scanResult.total);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast(lang === "ko" ? "금액을 확인해주세요 — 편집을 눌러 수정할 수 있어요." : "Please check the amount — tap Edit to fix it.", "error");
      setReviewEditing(true);
      return;
    }
    // Edited into a duplicate on the review screen? Ask once more.
    if (scanDuplicate && !allowDuplicate && !force) {
      setDupDialog({
        kind: "scan",
        match: scanDuplicate,
        candidate: scanCandidate(scanResult),
        onContinue: () => { setAllowDuplicate(true); confirmReceiptSave(true); },
      });
      return;
    }
    const payload = {
      type: "expense",
      amount,
      category: scanResult.category,
      merchant: scanResult.merchant,
      merchantOriginal: showOriginal(scanResult.merchant, scanResult.merchant_original) ? scanResult.merchant_original : "",
      date: scanResult.date,
      paymentMethod: normalizePaymentMethod(scanResult.payment_method),
      note: "",
      source: "ai_receipt",
      confidence: scanResult.confidence,
      items: scanResult.items || [],
      // Fingerprints for duplicate detection (no image is stored).
      receiptHash: scanResult.receiptHash || null,
      receiptTime: scanResult.receipt_time || "",
      approvalNo: scanResult.approval_number || "",
      ...(scanDuplicate ? { duplicateOf: scanDuplicate.tx.id } : {}),
    };
    saveTransaction(payload, {
      isFirst: transactions.length === 0,
      celebrateText: lang === "ko" ? "🤖 AI 영수증 저장 완료!" : "🤖 AI receipt saved!",
    });
    closeScanFlow();
  }

  // Show the receipt's printed text under the translation only when it differs.
  function showOriginal(main, original) {
    return Boolean(original) && original.trim().toLowerCase() !== String(main || "").trim().toLowerCase();
  }

  function updateScanField(field, value) {
    setScanResult((prev) => ({ ...prev, [field]: value }));
  }

  const confidenceMeta = {
    high: { label: lang === "ko" ? "높은 신뢰도" : "High confidence", color: "#34D399", bg: "rgba(52,211,153,0.14)" },
    review: { label: lang === "ko" ? "검토 권장" : "Review recommended", color: "#FBBF24", bg: "rgba(251,191,36,0.14)" },
    low: { label: lang === "ko" ? "낮은 신뢰도 — 확인 필요" : "Low confidence — please verify", color: "#F87171", bg: "rgba(248,113,113,0.14)" },
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t("transactions")}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-secondary" onClick={triggerReceiptUpload}>
            <Camera size={15} style={{ marginRight: 6 }} />{lang === "ko" ? "영수증 스캔" : "Scan Receipt"}
          </button>
          <button className="btn-primary" onClick={openAdd}><Plus size={16} /> {t("addTransaction")}</button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleReceiptFile} />
      </div>

      <div className="filter-row">
        <div className="search-box">
          <Search size={15} />
          <input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="all">{t("filterCategory")}</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c.id, lang)}</option>)}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="all">{t("filterType")}</option>
          <option value="income">{t("income_")}</option>
          <option value="expense">{t("expense_")}</option>
        </select>
        <button
          className={"pill" + (filterSource === "ai" ? " active-blue" : "")}
          onClick={() => setFilterSource(filterSource === "ai" ? "all" : "ai")}
          style={{ flex: "0 0 auto", padding: "9px 14px" }}
        >
          <Sparkles size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
          {lang === "ko" ? "AI 스캔됨" : "AI Scanned"}
        </button>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            {transactions.length === 0 ? t("noTransactionsYet") : (lang === "ko" ? "일치하는 거래가 없어요." : "No transactions match your filters.")}
          </div>
        ) : (
          <div className="tx-list">
            {filtered.map((tx) => (
              <div key={tx.id} className="tx-row">
                <CategoryIcon categoryId={tx.category} withBg />
                <div className="tx-info">
                  <div className="tx-merchant">
                    <span className="tx-merchant-name">{tx.merchant || categoryLabel(tx.category, lang)}</span>
                    {tx.source === "ai_receipt" && (
                      <span className="ai-badge"><Sparkles size={10} /> {lang === "ko" ? "AI 인식" : "AI"}</span>
                    )}
                  </div>
                  {tx.merchantOriginal && <div className="tx-original">{tx.merchantOriginal}</div>}
                  <div className="tx-date">{tx.date} · {tx.paymentMethod}{tx.note ? " · " + tx.note : ""}</div>
                </div>
                <div className={"tx-amount " + (tx.type === "income" ? "positive" : "")}>
                  {tx.type === "income" ? "+" : "-"}{currency(tx.amount, lang)}
                </div>
                <div className="tx-actions">
                  <button onClick={() => openEdit(tx)}><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(tx.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- Manual add/edit modal ---------- */}
      <AnimatePresence>
        {showForm && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)}>
            <motion.div className="modal" initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingId ? t("editTransaction") : t("addTransaction")}</h2>
                <button onClick={() => setShowForm(false)}><X size={18} /></button>
              </div>

              <form onSubmit={handleSubmit} className="tx-form" noValidate>
                <div className="form-row">
                  <button type="button" className={"pill " + (form.type === "expense" ? "active-red" : "")} onClick={() => setForm({ ...form, type: "expense" })}>{t("expense_")}</button>
                  <button type="button" className={"pill " + (form.type === "income" ? "active-green" : "")} onClick={() => setForm({ ...form, type: "income" })}>{t("income_")}</button>
                </div>
                <label>{t("amount")}</label>
                <input type="number" inputMode="numeric" min="1" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                <label>{t("category")}</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c.id, lang)}</option>)}
                </select>
                <label>{t("merchant")}</label>
                <input type="text" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
                <div className="form-row-2">
                  <div>
                    <label>{t("date")}</label>
                    <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                  <div>
                    <label>{t("paymentMethod")}</label>
                    <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <label>{t("note")}</label>
                <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                <button type="submit" className="btn-primary btn-block" style={{ marginTop: 14 }}>{t("save")}</button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- Receipt scan flow: analyzing / review / error ---------- */}
      <AnimatePresence>
        {scanState !== "idle" && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={scanState !== "analyzing" ? closeScanFlow : undefined}>
            <motion.div className="modal" initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} onClick={(e) => e.stopPropagation()}>

              {scanState === "analyzing" && (
                <div className="scan-loading">
                  <div className="scan-spinner"><Sparkles size={26} color="#34D399" /></div>
                  <div className="scan-loading-title">{lang === "ko" ? "AI가 영수증을 분석하고 있어요" : "Moneo AI is analyzing your receipt"}</div>
                  <motion.div key={scanStep} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="scan-loading-step">
                    {(lang === "ko" ? ANALYZE_STEPS_KO : ANALYZE_STEPS_EN)[scanStep]}
                  </motion.div>
                  {scanSlow && (
                    <p className="scan-slow-note">
                      {lang === "ko"
                        ? "서버를 깨우는 중이에요. 처음 스캔은 최대 1분 걸릴 수 있어요."
                        : "Waking up the AI server — the first scan can take up to a minute."}
                    </p>
                  )}
                </div>
              )}

              {scanState === "error" && (
                <div className="scan-loading">
                  <div className="scan-spinner" style={{ background: "rgba(248,113,113,0.14)" }}><AlertCircle size={26} color="#F87171" /></div>
                  <div className="scan-loading-title">{lang === "ko" ? "분석에 실패했어요" : "Analysis failed"}</div>
                  <div className="scan-loading-step" style={{ color: "#F87171" }}>{scanError}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "center" }}>
                    <button className="btn-secondary" onClick={closeScanFlow}>{t("cancel")}</button>
                    <button className="btn-primary" onClick={() => { closeScanFlow(); openAdd(); }}>
                      {lang === "ko" ? "직접 입력하기" : "Enter manually"}
                    </button>
                  </div>
                </div>
              )}

              {scanState === "review" && scanResult && (
                <>
                  <div className="modal-header">
                    <h2><ReceiptText size={18} style={{ marginRight: 8, verticalAlign: -3 }} />{lang === "ko" ? "AI 영수증 분석" : "AI Receipt Analysis"}</h2>
                    <button onClick={closeScanFlow}><X size={18} /></button>
                  </div>

                  <div
                    className="confidence-badge"
                    style={{ background: confidenceMeta[scanResult.confidence_label]?.bg, color: confidenceMeta[scanResult.confidence_label]?.color }}
                  >
                    {confidenceMeta[scanResult.confidence_label]?.label} · {scanResult.confidence}%
                  </div>

                  {scanDuplicate && allowDuplicate && (
                    <div className="dup-note">
                      <CopyX size={14} />
                      <span>
                        {lang === "ko"
                          ? `비슷한 거래(${scanDuplicate.tx.date} · ${currency(scanDuplicate.tx.amount, lang)})와 별도로 저장돼요.`
                          : `Will be saved separately from a similar one (${scanDuplicate.tx.date} · ${currency(scanDuplicate.tx.amount, lang)}).`}
                      </span>
                    </div>
                  )}

                  {!reviewEditing ? (
                    <div className="receipt-summary">
                      <div className="receipt-summary-row">
                        <span>{t("merchant")}</span>
                        <b className="receipt-value">
                          {scanResult.merchant}
                          {showOriginal(scanResult.merchant, scanResult.merchant_original) && <small>{scanResult.merchant_original}</small>}
                        </b>
                      </div>
                      <div className="receipt-summary-row"><span>{t("date")}</span><b>{scanResult.date}</b></div>
                      <div className="receipt-summary-row"><span>{t("amount")}</span><b>{currency(scanResult.total, lang)}</b></div>
                      <div className="receipt-summary-row"><span>{t("category")}</span><b>{categoryLabel(scanResult.category, lang)}</b></div>
                      <div className="receipt-summary-row"><span>{t("paymentMethod")}</span><b>{scanResult.payment_method}</b></div>

                      {scanResult.items?.length > 0 && (
                        <div className="receipt-items">
                          <div className="receipt-items-title">{lang === "ko" ? "항목" : "Items"}</div>
                          {scanResult.items.map((item, i) => (
                            <div key={i} className="receipt-item-row">
                              <span className="receipt-item-name">
                                {item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ""}
                                {showOriginal(item.name, item.name_original) && <small>{item.name_original}</small>}
                              </span>
                              <span className="receipt-item-price">{currency(item.price, lang)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="tx-form">
                      <label>{t("merchant")}</label>
                      <input type="text" value={scanResult.merchant} onChange={(e) => updateScanField("merchant", e.target.value)} />
                      <label>{t("date")}</label>
                      <input type="date" value={scanResult.date} onChange={(e) => updateScanField("date", e.target.value)} />
                      <label>{t("amount")}</label>
                      <input type="number" inputMode="numeric" min="1" step="any" value={scanResult.total} onChange={(e) => updateScanField("total", e.target.value)} />
                      <label>{t("category")}</label>
                      <select value={scanResult.category} onChange={(e) => updateScanField("category", e.target.value)}>
                        {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c.id, lang)}</option>)}
                      </select>
                      <label>{t("paymentMethod")}</label>
                      <select value={scanResult.payment_method} onChange={(e) => updateScanField("payment_method", e.target.value)}>
                        {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setReviewEditing((v) => !v)}>
                      <Pencil size={14} style={{ marginRight: 6 }} />{reviewEditing ? (lang === "ko" ? "완료" : "Done") : t("edit")}
                    </button>
                    <button className="btn-primary" style={{ flex: 1 }} onClick={() => confirmReceiptSave()}>
                      <Check size={15} style={{ marginRight: 6 }} />{lang === "ko" ? "확인 & 저장" : "Confirm & Save"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dupDialog && (
          <DuplicateDialog
            dialog={dupDialog}
            lang={lang}
            onCancel={() => { const d = dupDialog; setDupDialog(null); d.onCancel?.(); }}
            onContinue={() => { const d = dupDialog; setDupDialog(null); d.onContinue?.(); }}
          />
        )}
      </AnimatePresence>

      <Celebration trigger={celebrateTrigger} label={celebrateLabel} />
    </div>
  );
}

// One row describing a transaction inside the duplicate popup.
function DuplicateCard({ tx, label, lang }) {
  return (
    <div className="dup-card">
      <div className="dup-card-main">
        {label && <em>{label}</em>}
        <b>{tx.merchant || categoryLabel(tx.category, lang)}</b>
        <span>{tx.date}{tx.receiptTime ? ` · ${tx.receiptTime}` : ""}</span>
      </div>
      <b className="dup-card-amount">{currency(tx.amount, lang)}</b>
    </div>
  );
}

// Popup shown when something looks like a duplicate. The safe choice
// ("Don't save") is the main button, but the user always gets the final say —
// the AI or the matching can be wrong.
function DuplicateDialog({ dialog, lang, onCancel, onContinue }) {
  const ko = lang === "ko";
  const { kind, match, candidate } = dialog;
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const reasonText = {
    photo: ko ? "똑같은 사진이 이미 저장되어 있어요." : "This exact photo is already saved.",
    approval: ko ? "카드 승인번호와 금액이 같아요." : "Same card approval number and amount.",
    details: match.level === "exact"
      ? (ko ? "가맹점·날짜·금액·시간이 모두 같아요." : "Same store, date, amount and time.")
      : (ko ? "가맹점·날짜·금액이 같아요." : "Same store, date and amount."),
  }[match.reason];

  const copy = {
    photo: {
      title: ko ? "이미 스캔한 사진이에요" : "You've scanned this photo before",
      body: ko
        ? "같은 영수증을 두 번 저장하면 지출이 두 번 계산돼요. 다른 영수증이 맞다면 그래도 스캔할 수 있어요."
        : "Saving the same receipt twice counts the spending twice. If this really is a different receipt, you can still scan it.",
      cancel: ko ? "취소" : "Cancel",
      go: ko ? "그래도 스캔" : "Scan anyway",
    },
    scan: {
      title: match.level === "exact"
        ? (ko ? "이미 저장된 영수증이에요" : "This receipt is already saved")
        : (ko ? "중복된 영수증 같아요" : "This looks like a duplicate"),
      body: ko
        ? "같은 영수증이라면 저장하지 마세요. 같은 날 같은 금액으로 따로 산 거라면 저장해도 돼요."
        : "If it's the same receipt, don't save it. If you really bought this twice, you can save it as a separate purchase.",
      cancel: ko ? "저장 안 함" : "Don't save",
      go: ko ? "그래도 저장" : "Save anyway",
    },
    manual: {
      title: ko ? "비슷한 거래가 이미 있어요" : "A similar transaction already exists",
      body: ko
        ? "실수로 두 번 입력한 거라면 취소하세요. 따로 쓴 돈이라면 저장해도 돼요."
        : "Cancel if you entered it twice by mistake. Save it if this was a separate payment.",
      cancel: ko ? "취소" : "Cancel",
      go: ko ? "그래도 저장" : "Save anyway",
    },
  }[kind];

  return (
    <motion.div className="modal-backdrop dup-dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCancel}>
      <motion.div
        className="modal dup-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dup-dialog-title"
        aria-describedby="dup-dialog-body"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dup-dialog-icon"><CopyX size={24} color="#FBBF24" /></div>
        <h2 id="dup-dialog-title">{copy.title}</h2>
        <p className="dup-dialog-reason">{reasonText}</p>
        <p id="dup-dialog-body" className="dup-dialog-body">{copy.body}</p>

        <DuplicateCard tx={match.tx} label={ko ? "이미 저장됨" : "Already saved"} lang={lang} />
        {candidate && <DuplicateCard tx={candidate} label={ko ? (kind === "manual" ? "지금 입력" : "새로 스캔") : (kind === "manual" ? "New entry" : "New scan")} lang={lang} />}

        <div className="dup-dialog-actions">
          <button type="button" className="btn-secondary" onClick={onContinue}>{copy.go}</button>
          <button type="button" className="btn-primary" ref={cancelRef} onClick={onCancel}>{copy.cancel}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
