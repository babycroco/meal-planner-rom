import Anthropic from "@anthropic-ai/sdk";

// Per-day generation runs one Anthropic call; 30s is ample headroom.
export const config = { maxDuration: 30 };

const MODEL = "claude-sonnet-4-6";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["breakfast", "lunch", "dinner", "snack"];
const SLOT_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

const SNACK_POOL =
  "skyr + berries + nuts, cottage cheese + fruit, Greek yogurt + honey + walnuts, " +
  "protein shake + banana, hard-boiled eggs + cheese, beef jerky + apple, " +
  "tuna on rice cakes, hummus + vegetables + protein bread";

const SYSTEM_PROMPT = `You are a meal-planning assistant for one specific user. You generate realistic, high-protein meals built around weight loss and time-constrained cooking.

USER: 39yo male, 180cm, 79kg, cutting to 75kg. Trains 4x/week (2 cardio, 2 lifting). Has a newborn baby — needs FAST cooking on weekdays. A capable cook, but time-constrained.

PRIORITIES, in order:
1. Hit the protein target. This is the #1 priority, every single day.
2. Stay close to the calorie target.
3. Respect the prep-time constraint given for each meal.

INGREDIENT RULES:
- Use standard German supermarket items (Rewe/Edeka). ALWAYS write the ingredient name in GERMAN — never the English equivalent. The grocery list deduplicates by exact name, so any English/German mix creates duplicate rows.
- Canonical names you MUST use (never the English form): Banane (not Banana), Hähnchenbrust (not Chicken Breast), Hähnchenschenkel (not Chicken Thigh), Putenbrust (not Turkey), Lachsfilet (not Salmon Fillet), Rindfleisch (not Beef), Lammhackfleisch (not Lamb Mince), Thunfisch (not Tuna), Hüttenkäse (not Cottage Cheese), Eier (not Eggs), Eiweiß (not Egg Whites), Milch (not Milk), Griechischer Joghurt (not Greek Yogurt), Linsen (not Lentils), Kichererbsen (not Chickpeas), Haferflocken (not Oats), Vollkornbrot (not Whole Grain Bread), Eiweißbrot (not Protein Bread), Walnüsse (not Walnuts), Mandeln (not Almonds), Erdnussbutter (not Peanut Butter), Mandelbutter (not Almond Butter), Honig (not Honey), Sojasauce (not Soy Sauce), Olivenöl (not Olive Oil), Gurke (not Cucumber), Knoblauch (not Garlic), Ingwer (not Ginger), Petersilie (not Parsley), Zitronensaft (not Lemon Juice), Zitrone (not Lemon), Paprika (not Bell Pepper), Tomate (not Tomato), Kirschtomaten (not Cherry Tomatoes), Frühlingszwiebeln (not Spring Onions/Scallions), Rote Zwiebel (not Red Onion), Babyspinat (not Baby Spinach), Spinat (not Spinach), Brokkoli (not Broccoli), Karotte (not Carrot), Kürbiskerne (not Pumpkin Seeds), Sobanudeln (not Soba Noodles), Jasminreis (not Jasmine Rice), Reis (not Rice). Skyr, Magerquark, Bulgur, Hummus, Tofu, Feta, Mango, Avocado, Zucchini, Mozzarella, Pak Choi, Edamame are spelled the same in both languages — use them as-is.
- Use the EXACT same name for an ingredient across every meal in the entire week. Do not vary between equivalent terms (no "Skyr" in one meal and "Skyr (Natur)" in another).
- NEVER add parenthetical clarifications to ingredient names. Write "Hähnchenbrust" — never "Hähnchenbrust (Pre-Cooked)", "Hähnchenbrust (Sliced)", "Hähnchenbrust (Rotisserie)", "Mango (Gefroren)", "Ingwer (Frisch)", "Paprika (Rot und Gelb)". Parentheticals create unwanted duplicate rows on the grocery list.
- 4-8 ingredients per meal; snacks 2-4.
- Favor weight-loss-friendly high-protein staples: Hähnchenbrust, Rindfleisch, Lachsfilet, weißer Fisch, Eier, Magerquark, Skyr, Hüttenkäse, Linsen, Tofu.

PREP-TIME TIERS: "5" = no-cook / assembly only, "15" = ≤15 min, "30" = ≤30 min, "60" = 30+ min.
- Breakfast: prefer "5" (overnight oats, skyr bowls, cottage cheese plates).
- Snack: ALWAYS "5". Draw from this rotating pool to keep the grocery list clean: ${SNACK_POOL}.

The "instructions" field must be 1-2 short, action-focused sentences.`;

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

const DAY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { meals: { type: "array", items: MEAL_SCHEMA } },
  required: ["meals"],
};

function slotTargets(settings, slot) {
  const pct = settings[`${slot}Pct`] || 0;
  return {
    kcal: Math.round((settings.kcalTarget * pct) / 100),
    protein: Math.round((settings.proteinTarget * pct) / 100),
    carbs: Math.round((settings.carbsTarget * pct) / 100),
    fat: Math.round((settings.fatTarget * pct) / 100),
  };
}

