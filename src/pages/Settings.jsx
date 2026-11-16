import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Globe, Bot, User, RotateCcw, Trash2, Info, Trophy, Wand2, RefreshCw, Server, LogOut, Compass, Palette, Check } from "lucide-react";
import { SKINS, getSkin, setSkin } from "../utils/theme";
import { START_TOUR_EVENT } from "../components/CoachTour";
import { useApp } from "../context/AppContext";
import AchievementCard, { ACHIEVEMENT_DEFS } from "../components/AchievementCard";
import { getBackendStatus } from "../services/assistantService";

function StatusDot({ up }) {
  return <span className={"status-dot " + (up ? "status-up" : "status-down")} />;
}

export default function Settings() {
  const { user, data, lang, setLanguage, assistantMode, setAssistantMode, clearData, showToast, logout, t } = useApp();
  const [confirmAction, setConfirmAction] = useState(null); // null | "sample" | "clear" | "logout"
  const [status, setStatus] = useState({ backendUp: null, geminiConfigured: null });
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    const result = await getBackendStatus();
    setStatus(result);
    setChecking(false);
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const [working, setWorking] = useState(false);
  const [skin, setSkinState] = useState(getSkin);
  function pickSkin(id, e) {
    if (id === skin) return;
    setSkinState(id);
    setSkin(id, e && e.clientX ? { x: e.clientX, y: e.clientY } : null);
    const s = SKINS.find((k) => k.id === id);
    showToast(lang === "ko" ? `테마: ${s.ko}` : `Theme: ${s.en}`);
  }

  // Waits for the save to actually finish before saying it worked (before,
  // "Sample month generated" showed instantly, even if it then failed).
  async function handleConfirm() {
    if (confirmAction === "clear") {
      setWorking(true);
      const ok = await clearData();
      setWorking(false);
      if (ok) showToast(lang === "ko" ? "모든 데이터가 삭제됐어요." : "All data cleared.");
    } else if (confirmAction === "logout") {
      logout();
      return; // component is about to unmount — nothing left to reset
    }
    setConfirmAction(null);
  }

  const unlockedKeys = new Set(data.achievements.map((a) => a.key));

  return (
    <div className="page">
      <div className="page-header"><h1>{t("settings")}</h1></div>

      <div className="card">
        <div className="card-title-row"><span className="card-title"><Palette size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{lang === "ko" ? "테마" : "Theme"}</span></div>
        <p className="arch-note" style={{ marginBottom: 14 }}>
          {lang === "ko" ? "앱 전체의 디자인을 골라보세요. 이 기기에 저장돼요." : "Choose how the whole app looks. Saved on this device."}
        </p>
        <div className="skin-grid" role="group" aria-label={lang === "ko" ? "테마 선택" : "Choose a theme"}>
          {SKINS.map((s) => (
            <button key={s.id} type="button" className="skin-card" aria-pressed={skin === s.id} onClick={(e) => pickSkin(s.id, e)}>
              <span className="skin-preview" style={{ background: s.colors[0] }} aria-hidden="true">
                <span className="sp-side" style={{ background: s.dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }}>
                  <i style={{ background: `linear-gradient(90deg, ${s.colors[1]}, ${s.colors[2]})` }} />
                  <i style={{ background: s.dark ? "#FFFFFF" : "#16161A" }} />
                  <i style={{ background: s.dark ? "#FFFFFF" : "#16161A" }} />
                  <i style={{ background: s.dark ? "#FFFFFF" : "#16161A" }} />
                </span>
                <span className="sp-main">
                  <b style={{ background: s.dark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.75)" }} />
                  <span className="sp-row">
                    <span style={{ background: s.dark ? "rgba(255,255,255,0.08)" : "#FFFFFF", border: s.dark ? "none" : "1px solid rgba(0,0,0,0.08)" }} />
                    <span style={{ background: `linear-gradient(160deg, ${s.colors[1]}, ${s.colors[2]})` }} />
                  </span>
                </span>
              </span>
              <span className="skin-name"><b>{lang === "ko" ? s.ko : s.en}</b><small>{lang === "ko" ? s.noteKo : s.noteEn}</small></span>
              <span className="skin-check" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title-row"><span className="card-title"><User size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{t("profile")}</span></div>
        <div className="settings-row">
          <span>{t("fullName")}</span><span className="settings-value">{user?.name}</span>
        </div>
        <div className="settings-row">
          <span>{t("email")}</span><span className="settings-value">{user?.email}</span>
        </div>
        {confirmAction === "logout" ? (
          <div className="logout-confirm-row">
            <span>{lang === "ko" ? "로그아웃 하시겠어요?" : "Log out of Moneo?"}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-danger" onClick={handleConfirm}>{t("confirm")}</button>
              <button className="btn-secondary" onClick={() => setConfirmAction(null)}>{t("cancel")}</button>
            </div>
          </div>
        ) : (
          <button className="btn-danger-outline btn-block settings-logout-btn" onClick={() => setConfirmAction("logout")}>
            <LogOut size={15} /> {t("logout")}
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-title-row"><span className="card-title"><Globe size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{t("language")}</span></div>
        <div className="lang-toggle">
          <button className={lang === "en" ? "active" : ""} onClick={() => setLanguage("en")}>English</button>
          <button className={lang === "ko" ? "active" : ""} onClick={() => setLanguage("ko")}>한국어</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title-row">
          <span className="card-title"><Bot size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{lang === "ko" ? "AI 서비스" : "AI service"}</span>
          <button className="icon-btn-ghost" onClick={checkStatus} title={lang === "ko" ? "상태 새로고침" : "Refresh status"} aria-label={lang === "ko" ? "상태 새로고침" : "Refresh status"}><RefreshCw size={14} className={checking ? "spin" : ""} /></button>
        </div>
        <div className="status-grid">
          <div className="status-row">
            <span><Server size={14} style={{ marginRight: 6, verticalAlign: -2 }} />{lang === "ko" ? "서버" : "Server"}</span>
            <span className="status-value">
              <StatusDot up={status.backendUp} />
              {status.backendUp === null ? (lang === "ko" ? "확인 중..." : "Checking...") : status.backendUp ? (lang === "ko" ? "연결됨" : "Connected") : (lang === "ko" ? "연결 안 됨" : "Unavailable")}
            </span>
          </div>
          <div className="status-row">
            <span><Bot size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Moneo AI</span>
            <span className="status-value">
              <StatusDot up={status.geminiConfigured} />
              {status.geminiConfigured === null ? (lang === "ko" ? "확인 중..." : "Checking...") : status.geminiConfigured ? (lang === "ko" ? "사용 가능" : "Available") : (lang === "ko" ? "사용 불가" : "Unavailable")}
            </span>
          </div>
        </div>
        {status.backendUp === false && (
          <div className="hint-box">
            {lang === "ko"
              ? "AI 서버가 깨어나는 중이거나 잠시 연결할 수 없어요. 1분 후 새로고침 버튼을 눌러주세요."
              : "The AI server may be waking up or briefly unavailable. Press refresh in a minute."}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title-row"><span className="card-title"><Trophy size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{t("achievements")}</span></div>
        <div className="achievements-grid">
          {Object.keys(ACHIEVEMENT_DEFS).map((key) => (
            <AchievementCard key={key} achievementKey={key} unlocked={unlockedKeys.has(key)} lang={lang} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title-row"><span className="card-title"><Compass size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{lang === "ko" ? "앱 둘러보기" : "App tour"}</span></div>
        <p className="arch-note" style={{ marginBottom: 12 }}>
          {lang === "ko" ? "주요 기능을 하나씩 짚어주는 안내를 다시 볼 수 있어요." : "See the step-by-step guide to the main features again."}
        </p>
        <button className="btn-secondary" onClick={() => window.dispatchEvent(new Event(START_TOUR_EVENT))}>
          <Compass size={15} style={{ marginRight: 6 }} />{lang === "ko" ? "안내 다시 보기" : "Replay tour"}
        </button>
      </div>

      <div className="card">
        <div className="card-title-row"><span className="card-title">{t("aboutMoneo")}</span></div>
        <p className="arch-note">{t("aboutText")}</p>
        <p className="disclaimer">{t("disclaimer")}</p>
      </div>

      <div className="card">
        <div className="card-title-row"><span className="card-title"><Trash2 size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{lang === "ko" ? "데이터" : "Your data"}</span></div>
        <p className="arch-note" style={{ marginBottom: 12 }}>
          {lang === "ko"
            ? "모든 거래, 예산, 목표, 메모를 삭제하고 처음 상태로 되돌려요. 되돌릴 수 없어요."
            : "Delete all your transactions, budgets, goals and notes and start fresh. This can't be undone."}
        </p>
        {confirmAction !== "clear" ? (
          <button className="btn-danger-outline" onClick={() => setConfirmAction("clear")}>
            <Trash2 size={15} /> {t("clearAllData")}
          </button>
        ) : (
          <div>
            <p style={{ fontSize: 13, marginBottom: 10 }}>{t("clearConfirm")}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-danger" onClick={handleConfirm} disabled={working}>{working ? "..." : t("confirm")}</button>
              <button className="btn-secondary" onClick={() => setConfirmAction(null)} disabled={working}>{t("cancel")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
