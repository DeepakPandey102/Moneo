import express from "express";
import { getChatReply, summarizeForMemory, generateThreadTitle } from "../services/generalChatEngine.js";

const router = express.Router();

function friendlyError(err) {
  const msg = String(err?.message || "");
  if (err.code === "GEMINI_NOT_CONFIGURED") {
    return { status: 503, body: { error: "gemini_not_configured", message: "AI isn't set up yet. Add GEMINI_API_KEY in backend/.env and restart the server." } };
  }
  if (err.code === "GEMINI_EMPTY_RESPONSE") {
    return { status: 502, body: { error: "empty_response", message: "The AI didn't return a usable answer. Please try again." } };
  }
  if (/RESOURCE_EXHAUSTED|"code":\s*429|quota/i.test(msg)) {
    return { status: 429, body: { error: "quota_exceeded", message: "The AI usage limit for this API key has been reached." } };
  }
  if (err.code === "IMAGE_EMPTY") {
    return { status: 422, body: { error: "image_blocked", message: "The image couldn't be created for this request. Try describing it differently." } };
  }
  if (/image/i.test(msg) && /(not found|not supported|404|permission|403|billing)/i.test(msg)) {
    return { status: 503, body: { error: "image_unavailable", message: "Image generation isn't available with this API key." } };
  }
  return { status: 502, body: { error: "gemini_request_failed", message: "Couldn't reach the AI service. Check your internet connection and try again." } };
}

// POST /api/chat/reply
// body: { message, recentMessages: [{role, content}], memorySummary, language,
//         financialContext?, mode? ("auto" | "image" | "text"), referenceImage? (data URL) }
// → { reply, image? }  image = { mimeType, data (base64) }
router.post("/reply", async (req, res) => {
  const { message, recentMessages, memorySummary, language, financialContext, mode, referenceImage } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "invalid_request", message: "A 'message' string is required." });
  }
  try {
    const result = await getChatReply({
      message,
      recentMessages: Array.isArray(recentMessages) ? recentMessages.slice(-20) : [],
      memorySummary: memorySummary || "",
      language: language === "ko" ? "ko" : "en",
      financialContext: financialContext && typeof financialContext === "object" ? financialContext : null,
      mode: ["image", "text"].includes(mode) ? mode : "auto",
      referenceImage: typeof referenceImage === "string" && referenceImage.length < 6_000_000 ? referenceImage : null,
    });
    res.json(result);
  } catch (err) {
    console.error("[chat/reply] error:", err.message);
    const { status, body } = friendlyError(err);
    res.status(status).json(body);
  }
});

// POST /api/chat/summarize
// body: { messagesToSummarize: [{role, content}], previousSummary, language }
// Called by the frontend once a thread gets long, to fold older messages
// into a compact memory summary instead of resending the full history
// forever. This keeps "Ask Anything" remembering context cheaply.
router.post("/summarize", async (req, res) => {
  const { messagesToSummarize, previousSummary, language } = req.body || {};
  if (!Array.isArray(messagesToSummarize) || messagesToSummarize.length === 0) {
    return res.status(400).json({ error: "invalid_request", message: "'messagesToSummarize' must be a non-empty array." });
  }
  try {
    const summary = await summarizeForMemory({
      messagesToSummarize,
      previousSummary: previousSummary || "",
      language: language === "ko" ? "ko" : "en",
    });
    res.json({ summary });
  } catch (err) {
    console.error("[chat/summarize] error:", err.message);
    const { status, body } = friendlyError(err);
    res.status(status).json(body);
  }
});

// POST /api/chat/title
// body: { firstMessage, language }
router.post("/title", async (req, res) => {
  const { firstMessage, language } = req.body || {};
  if (!firstMessage || typeof firstMessage !== "string") {
    return res.status(400).json({ error: "invalid_request", message: "A 'firstMessage' string is required." });
  }
  try {
    const title = await generateThreadTitle({ firstMessage, language: language === "ko" ? "ko" : "en" });
    res.json({ title: title || "New Chat" });
  } catch (err) {
    console.error("[chat/title] error:", err.message);
    // Titling failure shouldn't block the chat — just fall back quietly.
    res.json({ title: "New Chat" });
  }
});

export default router;
