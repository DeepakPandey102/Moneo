import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useApp } from "../context/AppContext";

// Coach marks: dims the screen, cuts a spotlight around one element and
// explains it in a small card. Steps can open another page first.
//
// Elements are found by data-tour="..." attributes. If an element isn't on
// screen (e.g. a sidebar link on a phone), the card is shown in the centre.
//
// Starts automatically the first time a user logs in. Replay it from
// Settings, or from anywhere with:  window.dispatchEvent(new Event("moneo:start-tour"))

export const START_TOUR_EVENT = "moneo:start-tour";
const doneKey = (userId) => `moneo-tour-done:${userId}`;

function buildSteps(lang, name) {
  const ko = lang === "ko";
  const first = (name || "").split(" ")[0];
  return [
    {
      title: ko ? `${first ? first + "님, " : ""}Moneo에 오신 걸 환영해요` : `Welcome to Moneo${first ? ", " + first : ""}`,
      body: ko ? "1분이면 주요 기능을 둘러볼 수 있어요. 언제든 건너뛸 수 있어요." : "A one-minute look at the main features. You can skip at any time.",
    },
    {
      target: "nav-budgets",
      title: ko ? "예산부터 시작하세요" : "Start with a budget",
      body: ko ? "카테고리별로 한 달에 쓸 금액을 정해요. 한도에 가까워지면 Moneo가 알려줘요." : "Decide how much you want to spend each month per category. Moneo warns you before you go over.",
    },
    {
      route: "/app/budgets",
      target: "budget-add",
      title: ko ? "첫 예산 만들기" : "Create your first budget",
      body: ko ? "식비 같은 카테고리를 고르고 월 한도를 입력하세요." : "Pick a category such as Food and enter a monthly limit.",
    },
    {
      route: "/app/transactions",
      target: "tx-scan",
      title: ko ? "영수증 스캔" : "Scan a receipt",
      body: ko ? "한국어나 영어 영수증을 찍으면 AI가 가맹점, 날짜, 금액, 품목을 채워줘요. 확인하고 저장만 하세요." : "Photograph any Korean or English receipt. The AI fills in the store, date, amount and items; you just check and save.",
    },
    {
      target: "tx-add",
      title: ko ? "직접 입력도 돼요" : "Or add it yourself",
      body: ko ? "현금이나 이체처럼 영수증이 없는 지출과 수입은 여기서 추가해요." : "Cash, transfers and income without a receipt go here.",
    },
    {
      target: "nav-assistant",
      title: ko ? "내 돈에 대해 물어보기" : "Ask about your money",
      body: ko ? "\"이번 달 식비 얼마 썼어?\" 같은 질문에 내 데이터로 답해줘요." : "Questions like \"How much did I spend on food this month?\" answered from your own data.",
    },
    {
      route: "/app/dashboard",
      target: "dash-ask",
      title: ko ? "무엇이든 물어보기" : "Ask Anything",
      body: ko ? "홈 화면 오른쪽에서 바로 AI에게 물어보세요. 확대 버튼을 누르면 전체 채팅이 열려요." : "Ask Moneo AI right from Home. The expand button opens the full chat, where your conversations are saved.",
    },
    {
      target: "nav-market",
      title: ko ? "금융시장 인사이트" : "Market insights",
      body: ko ? "비트코인, 금 등의 시세와 추세, 쉬운 지표를 확인해요." : "Bitcoin, gold and more, with trends and simple indicators.",
    },
    {
      target: "bell",
      title: ko ? "예산 알림" : "Budget alerts",
      body: ko ? "예산을 넘거나 한도에 가까워지면 여기에 표시돼요." : "Budgets that are over or close to their limit show up here.",
    },
    {
      target: "user-menu",
      title: ko ? "언어와 설정" : "Language and settings",
      body: ko ? "English와 한국어를 바꾸거나, 설정에서 이 안내를 다시 볼 수 있어요." : "Switch between English and 한국어, or replay this tour from Settings.",
    },
    {
      title: ko ? "준비 완료!" : "You're all set",
      body: ko ? "예산을 하나 만들고 첫 영수증을 스캔해 보세요." : "Create a budget, then scan your first receipt.",
      finish: true,
    },
  ];
}

function findVisible(target) {
  if (!target) return null;
  const els = document.querySelectorAll(`[data-tour="${target}"]`);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none") return el;
  }
  return null;
}

const PAD = 8;       // space around the highlighted element
const CARD_W = 340;
const GAP = 14;      // space between highlight and card

function placeCard(rect, cardH) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(CARD_W, vw - 24);
  if (!rect) return { left: (vw - w) / 2, top: Math.max(16, (vh - cardH) / 2), width: w, side: "center" };
  const spaces = {
    right: vw - rect.right - GAP,
    bottom: vh - rect.bottom - GAP,
    top: rect.top - GAP,
    left: rect.left - GAP,
  };
  let side = "bottom";
  if (spaces.right >= w + 12 && rect.height < vh * 0.6) side = "right";
  else if (spaces.bottom >= cardH + 12) side = "bottom";
  else if (spaces.top >= cardH + 12) side = "top";
  else if (spaces.left >= w + 12) side = "left";
  let left, top;
  if (side === "right") { left = rect.right + GAP; top = rect.top + rect.height / 2 - cardH / 2; }
  if (side === "left") { left = rect.left - GAP - w; top = rect.top + rect.height / 2 - cardH / 2; }
  if (side === "bottom") { left = rect.left + rect.width / 2 - w / 2; top = rect.bottom + GAP; }
  if (side === "top") { left = rect.left + rect.width / 2 - w / 2; top = rect.top - GAP - cardH; }
  left = Math.max(12, Math.min(left, vw - w - 12));
  top = Math.max(12, Math.min(top, vh - cardH - 12));
  return { left, top, width: w, side };
}

