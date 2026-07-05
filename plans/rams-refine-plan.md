# Plan — Rams Refine of `meal-planner-rom`

**Source:** Dieter Rams design audit, 2026-07-05 (`../DESIGN-IS-2026-07-05/`). Verdict: **REFINE** (24/30).
**Target repo:** `meal-planner-rom/` (Vite + React + Tailwind, single-file `src/App.jsx`).
**Nature:** surgical copy + a11y + token fixes. **NOT** a redesign. If any task starts to require restructuring `App.jsx`'s component tree, STOP and flag it.

Each phase is self-contained and executable in a fresh context. Line numbers are from the audit snapshot (commit `f5ad8a4`); **always re-grep the anchor text before editing** — treat line numbers as hints, anchor strings as truth. All anchors are in the **Current-Code Reference** at the bottom.

> **Global anti-patterns (apply to every phase):**
> - Do NOT restyle anything that already scored 3/3: the token system (`index.css` `:root`, `tailwind.config.js`), the sidebar layout, the empty/settings/error *visual* treatment, the serverless-proxy architecture.
> - Do NOT add new abstractions where a direct rename/attribute change suffices.
> - Do NOT introduce Tailwind `dark:` variants or new color tokens beyond what a task explicitly authorizes.
> - Do NOT `git add -A`. Stage explicitly. Commit each green phase as a checkpoint.
> - Keep every change scoped to its principle — e.g. a focus-ring change must not alter resting (non-focus) appearance.

---

## PHASE 0 — Setup, Baseline & Reference (do once, first)

**What to do**
1. **Branch off `main`** (currently clean at `f5ad8a4`): `git switch -c refine/rams-audit`. Do all work here; `main` stays untouched.
2. **Capture the baseline** so regressions are provable:
   - `cd meal-planner-rom && npm run build` → record gzipped JS size. Baseline = **~77 KB gz JS / ~4.9 KB gz CSS** (must not regress past 100 KB gz JS in Phase 4).
   - Note the resting (non-interactive) appearance of the empty/settings/error states — Phase 4 diffs against these.
3. **Read the Current-Code Reference** at the bottom of this plan and confirm each anchor string still exists (`grep -n`). If any drifted, update the anchor before proceeding.

**Allowed patterns (reuse these; do not invent):**
- Components already defined in `App.jsx`: `Button` (:576), `IconButton` (:596, already sets `aria-label`+`title`), `Eyebrow` (:609), `Input` (:619), `SidebarItem` (:785), `SidebarSection` (:776), `Modal`/`ModalHeader` (:749/:767).
- Token access: colors via Tailwind classes mapped in `tailwind.config.js:11–51` → CSS vars in `index.css:6–79`. Contrast values live in `index.css` `:root`, NOT inline.
- Icons: `lucide-react` named imports (already imported at top of `App.jsx`).

**Verification:** on a branch; `npm run build` green; baseline sizes recorded.

**Anti-pattern guards:** don't start edits on `main`; don't skip the baseline (Phase 4 needs it).

---

## PHASE 1 — Security & Retirement (do first; partly manual) — non-design

These are one-off, high-priority, and independent of the rom refine.

### 1a. 🔑 Rotate the leaked Gemini key (MANUAL — user action)
- **Fact:** `meal-planner/src/App.jsx:132` hardcodes a live Google Gemini API key (`const myGeminiKey = "AIza…RKSE"`) interpolated into a client-side `fetch` (`:135`) → it ships in client JS.
- **Action (Rom, in Google AI console):** rotate/revoke that key. Treat as compromised if that build was ever deployed. **This cannot be done in code — it is a console action.** Mark done in the checklist before deleting the literal.

### 1b. Retire the Firebase build (`meal-planner/`)
- **Fact:** scored 12/30; doesn't boot (no `index.html`, no `tailwind.config.js`); superseded by `meal-planner-rom` on every axis.
- **Action:** archive, don't rebuild. Preferred: `git rm -r meal-planner/` (or `git mv meal-planner _archive/meal-planner-firebase/` if the repo root is git-tracked; the repo root is currently **not** a git repo, so a plain `mv meal-planner _archive/meal-planner-firebase/` is acceptable). Either way the leaked-key literal at `meal-planner/src/App.jsx:132` leaves the working tree.
- **Do NOT** redesign it in place — that would reinvent `meal-planner-rom`.

**Verification:**
- `grep -rn "AIzaSy" meal-planner*/src` → **no matches** (key literal gone from any live source).
- `meal-planner/` no longer present at the repo root (moved to `_archive/` or deleted).
- Rotation checkbox ticked by the user.

