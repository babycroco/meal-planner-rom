# Meals — Weekly Meal Planner

A personal weekly meal planner. Generates a 7-day × 4-slot (breakfast / lunch /
dinner / snack) plan tuned for weight loss, high protein, and fast weekday cooking.
Single user — built for one person.

## Stack

- **Vite + React + Tailwind CSS** — the frontend (one `src/App.jsx`).
- **Vercel serverless function** (`api/generate-meals.js`) — proxies the Anthropic
  API so the API key never reaches the browser.
- **Claude Sonnet 4.6** via `@anthropic-ai/sdk`, with structured outputs for
  guaranteed-valid JSON.
- **localStorage** for persistence; base64 export/import for moving a plan between
  devices.

## How it works

The browser never sees the Anthropic key. It calls `/api/generate-meals` with a
shared-secret header; the serverless function builds the prompt, calls Claude, and
returns the meals. A week is generated one day at a time (7 small calls) so the grid
fills in progressively and no single request risks a timeout.

## Local development

```bash
npm install
cp .env.example .env      # then fill in real values — see Environment variables
npx vercel dev            # runs the frontend AND the /api function locally
```

`npm run dev` (plain Vite) serves the UI but NOT the `/api` function — meal
generation will fail. Use `npx vercel dev` for full local testing.

## Environment variables

Three variables, set locally in `.env` and in production via the Vercel dashboard
(Project → Settings → Environment Variables, for Production + Preview):

| Variable           | Where it's used        | Notes |
|--------------------|------------------------|-------|
| `ANTHROPIC_API_KEY`| serverless function    | The real key. Server-side only. |
| `APP_SECRET`       | serverless function    | Shared secret the function checks. |
| `VITE_APP_SECRET`  | frontend bundle        | Must equal `APP_SECRET`. |

`VITE_APP_SECRET` is baked into the public JS bundle, so it deters bots but is not
real protection against a determined human. The real backstop is a **monthly
spending limit set in the Anthropic Console** — set one (~$10) before going live.

## Deploy

Source lives on GitHub; Vercel auto-deploys on every push to the main branch.
Set the three environment variables in the Vercel dashboard, then redeploy.

## Project layout

```
api/generate-meals.js   serverless proxy: secret check, prompt, Claude call, JSON
src/App.jsx             the whole app
src/lib/storage.js      localStorage wrapper
src/lib/api.js          client calls to /api/generate-meals
```