function slotTargetLines(settings) {
  return SLOTS.map((s) => {
    const t = slotTargets(settings, s);
    return `- ${SLOT_LABELS[s].toUpperCase()}: ~${t.kcal} kcal, ~${t.protein}g protein, ~${t.carbs}g carbs, ~${t.fat}g fat`;
  }).join("\n");
}

function dayPrompt(day, settings, allowLongCook, existingNames) {
  const timeRule = allowLongCook
    ? 'TIME CONSTRAINT: At most ONE meal may be prep_time "60", and only dinner. Every other meal must be "5", "15", or "30".'
    : 'TIME CONSTRAINT: NO meal may be prep_time "60". Every meal must be "5", "15", or "30".';
  const avoidRepeats = existingNames.length
    ? `\nDo NOT repeat any of these meals already planned this week: ${existingNames.join(", ")}.`
    : "";
  return `Generate a full-day meal plan for ${day} — four slots: breakfast, lunch, dinner, snack.

DAILY TARGETS: ${settings.kcalTarget} kcal, ${settings.proteinTarget}g protein, ${settings.carbsTarget}g carbs, ${settings.fatTarget}g fat. Protein is the #1 priority — hit the protein target.

PER-SLOT TARGETS:
${slotTargetLines(settings)}

${timeRule}

CUISINES: ${settings.cuisines || "any"}.
AVOID: ${settings.avoid || "nothing"}.${avoidRepeats}

Return exactly 4 meals in the "meals" array, in this slot order: breakfast, lunch, dinner, snack.`;
}

function mealPrompt(day, slot, settings, existingNames) {
  const t = slotTargets(settings, slot);
  const isWeekend = day === "Sat" || day === "Sun";
  const timeRule =
    slot === "snack"
      ? 'Prep time MUST be "5".'
      : isWeekend
        ? 'Prep time: prefer "30" or shorter; "60" is allowed if the meal is worth it.'
        : 'Prep time MUST be "5", "15", or "30" — this is a weekday, no time to cook.';
  const avoidRepeats = existingNames.length
    ? `\nDo NOT repeat any of these: ${existingNames.join(", ")}.`
    : "";
  return `Generate ONE ${slot} for ${day}.

TARGET: ~${t.kcal} kcal, ~${t.protein}g protein, ~${t.carbs}g carbs, ~${t.fat}g fat. Protein is the priority. Do not exceed ${t.kcal} kcal.

${timeRule}

CUISINES: ${settings.cuisines || "any"}.
AVOID: ${settings.avoid || "nothing"}.${avoidRepeats}`;
}

function validSettings(s) {
  return (
    s &&
    typeof s === "object" &&
    ["kcalTarget", "proteinTarget", "carbsTarget", "fatTarget"].every((k) => typeof s[k] === "number")
  );
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
  const { mode, day, slot, settings, allowLongCook = false, existingNames = [] } = body || {};

  if (mode !== "day" && mode !== "meal") {
    return res.status(400).json({ error: "'mode' must be 'day' or 'meal'." });
  }
  if (!DAYS.includes(day)) {
    return res.status(400).json({ error: "'day' must be one of Mon-Sun." });
  }
  if (!validSettings(settings)) {
    return res.status(400).json({ error: "'settings' must include numeric macro targets." });
  }
  if (mode === "meal" && !SLOTS.includes(slot)) {
    return res.status(400).json({ error: "'slot' must be breakfast, lunch, dinner, or snack." });
  }
  const names = Array.isArray(existingNames) ? existingNames.filter((n) => typeof n === "string") : [];

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: mode === "day" ? 3000 : 1200,
      thinking: { type: "disabled" },
      output_config: {
        format: {
          type: "json_schema",
          schema: mode === "day" ? DAY_SCHEMA : MEAL_SCHEMA,
        },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            mode === "day"
              ? dayPrompt(day, settings, allowLongCook, names)
              : mealPrompt(day, slot, settings, names),
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      return res.status(502).json({ error: "The model declined to generate this. Try again." });
    }
    if (message.stop_reason === "max_tokens") {
      return res.status(502).json({ error: "The response was cut short. Try again." });
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

    if (mode === "day") {
      if (!Array.isArray(data.meals) || data.meals.length !== 4) {
        return res.status(502).json({
          error: `Expected 4 meals, got ${Array.isArray(data.meals) ? data.meals.length : "none"}. Try again.`,
        });
      }
      return res.status(200).json({ meals: data.meals });
    }
    return res.status(200).json({ meal: data });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const status = err.status === 429 ? 429 : 502;
      return res.status(status).json({ error: `Anthropic API error: ${err.message}` });
    }
    return res.status(500).json({ error: `Unexpected server error: ${err?.message || "unknown"}` });
  }
}