**Anti-pattern guards:** don't try to "fix" the Firebase build's index.html/tailwind config to keep it alive; the decision is retirement.

---

## PHASE 2 — Copy, Labels & Error Text (`meal-planner-rom`) — #6 Honest, #4 Understandable

All edits in `src/App.jsx` unless noted. Copy-exact; anchors in the Reference.

### 2a. Rename "Sync" → "Transfer" (label→behavior honesty)
"Sync" performs manual export/import — no network sync exists. Internal state is **already** named `transfer*`; only 3 user-facing strings + 1 comment carry "Sync".

| # | File:line (hint) | Change |
|---|---|---|
| 1 | `App.jsx:851` | `<IconButton label="Sync" onClick={onSync}>` → `label="Transfer"` (this updates both `aria-label` and `title`, per IconButton :600–601). Keep the `Share2` icon. |
| 2 | `App.jsx:1698` | `<ModalHeader title="Sync" …/>` → `title="Transfer"` |
| 3 | `App.jsx:1719` | inline `…tap <span …>Sync → Import</span>, and paste.` → `Transfer → Import` |
| 4 | `App.jsx:1696` | comment `{/* ── Sync modal … */}` → `Transfer modal` (cosmetic) |

- **Optional (only if trivially clean):** rename the `onSync` prop → `onTransfer` at its 3 sites (`:802` Sidebar signature, `:851` usage, `:1207` wiring). Skip if it risks noise — the label rename is the user-visible fix; the prop is internal.
- **Do NOT** touch the modal's Export/Import tab labels or body copy (already accurate) beyond the one "Sync → Import" span.

### 2b. Subtitle the Programs (jargon clarity)
"Cut / Maintain / Lean bulk" are unexplained fitness terms.
- **Add** an optional `subtitle` field to each `PROGRAMS` object (`:57–61`):
  - `cut` → `subtitle: "lose weight"`
  - `maintain` → `subtitle: "hold weight"`
  - `leanbulk` → `subtitle: "gain muscle"`
- **Extend `SidebarItem` (`:785–798`) minimally** to render an optional subtitle. It is shared by the Workspace/Tools nav rows (`:833–835`, `:845`) which pass **no** subtitle, so the new prop MUST default to nothing and render nothing when absent. Minimal change: destructure `subtitle`, and replace the single label span (`:792`) with a vertical stack:
  ```jsx
  <span className="flex-1 min-w-0">
    <span className="block truncate">{label}</span>
    {subtitle && <span className="block truncate text-[11px] text-steel font-normal leading-tight">{subtitle}</span>}
  </span>
  ```
  (Use the contrast-fixed `text-steel` from Phase 3 so the subtitle passes AA.)
- **Pass** `subtitle={p.subtitle}` at the 3 program render sites (`:839–841`), sourcing from `PROGRAM_BY_ID` or by adding the literal.
- This is the *only* structural component tweak allowed in this plan; keep it to the span-stack above. Do NOT convert `SidebarItem` into something more general.

### 2c. Stop leaking dev/config error strings
Backend error strings (some developer-oriented) reach the user banner verbatim via `App.jsx:1110` `setError(e.message)` ← `api.js:30` `data?.error` ← `generate-meals.js` guard clauses.

- **Add a tiny mapper** near the other helpers in `App.jsx` (module scope, above `App`), used at the display boundary:
  ```jsx
  // Map raw/technical error strings to user-safe copy; keep the raw in console.
  const USER_SAFE = [/try again/i, /network error/i, /paste a plan code/i, /invalid plan code/i];
  function friendlyError(msg) {
    if (typeof msg === "string" && USER_SAFE.some((re) => re.test(msg))) return msg;
    return "Something went wrong. Please try again.";
  }
  ```
- **Apply at the three display sites** (raw stays in the existing `console.error`):
  - `:1110` `setError(e.message)` → `setError(friendlyError(e.message))`
  - `:940` `setError(\`Coach: ${e.message}\`)` → `setError(\`Coach: ${friendlyError(e.message)}\`)`
  - `:1136` `setError(\`Regeneration failed: ${e.message}\`)` → keep prefix, wrap: `friendlyError(e.message)`
- **Leave** the already-user-safe transient strings (`generate-meals.js` :399/:402/:414/:419 "…Try again.") — they pass the `/try again/i` allow-test. **Leave** the import-path messages ("Paste a plan code first", "Invalid plan code") — allow-listed.
- **Do NOT** rewrite the server strings in `generate-meals.js`; the config messages (`APP_SECRET is not set`) remain useful to Rom in server logs. The fix is at the *client display* boundary only.

