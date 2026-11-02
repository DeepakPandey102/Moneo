## Smarter AI, images, category details (November 2026)

- **Ask Anything answers anything.** The Home panel used the finance-only assistant, which refused general questions (e.g. "what's today's date?"). Both the Home panel and the Ask Anything page now use the general assistant: today's date (Korea time) in its instructions, live Google Search, reasoning turned on for accuracy (GEMINI_THINKING_BUDGET, default 1024), longer answers, and the user's Moneo data attached for money questions.
- **Image generation.** "Create an image of …", "draw …", "그려줘", or the **Image** button in the composer makes an image with Gemini's image model (GEMINI_IMAGE_MODEL, default gemini-2.5-flash-image). Follow-ups like "make it blue" edit the last image. Images are shrunk to JPEG before saving and have a Download button.
- **Analytics drill-down.** Tap a category (chart slice or list row) in Spending by Category to see this month's total, average, largest, top places, a day-by-day chart and every record; receipt records expand to show each item. Dashboard legend items open the same view.
- Clear error messages for usage limits, blocked images, and keys without image access.

## New look (November 2026)

- **New design** based on the team mockup: purple theme across the app, new rounded "m" logo and lowercase wordmark (also the browser icon), solid sidebar icons, glowing active item, Budgets count badge, and the profile chip at the bottom of the sidebar.
- **Home dashboard rebuilt**: mountain header with greeting, budget-first banner, three stat cards (balance and spending with sparklines, monthly budget with progress), Spending Overview (donut + spending by weekday, month picker), Quick Actions, Recent Activity, and an **Ask Anything** panel with the robot, suggestion chips and chat. The panel and Quick Actions can be closed; a floating button brings the panel back.
- **Income categories**: income now uses Job / Salary, Business, Investment, Side job / Freelance, Allowance & gifts, Scholarship and Other income; expenses keep Food, Transport, etc. The form switches lists with the type, and the "Merchant" field reads "From" for income.

## UX update (October 2026)

- **Ask Anything redesigned** like a modern AI tool: chats grouped by date with search, inline rename/delete, a greeting with suggestion cards, full-width answers with a Moneo mark, copy buttons on answers and code blocks, a growing composer (Enter to send, Shift+Enter for a new line, safe with Korean input), a jump-to-latest button and a mobile chat drawer.
- **Receipts removed from the navigation and the Dashboard.** Scanning lives in Transactions → "Scan Receipt" (old /app/receipts links still redirect there).
- **Budget first:** nav order is Home → Budgets → Transactions (desktop and mobile), and the Dashboard's empty state shows two numbered steps: 1. Create a budget, 2. Add a transaction.
- **Coach marks:** a spotlight tour (src/components/CoachTour.jsx) that starts on first login, highlights the key features across pages, and can be replayed from Settings → App tour.

## Duplicate receipts + Market page (October 2026)

**Duplicate receipt popup** (`src/utils/duplicates.js`, `src/pages/Transactions.jsx`)
- Scanning a photo that was already saved shows a popup *before* the AI is called (no quota wasted): "Cancel" or "Scan anyway".
- A different photo of an already-saved receipt is detected by card approval number (승인번호), or by store + date + amount (+ purchase time). A popup shows the saved one next to the new scan: "Don't save" or "Save anyway".
- Manual entries with the same store, date and amount get the same popup.
- The AI now also reads `receipt_time` and `approval_number` from receipts (`backend/src/services/receiptService.js`).
- Only fingerprints are stored (SHA-256 of the photo, time, approval number), never the image.

**Market page** (`src/pages/Market.jsx`, `backend/src/routes/market.js`)
- Watchlist: Bitcoin, Ethereum, Gold, Litecoin, XRP, Solana, BNB, Dogecoin in USD with 24h/7d change and 7-day sparklines; filter and sort.
- Market indicators: total crypto market cap, 24h volume, Bitcoin dominance, Fear & Greed index (gauge + history).
- Price chart with 24H/7D/1M/3M/1Y, MA 20 / MA 50 overlays and RSI 14, plus trend, change, high/low, swing.
- Asset details (market cap, supply, all-time high; gold per gram and per 돈) and a compare chart against any other asset.
- Data: CoinGecko + alternative.me, cached on the backend. Optional `COINGECKO_API_KEY` in `backend/.env`.

# Moneo — bug-fix pass (Sept 2026)

## Setup step you must do once
Run `backend/supabase_migration_001.sql` in Supabase → SQL Editor. The app
still works without it, but Ask Anything memory is less efficient.
If you deploy the frontend (e.g. Vercel), add its URL to `ALLOWED_ORIGINS`
in `backend/.env` (see `backend/.env.example`).

## Critical — data loss
- **First transaction / first budget / first goal / funds added disappeared.**
  Pages called two context functions in one click (e.g. `addTransaction` +
  `unlockAchievement`). Both started from the same old `data`, so the second
  save overwrote the first. Context now applies every change to the latest
  state (`mutate`) and saves through a queue so an older save can never land
  after a newer one. (`src/context/AppContext.jsx`)
- **A network error while loading could wipe the account.** `getUserData`
  returned empty data on *any* error; the next save wrote that empty object
  over the real data. It now throws, and the app shows a Retry screen.
  (`src/utils/storage.js`, `src/App.jsx`)
- **Saves silently did nothing if the user's row was missing** (`update` on 0
  rows "succeeds"). Now uses `upsert`, and a missing row is created on load.
