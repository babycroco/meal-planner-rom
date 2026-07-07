# UX/UI Handoff — Meals app, 10-step mobile-native polish

**For a fresh Claude Code session.** Read this whole file before touching code.
It contains everything you need: project context, code map, house rules, and
the 10 work items with implementation guidance and acceptance criteria.

---

## 1. Project context

- **App**: "Meals" — a personal weekly meal planner for one user (Rom).
  Generates a 7-day × 4-slot (breakfast/lunch/dinner/snack) macro-balanced
  plan via Claude, with a consolidated grocery cart, pantry tracking, and an
  AI coach chat.
- **Repo**: `/Users/babycroco/Documents/Claude/Projects/Meals/meal-planner-rom`
  → GitHub `babycroco/meal-planner-rom` → **Vercel auto-deploys every push to
  `main`** at https://meal-planner-rom.vercel.app
- **Stack**: Vite + React 19, Tailwind 3 (design tokens = CSS variables),
  two Vercel serverless functions (`api/generate-meals.js`, `api/coach.js`)
  calling Claude Sonnet with structured outputs. All user data lives in
  **localStorage** (per-device by design).
- **The user installs this as a PWA on his iPhone.** He has a newborn — the
  app is used one-handed, often at night, and in a supermarket with bad
  reception. That's the lens for every UX decision here.

## 2. Code map

| Path | What it is |
|---|---|
| `src/App.jsx` (~2,000 lines) | The whole UI: helpers (Button, IconButton, Eyebrow, Input, MacroStat, TimeChip, MealTile, DayCard, PendingDayCard, Modal, Sidebar, ComingSoon), state, generateWeek/regenerateMeal/coach/pantry/grocery logic, all views |
| `src/index.css` | Design tokens (`:root` CSS vars), motion system (pop-in, modal-in, tile-lift, btn-spring, pulse-today, shimmer…), a11y blocks |
| `tailwind.config.js` | Token names mapped to the CSS vars (colors, radii, shadows) |
| `src/lib/api.js` | Client → serverless: `planWeek`, `generateDay`, `regenerateMeal`, `coachMessage` |
| `src/lib/storage.js` | localStorage load/save wrappers |
| `api/generate-meals.js` | Modes: `plan` (7-day blueprint + ingredientPalette), `day` (4 meals), `meal` (single). System prompt = seasonal "thinking chef", English canonical ingredients, MANDATORY UNITS, breakfast/snack idea banks, variety + leftover rules |
| `api/coach.js` | Chat: sees week + targets + pantry, returns reply + proposedChanges |
| `public/` | PWA: `manifest.webmanifest`, `sw.js`, icons, `favicon.svg` |
| `index.html` | Meta tags incl. iOS PWA tags, manifest link |

**localStorage keys**: `settings_v2`, `meals_v2` (keyed `"{Day}-{slot}"`),
`pantry_v1`, `activeProgram`, `weekContext_v1`, `mealHistory_v1`,
`favorites_v1`, `coachMessages_v1`.

**Key state facts**:
- Week generation is **two-phase and parallel**: one `plan` call → then all 7
  `day` calls via `Promise.allSettled`, progressive fill, `PendingDayCard`
  placeholders showing each day's concept while cooking.
- Grocery cart is **derived** (`consolidateGrocery(meals, pantry)`) — dedup
  via `canonicalName()` + alias map + same-family unit conversion. Ticking a
  cart row calls `addToPantry(...)` and the row disappears (pantry subtracts).
- `sanitizeMeals()` on load drops junk/placeholder entries.

## 3. House rules (non-negotiable, learned the hard way)

1. **Never sacrifice readability for style.** A full "Tuscan" restyle was
   shipped and reverted (commit `a713034`, revert `9e6795c`) because serif
   body text + low contrast hurt scanning. Keep the Notion tokens; changes
   here are structural/motion/theme-variant, not a re-skin.
2. **Respect the a11y blocks in `index.css`**: `prefers-reduced-motion`
   globally kills animations; `:focus-visible` ring; `--steel`/`--stone` were
   darkened for WCAG AA — don't lighten text colors.