**Verification (Phase 2):**
- `grep -n '"Sync"' src/App.jsx` → **0** (only "Transfer"); `grep -n 'Sync → Import' src/App.jsx` → 0.
- App renders; the Programs show two-line labels; Workspace/Tools nav rows are visually unchanged (no stray subtitle line).
- Force a generate failure (run `npm run dev` without the API) → banner shows "Something went wrong. Please try again.", NOT a `'mode' must be…` / `APP_SECRET` string. Console still shows the raw error.

**Anti-pattern guards:** no new modal/component for Transfer; subtitle is a span, not a new abstraction; error mapper is one small function, not a rework of the error pipeline.

---

## PHASE 3 — Contrast, Focus, Landmarks & Motion (`meal-planner-rom`) — #8 Thorough, #9, a11y

### 3a. Fix low-contrast text tokens (→ ≥ 4.5:1 on white)
Two tokens fail WCAG AA for normal text: `--steel #87867F` (3.65:1) and `--stone #9B9A93` (2.82:1). All contrast changes land in `index.css` tokens — **never inline**.

- **Edit `index.css:57–58`:**
  - `--steel: #87867F;` → a warm gray measuring **≥ 4.5:1** on `#FFFFFF`. Suggested start: `--steel: #6E6D66;` (~4.7:1) — **verify** with the snippet below.
  - `--stone: #9B9A93;` → suggested `--stone: #6E6D66;` (~4.7:1) — **verify**.
- **Decision — hierarchy vs. contrast:** steel and stone are today a 2-tier gray hierarchy; forcing both to AA converges them. That is acceptable — the label hierarchy is *also* carried by size/weight/uppercase-tracking (Eyebrow `:612`, SidebarSection `:779`). **Recommended:** accept convergence for text.
- **Icon-tint caveat:** `text-stone` is also used as a decorative icon tint (`:869`, `:1297`, `:1480`) and a placeholder (`:1628`). Decorative icons are exempt from 4.5:1, but darkening them is harmless/looks fine. If (and only if) an empty-state icon looks too heavy after the change, introduce a **decorative-only** token `--stone-icon: #9B9A93;` and swap it in at those 3 icon sites — do not weaken the *text* value.
- **Verify contrast (paste into browser console on the running app, or a Node REPL):**
  ```js
  const L = ([r,g,b]) => { const a=[r,g,b].map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4}); return .2126*a[0]+.7152*a[1]+.0722*a[2]; };
  const hex = h => [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const ratio = (fg,bg=[255,255,255]) => { const a=L(hex(fg)),b=L(bg.join?bg:hex(bg)); return ((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2); };
  ratio('#6E6D66'); // must be >= 4.5
  ```

### 3b. Add a consistent keyboard focus indicator
`index.css` has **zero** focus rules; buttons rely on inconsistent native outline, and the coach input (`:1628`) removes its indicator entirely (`focus:outline-none`, no replacement).

- **Add to `index.css`** (after the token block, ~after `:80`) a single global keyboard-focus ring — it only shows for keyboard users, so it does **not** change the resting aesthetic:
  ```css
  :focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
    border-radius: 4px;
  }
  ```
- **Fix the coach input's wrapper** so keyboard focus is visible there too. Find the input's container (the pill/`<form>` around `:1618–1636`) and add `focus-within:border-primary` (mirroring the `Input` border-swap). Do NOT add a second competing outline on the input itself.
- The `Input`/`select`/`textarea` border-swap (`focus:border-primary focus:border-2`) already gives a visible indicator — leave those; the global rule + coach-wrapper fix close the gaps.

### 3c. Landmarks + names (screen-reader structure)
- **`<main>` (`:1239`):** add `id="main-content"`.
- **Skip link:** as the **first child** of the root `<div>` (`:1200`, before `<Sidebar>`), add a visually-hidden-until-focused link:
  ```jsx
  <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:rounded-md focus:bg-primary focus:text-white">Skip to content</a>
  ```
  (`sr-only`/`not-sr-only` are stock Tailwind utilities — no config change.)
- **Sidebar nav landmark:** the nav items are `<button>`s inside a bare `<div className="flex-1 overflow-y-auto px-2.5 py-4">` (`:831`). Wrap that container as (or change it to) `<nav aria-label="Primary">`. Add `aria-label` to the `<aside>` (`:814`), e.g. `aria-label="Sidebar"`.
- **`aria-current`:** on the active `SidebarItem` (`:787–796`), add `aria-current={active ? "page" : undefined}` to the `<button>`.
- **Name the one unnamed button (`:1268`):** the error-dismiss `<button onClick={() => setError(null)} …>` → add `aria-label="Dismiss"`.

