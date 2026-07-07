import Anthropic from "@anthropic-ai/sdk";
import { anthropicUserError } from "./_errors.js";

export const config = { maxDuration: 30 };

const MODEL = "claude-sonnet-4-6";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["breakfast", "lunch", "dinner", "snack"];

const MEAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    kcal: { type: "number" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
    prep_time: { type: "string", enum: ["5", "15", "30", "60"] },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          qty: { type: "number" },
          unit: { type: "string", enum: ["g", "ml", "piece", "tbsp", "tsp"] },
          section: {
            type: "string",
            enum: ["Produce", "Meat & Fish", "Dairy & Eggs", "Pantry", "Frozen", "Bakery", "Other"],
          },
        },
        required: ["item", "qty", "unit", "section"],
      },
    },
    instructions: { type: "string" },
  },
  required: ["name", "kcal", "protein_g", "carbs_g", "fat_g", "prep_time", "ingredients", "instructions"],
};

const COACH_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    proposedChanges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "string", enum: DAYS },
          slot: { type: "string", enum: SLOTS },
          meal: MEAL_SCHEMA,
        },
        required: ["day", "slot", "meal"],
      },
    },
  },
  required: ["reply", "proposedChanges"],
};

const SYSTEM_PROMPT = `You are a meal-planning coach for one specific user with a 7-day macro-balanced meal plan. You can see the user's current week, their macro targets, and their conversation history. Help them adjust the plan: swap meals, rebalance macros, work around constraints (time, ingredients, cravings).

USER: 39yo male, 180cm, 79kg, cutting to 75kg. Trains 4x/week (2 cardio, 2 lifting). Newborn baby — needs FAST cooking on weekdays. A capable cook, but time-constrained. Shops at Rewe/Edeka in Germany — ingredients should map to common German-supermarket inventory but ALL OUTPUT MUST BE WRITTEN IN ENGLISH.

HOW TO RESPOND:
- Be concise and direct. 1-3 sentences of advice, then the changes.
- If the user asks to swap, change, or rebuild a meal, return the FULL new meal in proposedChanges (one entry per change). Each meal must satisfy the schema and respect the user's targets.
- If the user is just asking advice (no change needed) — return an empty proposedChanges array.
- Day-slot keys you can target: ${DAYS.map((d) => SLOTS.map((s) => `${d}-${s}`)).flat().join(", ")}.

PRIORITIES, in order, for every meal you propose:
1. Hit the protein target. Protein is the #1 priority.
2. Stay close to the calorie target for the slot.
3. Respect the prep-time constraint the user mentions (or the slot default: breakfast/snack 5min, lunch 15min, dinner 30min weekdays / 60min weekend).

LANGUAGE — ALWAYS WRITE IN ENGLISH:
- "reply" field: English.
- Meal "name" field: concise English title (e.g. "Sicilian Salmon with Tomato Stew", "Korean Beef Bowl"). Never German, Italian, Spanish, or any other language.
- "instructions" field: 1-2 short English sentences.
- "ingredients[].item" field: English canonical names only. Use this list:
  Proteins: Chicken breast, Chicken thighs, Turkey breast, Ground turkey, Beef, Ground beef, Lamb mince, Salmon fillet, Cod, Tuna, Shrimp, Eggs, Egg whites, Tofu, Whey protein
  Dairy: Skyr, Cottage cheese, Quark, Feta, Mozzarella, Halloumi, Parmesan, Greek yogurt, Natural yogurt, Milk
  Grains: Oats, Rice, Jasmine rice, Brown rice, Bulgur, Lentils, Beluga lentils, Chickpeas, White beans, Black beans, Soba noodles, Whole grain bread, Whole grain tortilla, Protein bread, Tabbouleh, Couscous, Quinoa
  Produce: Banana, Apple, Pear, Mango, Pineapple, Mixed berries, Lemon, Lime, Cucumber, Tomato, Cherry tomatoes, Bell pepper, Red onion, Onion, Spring onions, Pak choi, Broccoli, Cauliflower, Zucchini, Baby spinach, Spinach, Carrot, Avocado, Potato, Sweet potato, Mushrooms
  Herbs/aromatics: Garlic, Ginger, Parsley, Cilantro, Basil, Mint, Dill, Rosemary, Thyme, Oregano, Chives
  Pantry: Olive oil, Sesame oil, Walnuts, Almonds, Pumpkin seeds, Chia seeds, Peanut butter, Almond butter, Tahini, Soy sauce, Honey, Maple syrup, Dijon mustard, Vinegar, Tomato paste, Hummus, Edamame, Lemon juice
  Spices: Salt, Pepper, Cumin, Paprika powder, Cinnamon, Chili flakes, Ras el hanout, Za'atar, Curry powder, Turmeric, Baking powder

  NEVER add modifiers like "Canned", "Frozen", "Fresh", "Cooked", "Pre-cooked", "Ground" (unless part of a name like "Ground beef"), parens, or any other qualifier.

MANDATORY UNITS per ingredient (never any other):
- Honey, Olive oil, Sesame oil, Soy sauce, Peanut butter, Almond butter, Lemon juice, Tomato paste, Hummus, Maple syrup, Vinegar, Dijon mustard, Tahini: tbsp
- Salt, Pepper, Cumin, Ras el hanout, Za'atar, Paprika powder, Cinnamon, Chili flakes, Baking powder: tsp
- Whole grain bread, Whole grain tortilla, Eggs, Banana, Apple, Avocado: piece
- Garlic, Ginger: g (1 clove garlic = 3g, 1 thumb ginger = 10g)
- All other produce: g
- Milk, Egg whites: ml
- All meats, dairy, grains, nuts/seeds: g

4-8 ingredients per meal; snacks 2-4.

PREP-TIME TIERS: "5" = no-cook / assembly only, "15" = ≤15 min, "30" = ≤30 min, "60" = 30+ min.`;