- **Settings: confirming "Log out" in one card showed a "Clear all data"
  confirmation in the Demo Tools card** — clicking Confirm there wiped data.
- Data no longer reloads on every hourly token refresh (could overwrite
  in-progress edits).

## Wrong numbers / dates
- Dates used UTC (`toISOString`) — in Korea anything entered before 9am got
  yesterday's date; the add-transaction default date was also frozen at page
  load. New `src/utils/dates.js` uses local time everywhere.
- Saving streak showed up to 60 days for brand-new users (counted empty days
  before the first transaction).
- Division by zero for goals/budgets with a 0 target → `NaN%` / `Infinity%`.
- Negative or zero amounts could be saved.
- Budgets form defaulted to "food" even when food already had a budget →
  duplicate budgets.
- Receipt amounts like `"17,450.00"` parsed as 1,745,000; receipt payment
  methods like "신용카드" are now mapped to Card/Cash/Transfer/Other.

## Assistant / Ask Anything
- Korean IME: pressing Enter sent the message twice (second time with the
  leftover last syllable).
- Demo mode read "50만원" as ₩50; now understands 만/천/억. Afford questions
  are matched before category/"this month" keywords.
- Regenerate sent the question to Gemini twice (in history and as message).
- Memory summarization re-summarized the whole old history on every reply
  once a thread passed 16 messages (slower + costlier each time). Now only
  new messages are folded in.
- New chat: the user's first message vanished from screen while waiting.
- Failed send + Retry saved the user's message twice.
- Switching chats while a reply was loading painted it into the wrong chat.

## Mobile
- Analytics, Budgets, Goals, Notes were unreachable on phones (sidebar is
  hidden, bottom nav didn't include them). Added a "More" sheet.

## Backend
- CORS was open to every website → any site you visited could use your
  Gemini key through your running backend. Now an allowlist
  (`ALLOWED_ORIGINS`).
- Simple rate limit (30 AI requests/min per IP).
- Receipt scanning asks Gemini for strict JSON, and "today" uses
  `APP_TIMEZONE` (default Asia/Seoul) instead of UTC.

## Smaller
- Toast could disappear early when a new toast replaced an old one.
- IDs could collide within the same millisecond.
- Delete confirmations for transactions, budgets, goals.
- Login/registration errors no longer say "wrong password" / "fill in all
  fields" for network problems.
- About text said the app uses localStorage (outdated).

# Redesign + Google login (Sept 28)
- New landing + login page from the team mockup: Seoul night hero, "made in Korea" headline,
  animated floating cards, feature sections below the fold, EN/한국어 switch before login.
- Continue with Google (redirect) and Google One Tap (automatic "Continue as …" popup).
- Working Forgot password → email link → "Set a new password" screen.
- Supabase switched to PKCE so Google/reset links work with the HashRouter.
- New app shell: sidebar + top bar with smart search (questions go to the AI assistant,
  everything else searches transactions), budget-alert notifications, profile menu with
  Google photo, Receipts shortcut.
- New dashboard: month picker, Total balance / Spent / Remaining budget vs last month,
  animated spending chart (this month or 6 months), category donut, scan-receipt card,
  recent transactions, and an inline Moneo AI chat. All numbers come from real data.
- Blue→purple theme applied to every page; Plus Jakarta Sans font; new logo and favicon.

# Landing sections, dashboard v2, deploy-ready (Sept 28)
- Real Seoul night photo as the landing hero and About us background.
- New landing sections: How it works (4 steps), Our goal (why use Moneo), About us (team),
  FAQ (9 questions), Contact us (GitHub / phone / email / Instagram), full footer.
- Team and contact details live in `src/data/team.js`.
- Dashboard v2 from the team mockup: Goals card, This Month's Summary, AI assistant in the
  right rail, AI banner, "Small steps" card, sidebar Moneo AI card with robot.
- Backend: `trust proxy` so the rate limit is per visitor when hosted behind a proxy.
- Deploy files: `render.yaml`, `vercel.json` caching, GitHub Actions CI, `.nvmrc`,
  stricter `.gitignore`, `DEPLOY.md`.

# Speed, mobile, language & polish (Sept 28)
- Receipt scanning is much faster: photos are shrunk in the browser (≈1600px, ~300 KB)
  before upload, and the AI server is woken up as soon as the app opens.
- Korean receipts are translated into the app language; the original text is shown
  small underneath (review screen, transaction list, dashboard).
- Landing page: sections open by clicking (Home, Features, How it works, Goals,
  About us, FAQ, Contact) instead of one long scroll; mobile menu added.
- Streak now counts only days you actually logged something (being away no longer
  inflates it).
- Settings: Demo mode and sample-data tools removed; AI service status shown instead.
- Sidebar: "Powered by Supabase" removed.
- Dropdown lists (e.g. Budgets category) are now dark and readable.
- Error messages always follow the app language (browser validation popups, which
  used the computer's language, are replaced by Moneo's own messages).
- Friendlier AI error messages; long names no longer overlap amounts; charts use ₩K/₩M labels.
- Landing: removed the "Explore" chips under the hero (the top menu covers it).
- App: removed the top search bar (it mixed searching with asking the AI).
  Transactions keeps its own search box; the AI has its own pages.
- Removed all sample-data code (Generate Sample Month and demoData.js), so an
  account only ever contains what its user entered.