### 3d. Honor `prefers-reduced-motion`; dark mode decision
- **Add to `index.css`** (after the `.fade-in` block, ~after `:126`):
  ```css
  @media (prefers-reduced-motion: reduce) {
    .fade-in { animation: none; }
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
  }
  ```
  This gates the `fadeIn` (10 uses) and the `animate-spin` spinners (6 uses) without touching JSX.
- **Dark mode — DECIDED OUT (documented).** The light warm-canvas is core product identity (scored 3/3 on #3 Aesthetic and #7 Long-lasting) and adding it would mutate the "do-not-touch" token system. Record this decision in the plan/PR description so #9's "decide explicitly" is satisfied. Do **not** add `dark:` variants or a `darkMode` config key.

**Verification (Phase 3):**
- Contrast: run the snippet in 3a for the final `--steel`/`--stone` values → both **≥ 4.5**. Re-run the audit's live probe if desired; the lowest primary/secondary text contrast should now be ≥ 4.5:1.
- Focus: keyboard-`Tab` through the app — every button, link, and the coach input shows a visible focus indicator; resting appearance unchanged.
- Landmarks (browser console): `document.querySelectorAll('nav').length` ≥ 1; `document.querySelector('main#main-content')` exists; the skip link is the first Tab stop and jumps to `#main-content`; `document.querySelectorAll('button:not([aria-label]):not([title])')` that also have no text = **0**.
- Motion: with OS "reduce motion" on, the empty-state fade and spinners don't animate.

**Anti-pattern guards:** contrast values only in `index.css` tokens (not inline); focus ring only affects `:focus-visible` (keyboard), never resting state; no `dark:` variants; landmark edits add attributes/wrappers only — no layout/visual change.

---

## PHASE 4 — Verification & Regression (final)

**Build & weight (principle #9 must hold):**
- `npm run build` green. Gzipped JS still **< 100 KB** (baseline ~77 KB; these changes add negligible bytes). Record the number.

**Per-fix proof (redo each phase's verification):**
- [ ] `grep -n '"Sync"' src/App.jsx` → 0; only "Transfer" user-facing.
- [ ] Programs render two-line labels; Workspace/Tools rows unchanged.
- [ ] Forced generate failure → generic friendly banner, raw error only in console.
- [ ] `--steel`/`--stone` both measure ≥ 4.5:1 (snippet).
- [ ] Keyboard focus visible on all buttons + coach input; resting look unchanged.
- [ ] `nav` landmark present, `main#main-content` present, skip link works, `aria-current` on active item, dismiss button named.
- [ ] Reduced-motion honored.

**Regression checklist for every "Keep" item (must still hold):**
- [ ] **#3 Aesthetic:** `index.css` `:root` token structure intact; distinct rendered text colors still ≤ ~6; radius/shadow scales in `tailwind.config.js` unchanged. Empty/settings/error *visual* treatment visually identical at rest (diff against Phase-0 baseline).
- [ ] **#2 Useful:** from the empty state, generating a week is still ≤ 2 clicks; Settings controls (`:1770–1866`) all present and functional.
- [ ] **#5 Unobtrusive / #7 Long-lasting:** no new idle/looping animation, no new decorative chrome, no gradients, no trend typography introduced.
- [ ] **Architecture:** `grep -rn "AIzaSy\|sk-ant\|ANTHROPIC_API_KEY *=" meal-planner-rom/src` → no secret in client source; generation still routes through `api/generate-meals.js`.

**Anti-pattern grep sweep:**
- [ ] `grep -rn "dark:" meal-planner-rom/src` → 0 (no dark-variant creep).
- [ ] `grep -rn "#87867F\|#9B9A93" meal-planner-rom/src` → only the intended (possibly `--stone-icon`) decorative token, if introduced; no stray reintroduction of the failing text values.
- [ ] No inline hardcoded hex added for the contrast fix (values live in `index.css`).

**Finish:** commit the branch in phase-sized checkpoints; open a PR titled `refine: Rams audit fixes (24/30 → …)` whose description records the dark-mode-out decision and the before/after contrast + bundle numbers. Do not merge to `main` without the user's go-ahead.

---

# Current-Code Reference (verbatim anchors — verify before editing)

> These are the exact current strings the tasks above target (audit snapshot, commit `f5ad8a4`). Grep the anchor, don't trust the line number.

### Sync / Transfer (Phase 2a)
- `App.jsx:851` — `<IconButton label="Sync" onClick={onSync}><Share2 size={18} /></IconButton>`
- `App.jsx:1698` — `<ModalHeader title="Sync" onClose={() => setTransferOpen(false)} />`
- `App.jsx:1719` — `…tap <span className="text-primary font-medium">Sync → Import</span>, and paste.`
- `App.jsx:1696` — `{/* ── Sync modal ─────────────────────────────────────────── */}`
- Internal (already `transfer`-named): `transferOpen`/`transferMode` state (`:901–902`); `onSync` prop (`:802` signature, `:1207` wiring).

### Programs (Phase 2b)
- `App.jsx:57–61` — `PROGRAMS` array; each object has `id,name,kcalTarget,proteinTarget,carbsTarget,fatTarget` (no `subtitle` yet).
- `App.jsx:785–798` — `SidebarItem({ icon: Icon, label, active, onClick, dotColor })`; label span at `:792` `<span className="flex-1 truncate">{label}</span>`.
- `App.jsx:839–841` — the 3 program `<SidebarItem …>` (icons: `Flame`/`Dumbbell`/`TrendingUp`).
- Shared by nav rows `:833–835` (Workspace) and `:845` (Tools) — these pass no subtitle.

### Error pipeline (Phase 2c)
- `App.jsx:1264–1272` — error banner; renders `{error}` raw at `:1267`.
- `App.jsx:1110` — `setError(e.message)` (leak point); `:940` `Coach: ${e.message}`; `:1136` `Regeneration failed: ${e.message}`. Each has a preceding `console.error(e)`.
- `src/lib/api.js:7–33` — `callApi`; `:19` `Network error: …`, `:26` `Server returned a non-JSON response (…).`, `:30` `data?.error || Request failed (…).`.
- `api/generate-meals.js` dev/config strings: `:321` `Server misconfigured: APP_SECRET is not set.`, `:329` `…ANTHROPIC_API_KEY is not set.`, `:357/:360/:363/:366` `'mode'/'settings'/'day'/'slot' must be…`, `:435/:437` raw `${err.message}` echoes. User-safe transient: `:399/:402/:414/:419` (`…Try again.`).

### Tokens & contrast (Phase 3a)
- `index.css:52–61` — text token block; `:57` `--steel: #87867F;`, `:58` `--stone: #9B9A93;`, `:59` `--muted: #C4C3BD;` (`--muted`/`text-muted` is **dead** — 0 usages).
- `tailwind.config.js:19–25` — `steel:'var(--steel)'`, `stone:'var(--stone)'`, `muted:'var(--muted)'`.
- Label producers: `Eyebrow` `:612` `text-[11px] … text-stone`; `SidebarSection` `:779` `text-[10px] … text-stone`.
- `text-stone` text usages: `:612,:726,:779,:1320,:1361,:1491,:1553,:1575,:1585`; placeholder `:1628`; decorative icon tints `:869,:1297,:1480`.
- `text-steel` usages: `:634,:637,:723,:791,:1349,:1379,:1417,:1497,:1519,:1525,:1608,:1703,:1709` (`:791` is the inactive-icon tint in SidebarItem).

### Focus (Phase 3b)
- `index.css` — **no focus rules exist** (add the `:focus-visible` block).
- `Button` `:576–594` — no focus classes. `IconButton` `:596–607` — no focus classes (but has `aria-label`+`title`).
- Form controls with border-swap: `Input` `:623`, selects `:1452`/`:1462`, textarea `:1759` (all `focus:outline-none focus:border-primary focus:border-2`).
- Coach input `:1628` — `…placeholder:text-stone focus:outline-none disabled:cursor-not-allowed` (**no replacement indicator** — fix via wrapper `focus-within`).

### Landmarks (Phase 3c)
- Root `<div>` `:1200` `<div className="min-h-screen bg-canvas text-ink">` (skip-link insertion point).
- `<main>` `:1239` `<main className="max-w-[1280px] …">` (add `id`).
- `<aside>` `:814` (sidebar root; add `aria-label`). Nav container `:831` `<div className="flex-1 overflow-y-auto px-2.5 py-4">` (wrap as `<nav aria-label="Primary">`). No `<nav>` exists today.
- Unnamed button `:1268` `<button onClick={() => setError(null)} className="text-error/70 hover:text-error"><X size={16}/></button>`.

### Motion / dark mode (Phase 3d)
- `index.css:113–126` — `@keyframes fadeIn` + `.fade-in { animation: fadeIn .4s ease-out both; }`.
- `fade-in` uses: `:753,:868,:1265,:1296,:1317,:1348,:1394,:1416,:1479,:1517`. `animate-spin` (Loader2): `:673,:857,:1235,:1318,:1609,:1636`.
- `prefers-reduced-motion`, `prefers-color-scheme`, `dark:` — **all absent**; no `darkMode` key in `tailwind.config.js`.
