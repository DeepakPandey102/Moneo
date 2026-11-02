import { generateText, generateImage } from "./geminiService.js";

// This is deliberately NOT scoped to finance — "Ask Anything" is a
// general-purpose assistant, separate from the finance-only Moneo AI
// Assistant elsewhere in the app. It still lives inside Moneo (so it's
// branded and friendly), but it can talk about anything.
//
// It's also wired up with live Google Search grounding (see
// geminiService.generateText's useSearch option) — this is what lets it
// answer "what's today's date" or ask about recent news correctly instead
// of guessing from stale training data.
function buildChatSystem() {
  const now = new Date();
  const todayLine = now.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: process.env.APP_TIMEZONE || "Asia/Seoul",
  });

  return `You are Moneo AI, the assistant inside the Moneo app. You answer ANY question the user asks: general knowledge, school work, science, maths, coding, writing, translation (especially English ↔ Korean), life in Korea, news, advice, planning, and questions about the user's own money in Moneo. Never refuse a normal question just because it isn't about money.

Today's date is ${todayLine} (Korea time). Trust this over any date you might assume.

Accuracy comes first:
- Give the direct answer first, then the explanation if it helps.
- You have live Google Search. Use it for anything current or changeable (news, prices, exchange rates, schedules, laws, sports, "latest" anything) and for specific facts you aren't sure about. Never say you can't browse or don't have real-time data.
- Work through maths and multi-step problems carefully and show the key steps.
- If something is genuinely uncertain or unknown, say so plainly instead of guessing. Never invent facts, numbers, quotes or sources.
- For medical, legal or financial decisions, give useful information and say when a professional should be consulted.

The user's Moneo data may be attached as USER'S MONEO DATA. Use it ONLY when the question is about their own spending, budgets, goals or affordability; then cite the real amounts (₩). Never invent amounts that aren't in it. Ignore it for unrelated questions.

Style:
- Warm, clear and natural, like a knowledgeable friend.
- Match length to the question: short questions get short answers; complex ones get structured answers with headings, lists, tables or code blocks (Markdown) where they genuinely help.
- If a MEMORY SUMMARY of earlier conversation is provided, use it naturally for continuity.
- You can also create images: if the user asks how, tell them to ask "Create an image of …" or use the Create image button.
- Respond in the language specified below.`;
}

// ---------- image requests ----------
// "draw a cat", "create an image of…", "make a logo…", "고양이 그려줘",
// "이미지 만들어줘"…
const IMAGE_EN = /\b(draw|sketch|paint|illustrate)\b|\b(generate|create|make|design|produce|render|show me|give me|i want|i need)\b[^.?!\n]{0,60}\b(image|picture|pic|photo|illustration|drawing|logo|poster|wallpaper|artwork|sticker|icon|banner|thumbnail|cartoon|portrait|painting|avatar|mascot)s?\b|^\s*(an? )?(image|picture|photo|illustration) of\b/i;
const IMAGE_KO = /그려\s*(줘|주세요|줄래|봐)|(그림|이미지|사진|일러스트|로고|포스터|배경화면|썸네일|캐릭터|아이콘|스티커)[^.?!\n]{0,15}(만들어|생성해|그려|보여\s*줘|줘)/;
// Follow-ups that change the previous image ("make it blue", "더 밝게 해줘")
const EDIT_HINT = /\b(it|this|that|the image|the picture|same)\b|\b(make|change|add|remove|turn|edit|replace|brighter|darker|bigger|smaller|instead)\b|이거|그거|이 그림|이 이미지|바꿔|추가해|빼줘|더\s*\S+게/i;

export function looksLikeImageRequest(message) {
  return IMAGE_EN.test(message) || IMAGE_KO.test(message);
}

function parseDataUrl(url) {
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(url || "");
  return m ? { mimeType: m[1], data: m[2] } : null;
}

async function imageReply({ message, language, referenceImage }) {
  const ref = referenceImage && EDIT_HINT.test(message) ? parseDataUrl(referenceImage) : null;
  const prompt = ref
    ? `Edit the attached image as requested: ${message}`
    : `Create a high-quality image for this request: ${message}. Make it visually polished. Only include text in the image if the request asks for it, and spell it exactly.`;
  const { image, text } = await generateImage({ prompt, referenceImage: ref });
  const caption = text && text.length < 400 ? text : (language === "ko"
    ? (ref ? "요청하신 대로 이미지를 수정했어요." : "요청하신 이미지를 만들었어요.")
    : (ref ? "Here's the edited image." : "Here's your image."));
  return { reply: caption, image };
}

