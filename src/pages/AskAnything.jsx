import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import {
  Plus, ArrowUp, Trash2, Pencil, Check, X, Copy, RotateCcw, AlertCircle,
  PanelLeft, Search, ArrowDown, Lightbulb, PenLine, Languages, MessageSquare, ImagePlus, Download,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import * as chatService from "../services/chatService";
import { buildFinancialContext } from "../services/assistantService";

// Same idea as the server's check: does this message ask for a picture?
const IMAGE_ASK = /\b(draw|sketch|paint|illustrate)\b|\b(generate|create|make|design|render|show me|give me)\b[^.?!\n]{0,60}\b(image|picture|pic|photo|illustration|drawing|logo|poster|wallpaper|artwork|icon|banner|cartoon|portrait|avatar)s?\b|그려\s*(줘|주세요)|(그림|이미지|사진|일러스트|로고|포스터).{0,15}(만들어|생성|그려|줘)/i;

// Markdown normally blocks data: links; allow inline images only.
const allowImages = (url) => (/^data:image\//.test(url) ? url : defaultUrlTransform(url));

function ChatImage({ src, alt }) {
  return (
    <figure className="aa-img">
      <img src={src} alt={alt || ""} loading="lazy" />
      {String(src || "").startsWith("data:image/") && (
        <a className="aa-img-dl" href={src} download="moneo-image.jpg"><Download size={14} /> Download</a>
      )}
    </figure>
  );
}

// Suggestions shown on an empty chat. Picked for students living in Korea.
const STARTERS = {
  en: [
    { icon: Lightbulb, title: "Explain it simply", prompt: "Explain compound interest simply, with a small example in won." },
    { icon: PenLine, title: "Write an email", prompt: "Help me write a short, polite email to my professor asking for a deadline extension." },
    { icon: Languages, title: "Polite Korean", prompt: "Translate this into polite Korean for my landlord: \"The heating isn't working. When can someone check it?\"" },
    { icon: ImagePlus, title: "Create an image", prompt: "Create an image of a cozy Korean street food stall at night with warm lights, illustration style." },
  ],
  ko: [
    { icon: Lightbulb, title: "쉽게 설명하기", prompt: "복리를 원화 예시로 쉽게 설명해줘." },
    { icon: PenLine, title: "이메일 쓰기", prompt: "교수님께 과제 마감 연장을 정중하게 부탁하는 짧은 이메일을 써줘." },
    { icon: Languages, title: "존댓말로 바꾸기", prompt: "집주인에게 보낼 메시지를 정중한 한국어로 바꿔줘: \"난방이 안 돼요. 언제 확인해 주실 수 있나요?\"" },
    { icon: ImagePlus, title: "이미지 만들기", prompt: "따뜻한 조명이 있는 밤의 한국 포장마차 일러스트 이미지를 만들어줘." },
  ],
};

// Group threads like most chat apps: Today / Yesterday / Previous 7 days / Older
function groupThreads(threads, lang) {
  const ko = lang === "ko";
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const day = 86400000;
  const groups = [
    { key: "today", label: ko ? "오늘" : "Today", items: [] },
    { key: "yesterday", label: ko ? "어제" : "Yesterday", items: [] },
    { key: "week", label: ko ? "지난 7일" : "Previous 7 days", items: [] },
    { key: "older", label: ko ? "이전" : "Older", items: [] },
  ];
  for (const t of threads) {
    const ts = new Date(t.updated_at || t.created_at || Date.now()).getTime();
    if (ts >= startOfToday.getTime()) groups[0].items.push(t);
    else if (ts >= startOfToday.getTime() - day) groups[1].items.push(t);
    else if (ts >= startOfToday.getTime() - 7 * day) groups[2].items.push(t);
    else groups[3].items.push(t);
  }
  return groups.filter((g) => g.items.length);
}

function greeting(name, lang) {
  const h = new Date().getHours();
  const first = (name || "").split(" ")[0];
  if (lang === "ko") return first ? `${first}님, 무엇을 도와드릴까요?` : "무엇을 도와드릴까요?";
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return first ? `${part}, ${first}` : part;
}

// Code blocks get their own copy button.
function CodeBlock({ children, lang }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="aa-code">
      <button
        type="button"
        className="aa-code-copy"
        onClick={() => {
          navigator.clipboard?.writeText(ref.current?.innerText || "");
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? (lang === "ko" ? "복사됨" : "Copied") : (lang === "ko" ? "복사" : "Copy")}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

export default function AskAnything() {
  const { user, lang, data } = useApp();
  const ko = lang === "ko";
  const L = (en, k) => (ko ? k : en);

  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [showJump, setShowJump] = useState(false);
  const [typewriterId, setTypewriterId] = useState(null);
  const [typewriterText, setTypewriterText] = useState("");
  const [imageMode, setImageMode] = useState(false);
  const [makingImage, setMakingImage] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const typewriterIntervalRef = useRef(null);
  const stickToBottomRef = useRef(true);
  // Set when WE just created a thread mid-send, so switching to it doesn't
  // reload an empty list and wipe the message the user just typed.
  const skipNextLoadRef = useRef(null);
  const activeThreadRef = useRef(null);
  activeThreadRef.current = activeThreadId;

  // ---------- loading ----------
  useEffect(() => {
    if (!user) return;
    chatService.listThreads(user.id)
      .then((list) => {
        setThreads(list);
        setLoadingThreads(false);
        if (list.length > 0) setActiveThreadId(list[0].id);
      })
      .catch((err) => { console.error(err); setLoadingThreads(false); });
  }, [user]);

  useEffect(() => {
    if (!activeThreadId) { setMessages([]); return; }
    if (skipNextLoadRef.current === activeThreadId) { skipNextLoadRef.current = null; return; }
    let cancelled = false;
    setError(null);
    setLoadingMessages(true);
    chatService.listMessages(activeThreadId)
      .then((msgs) => { if (!cancelled) { setMessages(msgs); setLoadingMessages(false); stickToBottomRef.current = true; } })
      .catch((err) => { console.error(err); if (!cancelled) setLoadingMessages(false); });
    return () => { cancelled = true; };
  }, [activeThreadId]);

  // ---------- scrolling: follow new text only if the user is at the bottom ----------
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom(false);
  }, [messages, typewriterText, sending, error, scrollToBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottomRef.current = nearBottom;
    setShowJump(!nearBottom);
  }

  useEffect(() => () => clearInterval(typewriterIntervalRef.current), []);

  // ---------- composer: grows with the text ----------
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  function runTypewriter(messageId, fullText) {
    if (String(fullText).includes("data:image/")) return; // images appear at once
    setTypewriterId(messageId);
    setTypewriterText("");
    let i = 0;
    clearInterval(typewriterIntervalRef.current);
    typewriterIntervalRef.current = setInterval(() => {
      i += Math.max(2, Math.floor(fullText.length / 90));
      setTypewriterText(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(typewriterIntervalRef.current);
        setTypewriterId(null);
      }
    }, 16);
  }

  async function ensureThread() {
    if (activeThreadId) return activeThreadId;
    const thread = await chatService.createThread(user.id);
    skipNextLoadRef.current = thread.id;
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
    return thread.id;
  }

  // "New chat" just clears the screen; the thread is created on first send,
  // so empty chats don't pile up in the list.
  function handleNewThread() {
    setActiveThreadId(null);
    setMessages([]);
    setError(null);
    setInput("");
    setDrawerOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function handleSend(overrideText, { isRetry = false } = {}) {
    const text = (typeof overrideText === "string" ? overrideText : input).trim();
    if (!text || sending) return;
    setError(null);
    if (!isRetry) setInput("");
    setSending(true);
    const mode = imageMode ? "image" : "auto";
    setMakingImage(imageMode || IMAGE_ASK.test(text));
    setImageMode(false);
    stickToBottomRef.current = true;

    const tempUserMsg = { id: "temp-" + Date.now(), role: "user", content: text, created_at: new Date().toISOString() };
    let threadId = activeThreadId;
    const isFirstMessage = !messages.some((m) => m.role === "assistant");

    try {
      threadId = await ensureThread();
      if (!isRetry) setMessages((prev) => [...prev, tempUserMsg]);

      const reply = await chatService.sendMessage({ threadId, message: text, lang, skipUserSave: isRetry, mode, financialContext: data ? buildFinancialContext(data) : null });
      const fresh = await chatService.listMessages(threadId);
      if (activeThreadRef.current === threadId) {
        setMessages(fresh);
        runTypewriter(reply.id, reply.content);
      }

      if (isFirstMessage) {
        chatService.generateTitleForThread({ threadId, firstMessage: text, lang }).then((title) => {
          if (title) setThreads((prev) => prev.map((th) => (th.id === threadId ? { ...th, title } : th)));
        });
      }
      setThreads((prev) => {
        const updated = prev.map((th) => (th.id === threadId ? { ...th, updated_at: new Date().toISOString() } : th));
        return [...updated].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      });
    } catch (err) {
      console.error(err);
      // The question may be saved even though the reply failed: reload so the
      // screen matches the database, and let Retry reuse the saved question.
      let alreadySaved = false;
      if (threadId) {
        try {
          const fresh = await chatService.listMessages(threadId);
          const last = fresh[fresh.length - 1];
          alreadySaved = Boolean(last && last.role === "user" && last.content === text);
          if (activeThreadRef.current === threadId) setMessages(fresh);
        } catch {
          setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        }
      }
      if (!alreadySaved && !isRetry) setInput(text);
      setError({ message: chatService.friendlyChatError(err, lang), retryText: alreadySaved ? text : null });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function handleRegenerate(msg) {
    if (sending) return;
    const idx = messages.findIndex((m) => m.id === msg.id);
    const userMsg = [...messages].slice(0, idx).reverse().find((m) => m.role === "user");
    if (!userMsg) return;
    setSending(true);
    setError(null);
    stickToBottomRef.current = true;
    try {
      await chatService.deleteMessage(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      setMakingImage(IMAGE_ASK.test(userMsg.content));
      const reply = await chatService.sendMessage({ threadId: activeThreadId, message: userMsg.content, lang, skipUserSave: true, financialContext: data ? buildFinancialContext(data) : null });
      const fresh = await chatService.listMessages(activeThreadId);
      setMessages(fresh);
      runTypewriter(reply.id, reply.content);
    } catch (err) {
      setError({ message: chatService.friendlyChatError(err, lang) });
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteThread(threadId) {
    setConfirmDeleteId(null);
    try {
      await chatService.deleteThread(threadId);
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) { setActiveThreadId(null); setMessages([]); }
    } catch (err) { console.error(err); }
  }

  function startRename(thread) {
    setConfirmDeleteId(null);
    setRenamingId(thread.id);
    setRenameValue(thread.title);
  }

  async function confirmRename(threadId) {
    const title = renameValue.trim() || "New Chat";
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, title } : t)));
    setRenamingId(null);
    try { await chatService.renameThread(threadId, title); } catch (err) { console.error(err); }
  }

  function copyMessage(msg) {
    navigator.clipboard?.writeText(msg.content);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId((id) => (id === msg.id ? null : id)), 1500);
  }

  function onComposerKey(e) {
    // Enter sends, Shift+Enter adds a line. While typing Korean the IME is
    // still composing, so Enter must not send half a syllable.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? threads.filter((t) => (t.title || "").toLowerCase().includes(q)) : threads;
  }, [threads, query]);
  const groups = useMemo(() => groupThreads(filtered, lang), [filtered, lang]);
  const empty = messages.length === 0 && !loadingMessages;
  const mdComponents = useMemo(() => ({
    pre: ({ children }) => <CodeBlock lang={lang}>{children}</CodeBlock>,
    img: ({ src, alt }) => <ChatImage src={src} alt={alt} />,
  }), [lang]);

  return (
    <div className={"aa-page" + (drawerOpen ? " drawer-open" : "")}>
      {/* ---------------- chat list ---------------- */}
      <aside className="aa-side" aria-label={L("Chats", "대화 목록")}>
        <div className="aa-side-top">
          <button type="button" className="aa-new" onClick={handleNewThread}>
            <Plus size={17} /> {L("New chat", "새 대화")}
          </button>
          <button type="button" className="aa-icon-btn aa-side-close" onClick={() => setDrawerOpen(false)} aria-label={L("Close chat list", "대화 목록 닫기")}>
            <X size={18} />
          </button>
        </div>
        <label className="aa-search">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L("Search chats", "대화 검색")} />
        </label>

        <div className="aa-thread-list">
          {loadingThreads ? (
            <div className="aa-side-note">{L("Loading chats…", "대화를 불러오는 중…")}</div>
          ) : threads.length === 0 ? (
            <div className="aa-side-note">{L("Your chats will appear here.", "대화가 여기에 표시돼요.")}</div>
          ) : groups.length === 0 ? (
            <div className="aa-side-note">{L("No chats match.", "일치하는 대화가 없어요.")}</div>
          ) : groups.map((g) => (
            <div key={g.key} className="aa-group">
              <div className="aa-group-label">{g.label}</div>
              {g.items.map((thread) => (
                <div
                  key={thread.id}
                  className={"aa-thread" + (thread.id === activeThreadId ? " active" : "")}
                  onClick={() => { if (renamingId !== thread.id) { setActiveThreadId(thread.id); setDrawerOpen(false); setConfirmDeleteId(null); } }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" && renamingId !== thread.id) setActiveThreadId(thread.id); }}
                >
                  {renamingId === thread.id ? (
                    <div className="aa-rename" onClick={(e) => e.stopPropagation()}>
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter") confirmRename(thread.id); if (e.key === "Escape") setRenamingId(null); }}
                        aria-label={L("Chat name", "대화 이름")}
                      />
                      <button type="button" onClick={() => confirmRename(thread.id)} aria-label={L("Save name", "이름 저장")}><Check size={14} /></button>
                    </div>
                  ) : confirmDeleteId === thread.id ? (
                    <div className="aa-confirm" onClick={(e) => e.stopPropagation()}>
                      <span>{L("Delete chat?", "삭제할까요?")}</span>
                      <button type="button" className="danger" onClick={() => handleDeleteThread(thread.id)}>{L("Delete", "삭제")}</button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)}>{L("Keep", "취소")}</button>
                    </div>
                  ) : (
                    <>
                      <span className="aa-thread-title">{thread.title}</span>
                      <span className="aa-thread-actions">
                        <button type="button" onClick={(e) => { e.stopPropagation(); startRename(thread); }} aria-label={L("Rename chat", "이름 바꾸기")}><Pencil size={13} /></button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(thread.id); }} aria-label={L("Delete chat", "대화 삭제")}><Trash2 size={13} /></button>
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>
      <div className="aa-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      {/* ---------------- conversation ---------------- */}
      <section className="aa-main">
        <header className="aa-head">
          <button type="button" className="aa-icon-btn aa-drawer-btn" onClick={() => setDrawerOpen(true)} aria-label={L("Open chat list", "대화 목록 열기")}>
            <PanelLeft size={18} />
          </button>
          <div className="aa-head-title">
            <MessageSquare size={16} />
            <span>{activeThread ? activeThread.title : L("New chat", "새 대화")}</span>
          </div>
          <div className="aa-head-actions">
            {activeThread && (
              <button type="button" className="aa-icon-btn" onClick={() => { setDrawerOpen(true); startRename(activeThread); }} aria-label={L("Rename chat", "이름 바꾸기")}>
                <Pencil size={16} />
              </button>
            )}
            <button type="button" className="aa-icon-btn" onClick={handleNewThread} aria-label={L("New chat", "새 대화")}>
              <Plus size={18} />
            </button>
          </div>
        </header>

        <div className="aa-scroll" ref={scrollRef} onScroll={onScroll}>
          {empty ? (
            <div className="aa-welcome">
              <span className="aa-mark aa-mark-lg" aria-hidden="true" />
              <h1>{greeting(user?.name, lang)}</h1>
              <p>{L("Ask me anything: questions, writing, translations, plans. I remember everything in this chat.", "질문, 글쓰기, 번역, 계획 무엇이든 물어보세요. 이 대화의 내용은 기억해요.")}</p>
              <div className="aa-starters">
                {STARTERS[ko ? "ko" : "en"].map((s) => (
                  <button key={s.title} type="button" className="aa-starter" onClick={() => handleSend(s.prompt)} disabled={sending}>
                    <s.icon size={18} />
                    <b>{s.title}</b>
                    <span>{s.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="aa-thread-body">
              {loadingMessages && <div className="aa-loading">{L("Loading messages…", "메시지를 불러오는 중…")}</div>}
              {messages.map((msg) => (
                msg.role === "user" ? (
                  <div key={msg.id} className="aa-msg aa-user">
                    <div className="aa-user-bubble">{msg.content}</div>
                  </div>
                ) : (
                  <div key={msg.id} className="aa-msg aa-ai">
                    <span className="aa-mark" aria-hidden="true" />
                    <div className="aa-ai-body">
                      <div className="aa-ai-name">Moneo</div>
                      <div className="aa-md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={mdComponents} urlTransform={allowImages}>
                          {msg.id === typewriterId ? typewriterText : msg.content}
                        </ReactMarkdown>
                      </div>
                      {msg.id !== typewriterId && (
                        <div className="aa-ai-actions">
                          <button type="button" onClick={() => copyMessage(msg)}>
                            {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                            {copiedId === msg.id ? L("Copied", "복사됨") : L("Copy", "복사")}
                          </button>
                          <button type="button" onClick={() => handleRegenerate(msg)} disabled={sending}>
                            <RotateCcw size={14} /> {L("Regenerate", "다시 생성")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              ))}
              {sending && (
                <div className="aa-msg aa-ai">
                  <span className="aa-mark thinking" aria-hidden="true" />
                  <div className="aa-ai-body">
                    <div className="aa-ai-name">Moneo</div>
                    <div className="aa-thinking">{makingImage ? L("Creating your image", "이미지를 만드는 중") : L("Thinking", "생각하는 중")}<span className="aa-dots"><i /><i /><i /></span></div>
                  </div>
                </div>
              )}
              {error && (
                <div className="aa-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{error.message}</span>
                  {error.retryText && (
                    <button type="button" onClick={() => handleSend(error.retryText, { isRetry: true })}>
                      <RotateCcw size={14} /> {L("Try again", "다시 시도")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {showJump && !empty && (
          <button type="button" className="aa-jump" onClick={() => { stickToBottomRef.current = true; scrollToBottom(); }} aria-label={L("Jump to latest", "최신 메시지로")}>
            <ArrowDown size={16} />
          </button>
        )}

        <div className="aa-composer-wrap">
          <form className={"aa-composer" + (imageMode ? " image-mode" : "")} data-tour="ask-composer" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
            <button
              type="button"
              className={"aa-mode" + (imageMode ? " on" : "")}
              onClick={() => { setImageMode((v) => !v); inputRef.current?.focus(); }}
              aria-pressed={imageMode}
              title={L("Create an image", "이미지 만들기")}
            >
              <ImagePlus size={17} /><span>{L("Image", "이미지")}</span>
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onComposerKey}
              placeholder={imageMode ? L("Describe the image you want…", "만들고 싶은 이미지를 설명해 주세요…") : L("Ask anything…", "무엇이든 물어보세요…")}
              aria-label={L("Message", "메시지")}
            />
            <button type="submit" className="aa-send" disabled={sending || !input.trim()} aria-label={L("Send", "보내기")}>
              <ArrowUp size={18} />
            </button>
          </form>
          <p className="aa-hint">
            {L("Enter to send, Shift + Enter for a new line. Moneo can make mistakes, so check important information.",
               "Enter로 보내고 Shift + Enter로 줄을 바꿔요. Moneo도 틀릴 수 있으니 중요한 정보는 확인하세요.")}
          </p>
        </div>
      </section>
    </div>
  );
}