3. **English canonical ingredient names everywhere** (grocery dedup depends
   on exact names). If you add anything to prompts/schemas, follow
   `INGREDIENT_ALIAS` + MANDATORY UNITS conventions in `api/generate-meals.js`.
4. **Pushing to `main` deploys production.** Commit freely (checkpoint every
   green state, stage files explicitly — never `git add -A` blindly), but
   **ask Rom before every push**. Commit messages: conventional prefix +
   detailed body + `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
5. **Verification workflow**: preview server config lives in
   `~/.claude/launch.json` (name `meals-dev`, uses `npm --prefix … run dev`,
   port 5173). Seed test data via
   `localStorage.setItem("meals_v2", JSON.stringify(seed))` + reload in
   `preview_eval` — see git history for seed examples. LLM generation can't
   be tested locally (env vars live in Vercel) — UI-test with seeds, verify
   generation after deploy. Always `npm run build` (from the repo dir) before
   committing.
6. The service worker (`public/sw.js`) is network-first for navigations, so
   deploys land immediately; bump `CACHE_VERSION` only if you change caching
   strategy.

---

## 4. The 10 work items

Recommended batches: **A = 1+2+3** (mobile-native trio, biggest daily impact),
**B = 4+5+6** (forgiveness/trust), **C = 7+8+9+10** (polish). One commit per
batch, verify in preview between batches, ask Rom before each push.

### Batch A — mobile-native

**1. Bottom tab bar (mobile only)**
- Fixed bottom bar, `lg:hidden`, 4 tabs: This week (Calendar icon), Cart
  (ShoppingCart), Pantry (Package), Coach (MessageCircle). Active tab =
  primary color; wire to the existing `view` state (`plan`/`grocery`/
  `pantry`/`coach`).
- iPhone safe area: `padding-bottom: env(safe-area-inset-bottom)`; add
  matching bottom padding to `<main>` on mobile so content never hides
  behind the bar. `viewport-fit=cover` is already set in index.html.
- Keep the hamburger/drawer for Programs + Settings/Transfer (or move
  Settings behind a 5th "…" tab — your call, keep it simple).
- Acceptance: at 375px every top-level view is one thumb-tap; no content
  obscured; desktop sidebar unchanged.

**2. "Today" hero on mobile**
- In Plan view `< lg`: render today's DayCard as a full-width hero (larger
  meal tiles) at top; remaining 6 days behind a horizontal Mon–Sun pill
  switcher (or an accordion "Rest of the week") instead of a huge vertical
  stack. `orderedDays`/`todayName` already exist.
- Desktop (`lg+`) keeps the current 7-col grid exactly as is.
- Acceptance: on mobile, today's 4 meals visible without scrolling past
  other days; other days reachable in ≤2 taps; TODAY badge logic intact.

**3. Dark mode (auto)**
- `@media (prefers-color-scheme: dark)` block in `index.css` remapping the
  `:root` vars: dark canvas/surfaces (`#1B1B1A`-family warm darks, not pure
  black), light ink, darkened pastel tint variants for the 4 meal-slot tints
  (keep hue identity: lavender/peach/mint/yellow, at ~20-25% lightness with
  readable charcoal→light text on them — you'll need to also flip
  `--charcoal` usage on tiles or introduce `--on-tint`), adjusted hairlines,
  shadows, scrim, error-tint.
- Update `<meta name="theme-color">` (add a dark variant via `media` attr)
  and consider `"background_color"` staying light in manifest (minor).
- Acceptance: toggle macOS/iOS appearance → app follows; every view (plan,
  cart, pantry, coach, modals, pending cards) legible; contrast spot-checks
  on tile text ≥ 4.5:1; no pure-white flashes.

### Batch B — forgiveness

**4. Undo toast for tick-to-pantry**
- On cart-row tick: snapshot `pantry` (pre-add) + the row, show a bottom
  toast "«Item» → pantry · Undo" for ~5s. Undo restores the snapshot
  (simplest correct approach given `consolidatePantry` merging; don't try
  to subtract). New ticks replace the pending toast (commit the previous).
