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

// Phase 1 of week generation: the chef designs the whole 7-day menu at once —
// per-day concepts + breakfast/snack assignments + the week's ingredient
// palette (so day generation can run in parallel with a tight cart).
// `ctx` carries month / location / seasonalHint; `memory` carries
// recentMeals / loved / banned; batchMode enables leftover chaining.
export async function planWeek(settings, ctx = {}, memory = {}, batchMode = false) {
  const { days, ingredientPalette } = await callApi("/api/generate-meals", {
    mode: "plan",
    settings,
    batchMode,
    recentMeals: memory.recentMeals || [],
    lovedMeals: memory.loved || [],
    bannedMeals: memory.banned || [],
    monthName: ctx.monthName || "",
    location: ctx.location || "",
    seasonalHint: ctx.seasonalHint || "",
  });
  return { days, ingredientPalette: ingredientPalette || [] };
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
    breakfastIdea: ctx.breakfastIdea || "",
    snackIdea: ctx.snackIdea || "",
    palette: ctx.palette || [],
    otherDaysSummary: ctx.otherDaysSummary || "",
    bannedMeals: ctx.bannedMeals || [],
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
// Pantry is included so the coach can answer "what can I cook from what I have?"
export async function coachMessage(messages, settings, meals, pantry = []) {
  return await callApi("/api/coach", { messages, settings, meals, pantry });
}

// Cook mode (item 10): expand a finished meal into step-by-step instructions.
// Returns { steps: string[], tips: string }.
export async function cookRecipe(meal) {
  const { steps, tips } = await callApi("/api/generate-meals", { mode: "recipe", meal });
  return { steps: steps || [], tips: tips || "" };
}