export default function CoachTour() {
  const { user, lang } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [ready, setReady] = useState(false);
  const [cardH, setCardH] = useState(180);
  const cardRef = useRef(null);
  const targetRef = useRef(null);

  const steps = buildSteps(lang, user?.name);
  const step = steps[index];
  const ko = lang === "ko";

  // First visit for this account → start automatically (after the page settles).
  useEffect(() => {
    if (!user?.id) return;
    let done = false;
    try { done = localStorage.getItem(doneKey(user.id)) === "1"; } catch { /* private mode */ }
    if (done) return;
    const t = setTimeout(() => { setIndex(0); setOpen(true); }, 900);
    return () => clearTimeout(t);
  }, [user?.id]);

  useEffect(() => {
    const start = () => { setIndex(0); setOpen(true); };
    window.addEventListener(START_TOUR_EVENT, start);
    return () => window.removeEventListener(START_TOUR_EVENT, start);
  }, []);

  const finish = useCallback((goTo) => {
    setOpen(false);
    setRect(null);
    try { if (user?.id) localStorage.setItem(doneKey(user.id), "1"); } catch { /* ignore */ }
    if (goTo) navigate(goTo);
  }, [user?.id, navigate]);

  const measure = useCallback(() => {
    const el = targetRef.current;
    if (!el || !el.isConnected) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2, right: r.right + PAD, bottom: r.bottom + PAD });
  }, []);

  // Go to the step's page (if any), wait for its element, then spotlight it.
  useEffect(() => {
    if (!open || !step) return;
    let cancelled = false;
    setReady(false);
    targetRef.current = null;
    if (step.route && location.pathname !== step.route) navigate(step.route);

    const started = Date.now();
    const look = () => {
      if (cancelled) return;
      const onRightPage = !step.route || window.location.hash.includes(step.route) || window.location.pathname === step.route;
      const el = onRightPage ? findVisible(step.target) : null;
      if (el || !step.target || Date.now() - started > 2500) {
        targetRef.current = el;
        if (el) el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        requestAnimationFrame(() => { if (!cancelled) { measure(); setReady(true); } });
        return;
      }
      setTimeout(look, 100);
    };
    look();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  // Keep the spotlight on the element when the window resizes or scrolls.
  useEffect(() => {
    if (!open) return;
    const onMove = () => requestAnimationFrame(measure);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => { window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove, true); };
  }, [open, measure]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [index, ready, lang, rect]);

  useEffect(() => { if (open && ready) cardRef.current?.focus(); }, [open, ready, index]);

  const next = useCallback(() => {
    if (index >= steps.length - 1) finish("/app/budgets");
    else setIndex((i) => i + 1);
  }, [index, steps.length, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, next, back, finish]);

  if (!open || !step) return null;
  const pos = placeCard(rect, cardH);
  const isLast = index === steps.length - 1;

  return (
    <div className="ct-root" aria-live="polite">
      {/* blocks clicks on the page while the tour is open */}
      <div className="ct-catcher" onClick={(e) => e.stopPropagation()} />
      {rect ? (
        <div className="ct-spot" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, opacity: ready ? 1 : 0 }} />
      ) : (
        <div className="ct-dim" />
      )}
      <div
        ref={cardRef}
        className={"ct-card ct-" + pos.side}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ct-title"
        aria-describedby="ct-body"
        tabIndex={-1}
        style={{ left: pos.left, top: pos.top, width: pos.width, opacity: ready ? 1 : 0 }}
      >
        <button type="button" className="ct-close" onClick={() => finish()} aria-label={ko ? "안내 닫기" : "Close tour"}><X size={16} /></button>
        <div className="ct-progress" aria-label={ko ? `${steps.length}단계 중 ${index + 1}단계` : `Step ${index + 1} of ${steps.length}`}>
          {steps.map((_, i) => <span key={i} className={i === index ? "on" : i < index ? "done" : ""} />)}
        </div>
        <h2 id="ct-title">{step.title}</h2>
        <p id="ct-body">{step.body}</p>
        <div className="ct-actions">
          {index === 0 ? (
            <button type="button" className="ct-skip" onClick={() => finish()}>{ko ? "건너뛰기" : "Skip tour"}</button>
          ) : (
            <button type="button" className="ct-back" onClick={back}>{ko ? "이전" : "Back"}</button>
          )}
          <span className="ct-count">{index + 1} / {steps.length}</span>
          <button type="button" className="ct-next" onClick={next}>
            {index === 0 ? (ko ? "둘러보기" : "Show me") : isLast ? (ko ? "예산 만들기" : "Create a budget") : (ko ? "다음" : "Next")}
          </button>
        </div>
      </div>
    </div>
  );
}