function validSettings(s) {
  return (
    s &&
    typeof s === "object" &&
    ["kcalTarget", "proteinTarget", "carbsTarget", "fatTarget"].every((k) => typeof s[k] === "number")
  );
}

function summarizeWeek(meals) {
  const lines = [];
  for (const day of DAYS) {
    const dayLines = [];
    for (const slot of SLOTS) {
      const m = meals[`${day}-${slot}`];
      if (!m) continue;
      dayLines.push(`    ${slot}: ${m.name} (${m.kcal} kcal, ${m.protein_g}g P, ${m.carbs_g}g C, ${m.fat_g}g F, prep ${m.prep_time})`);
    }
    if (dayLines.length) {
      lines.push(`  ${day}:`);
      lines.push(...dayLines);
    }
  }
  return lines.length ? lines.join("\n") : "  (no week generated yet)";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const appSecret = process.env.APP_SECRET;
  if (!appSecret) {
    return res.status(500).json({ error: "Server misconfigured: APP_SECRET is not set." });
  }
  if (req.headers["x-app-secret"] !== appSecret) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server misconfigured: ANTHROPIC_API_KEY is not set." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Request body is not valid JSON." });
    }
  }
  const { messages, settings, meals, pantry } = body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "'messages' must be a non-empty array." });
  }
  if (!validSettings(settings)) {
    return res.status(400).json({ error: "'settings' must include numeric macro targets." });
  }

  // Trim to last 12 messages to keep context bounded
  const recent = messages.slice(-12).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: typeof m.content === "string" ? m.content : "",
  }));

  // The pantry lets the coach answer "what can I make with what I have?"
  const pantryLines = Array.isArray(pantry)
    ? pantry
        .slice(0, 80)
        .filter((p) => p && typeof p.item === "string")
        .map((p) => `  - ${p.item}: ${p.qty} ${p.unit}`)
        .join("\n")
    : "";

  // Inject the current week + targets + pantry as context into the first user turn
  const contextHeader = `CURRENT TARGETS:
  ${settings.kcalTarget} kcal, ${settings.proteinTarget}g protein, ${settings.carbsTarget}g carbs, ${settings.fatTarget}g fat (per day).

CURRENT WEEK:
${summarizeWeek(meals || {})}

WHAT'S IN THE PANTRY / FRIDGE RIGHT NOW (already bought — prefer using these when the user asks what to cook, and favor meals that consume them before they spoil):
${pantryLines || "  (pantry is empty / not tracked)"}

---
USER:
`;
  const augmented = [
    {
      role: recent[0].role,
      content: contextHeader + recent[0].content,
    },
    ...recent.slice(1),
  ];

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2500,
      thinking: { type: "disabled" },
      output_config: {
        format: {
          type: "json_schema",
          schema: COACH_RESPONSE_SCHEMA,
        },
      },
      system: SYSTEM_PROMPT,
      messages: augmented,
    });

    if (message.stop_reason === "refusal") {
      return res.status(502).json({ error: "The model declined to respond. Try rephrasing." });
    }
    if (message.stop_reason === "max_tokens") {
      return res.status(502).json({ error: "The response was cut short. Try a more specific request." });
    }

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: "The model returned malformed data. Try again." });
    }

    return res.status(200).json({
      reply: data.reply || "",
      proposedChanges: Array.isArray(data.proposedChanges) ? data.proposedChanges : [],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", err.status, err.message);
      const { status, error } = anthropicUserError(err);
      return res.status(status).json({ error });
    }
    console.error("Unexpected server error:", err?.message || err);
    return res.status(500).json({ error: "Something went wrong on the server. Try again." });
  }
}
