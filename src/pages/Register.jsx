import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Mail, Lock, User, MailCheck } from "lucide-react";
import { useApp } from "../context/AppContext";

export default function Register() {
  const { register, t, lang } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await register(name, email, password, confirmPassword);
    setSubmitting(false);

    if (!result.ok) { setError(t(result.error)); return; }

    if (result.needsConfirmation) {
      // Supabase requires the user to click a link in their email before
      // they can log in — there's no session yet, so we can't navigate
      // into the app. Show a clear "check your email" screen instead.
      setConfirmationSent(true);
    } else {
      // Auto-confirm was enabled on this Supabase project — session
      // already exists, go straight in.
      navigate("/app/dashboard?welcome=1");
    }
  }

  if (confirmationSent) {
    return (
      <div className="auth-screen">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="auth-card" style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#EAF7EE", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MailCheck size={30} color="#16A34A" />
            </div>
          </div>
          <h1 className="auth-title" style={{ textAlign: "center" }}>
            {lang === "ko" ? "이메일을 확인해주세요" : "Check your email"}
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            {lang === "ko"
              ? `${email} 주소로 인증 메일을 보냈어요. 메일함에서 링크를 클릭하면 로그인할 수 있어요.`
              : `We sent a confirmation link to ${email}. Click the link in that email, then come back here to log in.`}
          </p>
          <Link to="/login" className="btn-primary btn-block" style={{ display: "inline-flex", justifyContent: "center" }}>
            {t("login")}
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="auth-card">
        <div className="auth-brand">
          <Coins size={28} color="#16A34A" />
          <span>Moneo 2.0</span>
        </div>
        <p className="auth-tagline">{t("tagline")}</p>

        <h1 className="auth-title">{t("createAccount")}</h1>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <User size={16} className="input-icon" />
            <input type="text" placeholder={t("fullName")} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="input-group">
            <Mail size={16} className="input-icon" />
            <input type="email" placeholder={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="input-group">
            <Lock size={16} className="input-icon" />
            <input type="password" placeholder={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <p className="input-hint">{t("passwordHint")}</p>
          <div className="input-group">
            <Lock size={16} className="input-icon" />
            <input type="password" placeholder={t("confirmPassword")} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary btn-block" disabled={submitting}>
            {submitting ? (lang === "ko" ? "처리 중..." : "Creating account...") : t("register")}
          </button>
        </form>

        <p className="auth-switch">
          {t("alreadyHaveAccount")} <Link to="/login">{t("login")}</Link>
        </p>
      </motion.div>
    </div>
  );
}
