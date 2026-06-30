// Client calls to the /api/generate-meals serverless proxy.
// The Anthropic key never lives here — the proxy holds it. This module only
// attaches the shared secret so casual bots can't drive the endpoint.

const APP_SECRET = import.meta.env.VITE_APP_SECRET || "";

async function callApi(endpoint, payload) {
  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-secret": APP_SECRET,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw new Error(`Network error: ${e.message}`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server returned a non-JSON response (${res.status}).`);
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status}).`);
  }
  return data;
}

// Phase 1 of week generation: the chef designs the whole 7-day menu at once,
// deliberately varied and anchored to the season. Returns
// [{ day: "Mon", concept: "..." }, ...]. `ctx` carries month / location /
// seasonalHint so the planner cooks for the right time of year and place.
export async function planWeek(settings, ctx = {}) {
  const { days } = await callApi("/api/generate-meals", {
    mode: "plan",
    settings,
    monthName: ctx.monthName || "",
    location: ctx.location || "",
    seasonalHint: ctx.seasonalHint || "",
  });
  return days;
}

// Phase 2: generate one day's 4 meals, guided by that day's concept from the
// blueprint. `existingIngredients` (e.g. ["Skyr (g)", "Banana (piece)"]) keeps
// names+units consistent so the grocery list dedups cleanly.
export async function generateDay(day, settings, allowLongCook, existingNames, existingIngredients = [], ctx = {}) {
  const { meals } = await callApi("/api/generate-meals", {
    mode: "day",
    day,
    settings,
    allowLongCook,
    existingNames,
    existingIngredients,
    concept: ctx.concept || "",
    monthName: ctx.monthName || "",
    location: ctx.location || "",
    seasonalHint: ctx.seasonalHint || "",
  });
  return meals;
}

// Regenerate a single meal for one slot — stays seasonal via ctx.
export async function regenerateMeal(day, slot, settings, existingNames, ctx = {}) {
  const { meal } = await callApi("/api/generate-meals", {
    mode: "meal",
    day,
    slot,
    settings,
    existingNames,
    monthName: ctx.monthName || "",
    location: ctx.location || "",
    seasonalHint: ctx.seasonalHint || "",
  });
  return meal;
}

// Send a Coach chat message — returns { reply, proposedChanges }.
export async function coachMessage(messages, settings, meals) {
  return await callApi("/api/coach", { messages, settings, meals });
}
