import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Coins, Mail, Lock } from "lucide-react";
import { useApp } from "../context/AppContext";

export default function Login() {
  const { login, t, lang } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (!result.ok) { setError(t(result.error)); return; }
    navigate("/app/dashboard");
  }

  return (
    <div className="auth-screen">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="auth-card">
        <div className="auth-brand">
          <Coins size={28} color="#16A34A" />
          <span>Moneo 2.0</span>
        </div>
        <p className="auth-tagline">{t("tagline")}</p>

        <h1 className="auth-title">{t("welcomeBack")}</h1>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <Mail size={16} className="input-icon" />
            <input type="email" placeholder={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="input-group">
            <Lock size={16} className="input-icon" />
            <input type="password" placeholder={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn-primary btn-block" disabled={submitting}>
            {submitting ? (lang === "ko" ? "로그인 중..." : "Logging in...") : t("login")}
          </button>
        </form>

        <p className="auth-switch">
          {t("dontHaveAccount")} <Link to="/register">{t("createAccount")}</Link>
        </p>
      </motion.div>
    </div>
  );
}