/**
 * mode: "auto" (default) decides from the message, "image" always makes an
 * image, "text" never does.
 * Returns { reply, image? } where image = { mimeType, data (base64) }.
 */
export async function getChatReply({ message, recentMessages, memorySummary, language, financialContext = null, mode = "auto", referenceImage = null }) {
  if (mode === "image" || (mode !== "text" && looksLikeImageRequest(message))) {
    return imageReply({ message, language, referenceImage });
  }

  const languageLine = language === "ko" ? "Respond in natural Korean." : "Respond in natural English.";
  const historyText = recentMessages && recentMessages.length
    ? recentMessages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")
    : "(no earlier messages in this thread yet)";
  const memoryBlock = memorySummary && memorySummary.trim()
    ? `MEMORY SUMMARY (earlier context from this conversation):\n${memorySummary}\n\n`
    : "";
  const dataBlock = financialContext
    ? `USER'S MONEO DATA (use only for questions about their own money):\n${JSON.stringify(financialContext)}\n\n`
    : "";

  const prompt = `${languageLine}\n\n${dataBlock}${memoryBlock}Recent conversation:\n${historyText}\n\nUser: ${message}`;

  // Reasoning on (thinking budget) for accuracy, plus room for long answers.
  const result = await generateText({
    systemInstruction: buildChatSystem(),
    prompt,
    maxOutputTokens: 6000,
    thinkingBudget: Number(process.env.GEMINI_THINKING_BUDGET) || 1024,
    useSearch: true,
  });

  const { text, sources } = typeof result === "string" ? { text: result, sources: [] } : result;
  if (sources && sources.length) {
    const unique = sources.filter((s, i) => s.uri && sources.findIndex((x) => x.uri === s.uri) === i).slice(0, 5);
    if (unique.length) {
      const list = unique.map((s) => `- [${s.title || s.uri}](${s.uri})`).join("\n");
      return { reply: `${text}\n\n---\n**${language === "ko" ? "출처" : "Sources"}:**\n${list}` };
    }
  }
  return { reply: text };
}

// Used to compress older messages into a compact running summary once a
// thread gets long, so the model can "remember" earlier context without
// the app having to resend the entire conversation history every time —
// this is what makes long-term memory affordable and fast.
const SUMMARIZE_SYSTEM = `You compress conversation history into a compact memory summary for an AI assistant to use later.

Rules:
- Preserve concrete facts, names, preferences, ongoing topics, and anything the user would expect the assistant to still "remember" later.
- Merge the new messages into the EXISTING summary provided (if any) — don't just append, actually integrate and condense.
- Write in plain, dense prose — no bullet points, no headers. Aim for well under 200 words regardless of how much conversation you're compressing.
- Write it as neutral background notes (e.g. "User is a university student interested in X; previously discussed Y"), not as a transcript or as if speaking to the user.`;

const TITLE_SYSTEM = `You generate short chat thread titles, like ChatGPT does. Given a user's first message, write a punchy 3-6 word title summarizing the topic. No quotes, no punctuation at the end, no "Title:" prefix — just the title text itself, in the same language as the message.`;

export async function generateThreadTitle({ firstMessage, language }) {
  const languageLine = language === "ko" ? "Write the title in Korean." : "Write the title in English.";
  const prompt = `${languageLine}\n\nUser's first message: "${firstMessage}"\n\nTitle:`;
  const raw = await generateText({ systemInstruction: TITLE_SYSTEM, prompt, maxOutputTokens: 20 });
  // Strip stray quotes the model sometimes adds despite instructions.
  return raw.replace(/^["'"]|["'"]$/g, "").trim().slice(0, 60);
}

export async function summarizeForMemory({ messagesToSummarize, previousSummary, language }) {
  const languageLine = language === "ko" ? "Write the summary in Korean." : "Write the summary in English.";
  const transcript = messagesToSummarize.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");
  const prompt = `${languageLine}\n\nEXISTING SUMMARY (may be empty):\n${previousSummary || "(none yet)"}\n\nNEW MESSAGES TO FOLD IN:\n${transcript}\n\nWrite the updated combined summary.`;

  return generateText({ systemInstruction: SUMMARIZE_SYSTEM, prompt, maxOutputTokens: 300 });
}