- Place the toast above the mobile tab bar (mind safe-area).
- Acceptance: tick → toast appears → Undo restores the cart row and pantry
  exactly; letting it expire keeps the change; rapid multi-tick doesn't
  corrupt pantry.

**5. Regenerate confirmation**
- Only when `hasMeals`: clicking Regenerate (sidebar, mobile top bar — and
  tab bar if you added one) opens a small confirm modal: "Replace this
  week? The current plan will be overwritten." [Cancel] [Regenerate].
  First-ever generation stays instant.
- Acceptance: mis-taps can't destroy a week; empty-state Generate unchanged.

**6. Retry on failed day cards**
- `generateWeek` already computes `failedDays` from `Promise.allSettled`.
  Persist the last generation context (ctx + planByDay + palette) in a ref/
  state; render failed days as an error-variant PendingDayCard ("Couldn't
  cook this day" + Retry button) instead of silently empty.
- Retry re-runs `generateDay` for just that day with the stored context and
  fills it in. Clear the error variant on success.
- Acceptance: simulate a failure (e.g. temporarily reject in api.js) →
  card shows retry → retry fills the day; other days untouched.

### Batch C — polish

**7. Real date range instead of "Week 01"**
- The eyebrow "Week 01 · {program}" → "{JUL 7 – 13} · {program}" computed
  from today (today-first week: today → today+6). Uppercase, en dash.
  Store the range in `weekContext_v1` at generation time so a week generated
  Sunday still shows its own range later; fall back to computed-from-today.
- Acceptance: eyebrow shows correct range incl. month boundaries
  ("JUN 30 – JUL 6"); persists across reloads.

**8. Shopping progress in cart**
- Track `boughtCount` per week (increment on tick, decrement on undo, reset
  in `generateWeek`; persist e.g. `boughtCount_v1`). Header: thin progress
  bar + "12 of 41 bought" where total = boughtCount + current
  `groceryItemCount`.
- Acceptance: progress climbs as items are ticked, survives reload, resets
  with a new week; "Cart's empty" state shows 100%.

**9. Emoji per meal**
- Add optional `"emoji"` to MEAL_SCHEMA (`api/generate-meals.js`) + one
  prompt line: exactly one food emoji capturing the dish (🍜🌮🐟🥗…), no
  flags. Render it on MealTile before the name and in the meal modal title.
  Must be backward-compatible: old meals without emoji render unchanged.
- Acceptance: build passes; seeded meals with/without emoji both render;
  after a real deploy+generate, tiles show sensible emoji.

**10. Cook mode (full recipe on demand)**
- New mode `"recipe"` in `api/generate-meals.js`: input = the meal object;
  output schema `{ steps: string[] (5-10 numbered steps), tips?: string }`.
  English, references the exact ingredient quantities.
- Meal modal gets a "👨‍🍳 Cook this" button → loading state → renders steps
  as a large-type numbered list (readable from across a counter; consider a
  near-fullscreen layout on mobile). Cache the result onto the meal object
  in `meals` state (`meal.recipeSteps`) so reopening is free; regenerating
  the meal clears it.
- Acceptance: button → steps appear and persist for that meal; second open
  is instant (no API call); works in dark mode; single-meal regenerate
  clears stale steps. (Live test after deploy.)

---

## 5. Definition of done (whole handoff)

- All 10 items implemented, each batch verified in the preview (seeded
  localStorage, mobile 375px + desktop 1440px, dark + light).
- `npm run build` clean; no console errors in preview.
- 3 commits (A/B/C) with detailed messages; pushes only with Rom's OK;
  after each push, poll the live bundle hash (see git history for the
  curl-poll pattern) and confirm the deploy.
- Update this file's status section below as you go.

## 6. Status

- [x] 1. Bottom tab bar
- [x] 2. Today hero (mobile)
- [x] 3. Dark mode
- [ ] 4. Undo toast (cart → pantry)
- [ ] 5. Regenerate confirm
- [ ] 6. Retry failed day
- [ ] 7. Date-range week label
- [ ] 8. Cart progress
- [ ] 9. Meal emoji
- [ ] 10. Cook mode
