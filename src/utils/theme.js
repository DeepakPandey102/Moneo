// App themes ("skins"). The choice is saved on this device and applied to
// <html data-skin="…">; src/styles/themes.css holds each theme's colours.
// "midnight" is the original purple look and needs no attribute.

export const SKINS = [
  { id: "midnight", en: "Midnight Violet", ko: "미드나잇 바이올렛", noteEn: "The classic Moneo look", noteKo: "기본 Moneo 디자인", colors: ["#0B0A19", "#7C5CFF", "#A855F7"], dark: true },
  { id: "aurora", en: "Aurora Light", ko: "오로라 라이트", noteEn: "Bright with a soft glow", noteKo: "밝고 부드러운 빛", colors: ["#F6F5FB", "#6D4AFF", "#EC4899"], dark: false },
  { id: "gold", en: "Black Gold", ko: "블랙 골드", noteEn: "Premium, banking feel", noteKo: "고급스러운 금융 느낌", colors: ["#0C0C0A", "#B8860B", "#EAB308"], dark: true },
  { id: "paper", en: "Clean Paper", ko: "클린 페이퍼", noteEn: "Minimal and calm", noteKo: "미니멀하고 차분한", colors: ["#FAF9F5", "#1F1F24", "#6D4AFF"], dark: false },
];

const KEY = "moneo-skin";

export function getSkin() {
  try {
    const v = localStorage.getItem(KEY);
    return SKINS.some((s) => s.id === v) ? v : "midnight";
  } catch {
    return "midnight";
  }
}

function paint(id) {
  const root = document.documentElement;
  if (id === "midnight") delete root.dataset.skin;
  else root.dataset.skin = id;
  const skin = SKINS.find((s) => s.id === id) || SKINS[0];
  root.style.colorScheme = skin.dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", skin.colors[0]);
}

// Call once before React renders, so the page never flashes the wrong theme.
export function applySavedSkin() {
  paint(getSkin());
}

// Switch theme. With { x, y } (the tap position) the new theme spreads out
// in a circle from that point, where the browser supports it.
export function setSkin(id, origin) {
  try { localStorage.setItem(KEY, id); } catch { /* private mode */ }
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduce) {
    paint(id);
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const t = document.startViewTransition(() => paint(id));
  t.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)", pseudoElement: "::view-transition-new(root)" }
      );
    })
    .catch(() => {});
}
