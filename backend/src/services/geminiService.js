// The ONLY file in this backend that talks to Google's SDK directly.
// Every route goes through the functions here, never the SDK itself —
// that keeps the model name and API key in exactly one place, per the
// project's "do not scatter model names / never expose the key" rules.

import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// The literal placeholder text shipped in .env.example. This is NOT a key
// of any kind — it's just example text so we can tell "nothing filled in
// yet" apart from "a real key is set." Never compare against any other
// specific string here.
const UNSET_PLACEHOLDER = "your_gemini_api_key_here";

function hasRealKey() {
  return Boolean(API_KEY && API_KEY.trim() && API_KEY !== UNSET_PLACEHOLDER);
}

let client = null;
function getClient() {
  if (!hasRealKey()) {
    return null; // caller must handle this — never throws here
  }
  if (!client) client = new GoogleGenAI({ apiKey: API_KEY });
  return client;
}

export function isConfigured() {
  return hasRealKey();
}

export function currentModel() {
  return MODEL;
}

/**
 * Plain text-in, text-out call with an optional system instruction.
 * Used for chat and proactive insight.
 *
 * Pass `useSearch: true` to ground the reply in live Google Search
 * results — this is what lets the model know the current date, recent
 * news, prices, or anything else that changes after its training
 * cutoff. When grounding is used, the resolved source URLs (if any)
 * come back in `sources` alongside the text.
 */
export async function generateText({ systemInstruction, prompt, maxOutputTokens = 500, useSearch = false, thinkingBudget = 0 }) {
  const genai = getClient();
  if (!genai) {
    const err = new Error("GEMINI_NOT_CONFIGURED");
    err.code = "GEMINI_NOT_CONFIGURED";
    throw err;
  }

  // Thinking and Google Search grounding can't both eat into the same
  // token/latency budget comfortably — when search is on we still turn
  // "thinking" off (see comment below) but allow the call a little more
  // headroom since grounded answers tend to cite sources and run longer.
  // thinkingBudget: 0 = answer directly (fast, used for short tasks like
  // titles and insights). A positive budget lets the model reason first,
  // which makes harder questions (maths, multi-step, comparisons) much more
  // accurate. Thinking tokens count against maxOutputTokens, so callers
  // that think must also allow a larger maxOutputTokens.
  const config = {
    systemInstruction,
    maxOutputTokens,
    thinkingConfig: { thinkingBudget },
    ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
  };
  let response;
  try {
    response = await genai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts: [{ text: prompt }] }], config });
  } catch (err) {
    // Older models (e.g. gemini-2.0-*) reject thinkingConfig: retry without it.
    if (!/thinking/i.test(err?.message || "")) throw err;
    const { thinkingConfig, ...rest } = config; // eslint-disable-line no-unused-vars
    response = await genai.models.generateContent({ model: MODEL, contents: [{ role: "user", parts: [{ text: prompt }] }], config: rest });
  }

  const text = response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    const err = new Error("GEMINI_EMPTY_RESPONSE");
    err.code = "GEMINI_EMPTY_RESPONSE";
    throw err;
  }

  if (!useSearch) return text.trim();

  // Pull out the grounding sources Gemini actually used, if any, so the
  // frontend can show "Sources" links under the reply.
  const groundingChunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources = groundingChunks
    .map((c) => c?.web && { title: c.web.title, uri: c.web.uri })
    .filter(Boolean);

  return { text: text.trim(), sources };
}

/**
 * Image-in, text-out call for receipt analysis.
 * imageBase64 must NOT include the "data:image/...;base64," prefix.
 */
export async function generateFromImage({ systemInstruction, imageBase64, mimeType, prompt, maxOutputTokens = 800, json = false }) {
  const genai = getClient();
  if (!genai) {
    const err = new Error("GEMINI_NOT_CONFIGURED");
    err.code = "GEMINI_NOT_CONFIGURED";
    throw err;
  }

  const response = await genai.models.generateContent({
    model: MODEL,
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data: imageBase64 } },
        { text: prompt },
      ],
    }],
    config: {
      systemInstruction,
      maxOutputTokens,
      // Same fix as generateText() — see comment there. Receipt JSON
      // extraction doesn't need extended reasoning either.
      thinkingConfig: { thinkingBudget: 0 },
      // Ask Gemini for strict JSON output so parsing doesn't depend on the
      // model remembering "no markdown fences".
      ...(json ? { responseMimeType: "application/json" } : {}),
    },
  });

  const text = response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    const err = new Error("GEMINI_EMPTY_RESPONSE");
    err.code = "GEMINI_EMPTY_RESPONSE";
    throw err;
  }
  return text.trim();
}


// ---------- Image generation ----------
// Uses Gemini's image model ("Nano Banana"). Set GEMINI_IMAGE_MODEL to
// change it. Needs an API key with image generation enabled (paid tier).
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

export function currentImageModel() {
  return IMAGE_MODEL;
}

/**
 * Text (+ optional reference image to edit) → image.
 * referenceImage: { mimeType, data } with base64 data, no "data:" prefix.
 * Returns { image: { mimeType, data }, text }.
 */
export async function generateImage({ prompt, referenceImage = null }) {
  const genai = getClient();
  if (!genai) {
    const err = new Error("GEMINI_NOT_CONFIGURED");
    err.code = "GEMINI_NOT_CONFIGURED";
    throw err;
  }
  const parts = [];
  if (referenceImage?.data) parts.push({ inlineData: { mimeType: referenceImage.mimeType || "image/jpeg", data: referenceImage.data } });
  parts.push({ text: prompt });

  const response = await genai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts }],
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });

  const out = response?.candidates?.[0]?.content?.parts || [];
  const img = out.find((p) => p?.inlineData?.data);
  const text = out.filter((p) => typeof p?.text === "string").map((p) => p.text).join(" ").trim();
  if (!img) {
    // Usually a safety refusal, or a model that can't make images.
    const err = new Error(text || "IMAGE_EMPTY");
    err.code = "IMAGE_EMPTY";
    throw err;
  }
  return { image: { mimeType: img.inlineData.mimeType || "image/png", data: img.inlineData.data }, text };
}
