import React, { useState, useEffect, useMemo, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell, ChevronUp, LogOut, Languages, MoreHorizontal, AlertTriangle, CheckCircle2, Settings as SettingsGear,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { budgetStatus } from "../utils/calculations";
import { warmUpBackend } from "../services/assistantService";
import { categoryLabel } from "../data/categories";
import Logo from "./Logo";
import Toast from "./Toast";
import CoachTour from "./CoachTour";
import {
  HomeIcon, BudgetsIcon, TransactionsIcon, GoalsIcon, AnalyticsIcon, NotesIcon,
  AssistantIcon, SettingsIcon, MarketIcon, SparkleIcon,
} from "./icons/FilledIcons";

// Purple mountain scene behind the page header.
function Sky() {
  return (
    <div className="mo-sky" aria-hidden="true">
      <svg viewBox="0 0 1440 320" preserveAspectRatio="xMidYMin slice" width="100%" height="100%">
        <defs>
          <linearGradient id="skyBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2A1F5C" />
            <stop offset="0.55" stopColor="#17123A" />
            <stop offset="1" stopColor="#0B0A19" />
          </linearGradient>
          <linearGradient id="mFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4B3A8F" />
            <stop offset="1" stopColor="#1C1640" />
          </linearGradient>
          <linearGradient id="mNear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2E2466" />
            <stop offset="1" stopColor="#0E0C22" />
          </linearGradient>
          <radialGradient id="glow" cx="0.72" cy="0.1" r="0.45">
            <stop offset="0" stopColor="#8B6CFF" stopOpacity="0.55" />
            <stop offset="1" stopColor="#8B6CFF" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.55" stopColor="#0B0A19" stopOpacity="0" />
            <stop offset="1" stopColor="#0B0A19" stopOpacity="1" />
          </linearGradient>
        </defs>
        <rect width="1440" height="320" fill="url(#skyBg)" />
        <rect width="1440" height="320" fill="url(#glow)" />
        <path d="M0 210 L180 150 L300 185 L470 110 L600 165 L760 70 L900 140 L1030 60 L1180 130 L1300 95 L1440 150 V320 H0Z" fill="url(#mFar)" opacity="0.85" />
        <path d="M0 250 L140 205 L260 235 L420 170 L560 230 L700 160 L860 225 L1000 150 L1150 215 L1290 175 L1440 220 V320 H0Z" fill="url(#mNear)" />
        <rect width="1440" height="320" fill="url(#fade)" />
      </svg>
    </div>
  );
}

export default function Layout() {
  const { user, data, lang, t, logout, setLanguage } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const L = (en, ko) => (lang === "ko" ? ko : en);

  // Notifications = budgets over or close to their limit this month.
  const alerts = useMemo(() => {
    if (!data) return [];
    return budgetStatus(data.budgets, data.transactions)
      .filter((b) => b.status !== "ok")
      .sort((a, b) => b.pct - a.pct);
  }, [data]);

  // Budget first: setting limits is the first thing a new user should do.
  // Receipts live inside Transactions; Ask Anything opens from the Home panel.
  const NAV = [
    { to: "/app/dashboard", label: L("Home", "홈"), icon: HomeIcon, tour: "nav-home" },
    { to: "/app/budgets", label: t("budgets"), icon: BudgetsIcon, tour: "nav-budgets", badge: data?.budgets?.length || 0 },
    { to: "/app/transactions", label: t("transactions"), icon: TransactionsIcon, tour: "nav-transactions" },
    { to: "/app/goals", label: t("goals"), icon: GoalsIcon, tour: "nav-goals" },
    { to: "/app/analytics", label: t("analytics"), icon: AnalyticsIcon, tour: "nav-analytics" },
    { to: "/app/notes", label: t("notes"), icon: NotesIcon, tour: "nav-notes" },
    { to: "/app/assistant", label: L("Assistant", "어시스턴트"), icon: AssistantIcon, tour: "nav-assistant" },
    { to: "/app/market", label: L("Market", "시장"), icon: MarketIcon, tour: "nav-market" },
    { to: "/app/settings", label: t("settings"), icon: SettingsIcon, tour: "nav-settings" },
  ];
  const MOBILE_PRIMARY = ["/app/dashboard", "/app/budgets", "/app/transactions", "/app/assistant"];
  const moreItems = [
    ...NAV.filter((n) => !MOBILE_PRIMARY.includes(n.to)),
    { to: "/app/ask", label: t("askAnything"), icon: SparkleIcon, tour: "nav-ask" },
  ];

  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const bellRef = useRef(null);
  const userRef = useRef(null);
  const mobileUserRef = useRef(null);

  useEffect(() => { setMoreOpen(false); setBellOpen(false); setUserOpen(false); }, [location.pathname, location.search]);
  useEffect(() => { warmUpBackend(); }, []);

  useEffect(() => {
    function onDown(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
      const inUser = (userRef.current && userRef.current.contains(e.target)) || (mobileUserRef.current && mobileUserRef.current.contains(e.target));
      if (!inUser) setUserOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const isActive = (item) => location.pathname.startsWith(item.to);
  const initial = user?.name?.[0]?.toUpperCase() || "U";
  const Avatar = ({ size = 40 }) => user?.avatarUrl
    ? <img className="mo-avatar" src={user.avatarUrl} alt="" width={size} height={size} referrerPolicy="no-referrer" />
    : <span className="mo-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>{initial}</span>;

  const UserMenu = ({ up }) => (
    <motion.div className={"mo-pop " + (up ? "mo-pop-up" : "mo-pop-right")} initial={{ opacity: 0, y: up ? 6 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: up ? 6 : -6 }}>
      <div className="mo-pop-user">
        <Avatar size={40} />
        <span><b>{user?.name}</b><small>{user?.email}</small></span>
      </div>
      <button type="button" className="mo-pop-item" onClick={() => navigate("/app/settings")}><SettingsGear size={16} /> {t("settings")}</button>
      <button type="button" className="mo-pop-item" onClick={() => setLanguage(lang === "ko" ? "en" : "ko")}><Languages size={16} /> {lang === "ko" ? "English" : "한국어"}</button>
      <button type="button" className="mo-pop-item danger" onClick={logout}><LogOut size={16} /> {t("logout")}</button>
    </motion.div>
  );

  const isChat = location.pathname.startsWith("/app/ask");

  return (
    <div className="mo-shell">
      <aside className="mo-sidebar">
        <div className="mo-sidebar-brand"><Logo size={30} textSize={24} /></div>
        <nav className="mo-sidebar-nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} data-tour={item.tour} className={() => "mo-side-link" + (isActive(item) ? " active" : "")}>
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.badge > 0 && <em className="mo-side-badge">{item.badge}</em>}
            </NavLink>
          ))}
        </nav>
        <div className="mo-sidebar-wave" aria-hidden="true">
          <svg viewBox="0 0 248 120" preserveAspectRatio="none" width="100%" height="100%">
            <path d="M0 70 C60 30 110 95 170 60 C205 40 230 45 248 50 V120 H0Z" fill="#2A1F5C" opacity="0.55" />
            <path d="M0 95 C50 70 120 110 180 85 C215 72 235 78 248 82 V120 H0Z" fill="#3B2C80" opacity="0.5" />
          </svg>
        </div>
        <div className="mo-pop-wrap mo-profile-wrap" ref={userRef}>
          <AnimatePresence>{userOpen && <UserMenu up />}</AnimatePresence>
          <button type="button" className="mo-profile" data-tour="user-menu" onClick={() => setUserOpen((v) => !v)} aria-expanded={userOpen}>
            <Avatar size={40} />
            <span className="mo-profile-text">
              <b>{user?.name}</b>
              <small><i className="mo-online-dot" /> {L("Online", "온라인")}</small>
            </span>
            <ChevronUp size={16} className={"mo-profile-chev" + (userOpen ? " open" : "")} />
          </button>
        </div>
      </aside>

      <div className="mo-main">
        {!isChat && <Sky />}
        <header className={"mo-topbar" + (isChat ? " solid" : "")}>
          <div className="mo-topbar-logo"><Logo size={24} textSize={20} /></div>
          <div className="mo-topbar-right">
            <div className="mo-pop-wrap" ref={bellRef}>
              <button type="button" className="mo-round-btn" data-tour="bell" onClick={() => setBellOpen((v) => !v)} aria-label={L("Notifications", "알림")} aria-expanded={bellOpen}>
                <Bell size={19} />
                {alerts.length > 0 && <span className="mo-bell-dot" />}
              </button>
              <AnimatePresence>
                {bellOpen && (
                  <motion.div className="mo-pop mo-pop-right" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                    <div className="mo-pop-title">{L("Notifications", "알림")}</div>
                    {alerts.length === 0 ? (
                      <div className="mo-pop-empty"><CheckCircle2 size={16} /> {L("All budgets are on track.", "모든 예산이 잘 지켜지고 있어요.")}</div>
                    ) : alerts.map((b) => (
                      <button key={b.id} type="button" className="mo-pop-item" onClick={() => navigate("/app/budgets")}>
                        <AlertTriangle size={16} className={b.status === "over" ? "red" : "amber"} />
                        <span>
                          <b>{categoryLabel(b.category, lang)} · {b.pct}%</b>
                          <small>{b.status === "over" ? L("Over budget this month", "이번 달 예산 초과") : L("Close to the limit", "한도에 가까워요")}</small>
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button type="button" className="mo-round-btn mo-lang-btn" onClick={() => setLanguage(lang === "ko" ? "en" : "ko")} aria-label={L("Switch to Korean", "영어로 바꾸기")} title={lang === "ko" ? "English" : "한국어"}>
              <Languages size={18} /><span>{lang === "ko" ? "KO" : "EN"}</span>
            </button>
            <div className="mo-pop-wrap mo-mobile-user" ref={mobileUserRef}>
              <button type="button" className="mo-round-btn mo-avatar-btn" onClick={() => setUserOpen((v) => !v)} aria-expanded={userOpen} aria-label={L("Account", "계정")}>
                <Avatar size={34} />
              </button>
              <AnimatePresence>{userOpen && <UserMenu />}</AnimatePresence>
            </div>
          </div>
        </header>

        <main className={"mo-content" + (isChat ? " mo-content-flush" : "")}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom nav + "More" sheet */}
      <nav className="bottom-nav">
        {MOBILE_PRIMARY.map((to) => NAV.find((n) => n.to === to)).map((item) => (
          <NavLink key={item.to} to={item.to} data-tour={item.tour} className={() => "bottom-nav-link" + (isActive(item) ? " active" : "")}>
            <item.icon size={21} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button type="button" className={"bottom-nav-link bottom-nav-more" + (moreOpen ? " active" : "")} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
          <MoreHorizontal size={21} />
          <span>{L("More", "더보기")}</span>
        </button>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <motion.div className="more-sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMoreOpen(false)}>
            <motion.div className="more-sheet" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.2 }} onClick={(e) => e.stopPropagation()}>
              {moreItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={() => "more-sheet-link" + (isActive(item) ? " active" : "")}>
                  <item.icon size={19} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
              <button type="button" className="more-sheet-link more-sheet-logout" onClick={logout}>
                <LogOut size={18} />
                <span>{t("logout")}</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toast />
      <CoachTour />
    </div>
  );
}
