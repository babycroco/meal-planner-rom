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

const SNACK_POOL_EN =
  "Skyr with berries and walnuts, Cottage cheese with fruit, Greek yogurt with honey and walnuts, " +
  "Protein shake with banana, Hard-boiled eggs with cheese, Tuna on protein bread, " +
  "Hummus with vegetables and protein bread, Cottage cheese with pineapple and pumpkin seeds";

const SYSTEM_PROMPT = `You are a meal-planning assistant for one specific user. You generate realistic, high-protein meals built around weight loss and time-constrained cooking.

USER: 39yo male, 180cm, 79kg, cutting to 75kg. Trains 4x/week (2 cardio, 2 lifting). Has a newborn baby — needs FAST cooking on weekdays. A capable cook, but time-constrained. Shops at Rewe/Edeka in Germany — ingredients should map to common German-supermarket inventory but ALL OUTPUT MUST BE WRITTEN IN ENGLISH.

PRIORITIES, in order:
1. Hit the protein target. This is the #1 priority, every single day.
2. Stay close to the calorie target.
3. Respect the prep-time constraint given for each meal.

LANGUAGE — ALWAYS WRITE IN ENGLISH (never German, Italian, Spanish, French, Portuguese, or any other language):
- The "name" field is a concise English meal title. Examples of GOOD names: "Pesto Chicken Wrap with Cherry Tomatoes", "Sicilian Salmon with Tomato Stew", "Korean Beef Bowl", "Spiced Lamb with Bulgur Pilaf", "Sheet-Pan Lemon Chicken with Broccoli". Examples of BAD names you must NEVER produce: "Brasilianisches Hähnchen mit Bulgur", "Hähnchenbrust alla Puttanesca", "Pollo a la Brasa", "Lachsfilet alla Siciliana". Translate any regional / non-English dish name to English ("Picadillo" → "Cuban Spiced Beef Hash"; "Lomo Saltado" → "Peruvian Stir-Fried Beef with Tomatoes").
- The "instructions" field is 1-2 short English sentences.
- The "ingredients[].item" field uses ONLY these English canonical names — never the German equivalent, never with parens, never with modifiers:
  PROTEINS: Chicken breast, Chicken thighs, Turkey breast, Ground turkey, Beef, Ground beef, Lamb mince, Salmon fillet, Cod, White fish, Tuna, Shrimp, Eggs, Egg whites, Tofu, Whey protein
  DAIRY: Skyr, Cottage cheese, Quark, Feta, Mozzarella, Halloumi, Parmesan, Greek yogurt, Natural yogurt, Milk
  GRAINS & CARBS: Oats, Rice, Jasmine rice, Brown rice, Basmati rice, Bulgur, Lentils, Beluga lentils, Chickpeas, White beans, Black beans, Kidney beans, Soba noodles, Rice noodles, Whole grain bread, Whole grain tortilla, Protein bread, Tabbouleh, Couscous, Quinoa, Pasta, Polenta
  PRODUCE: Banana, Apple, Pear, Mango, Pineapple, Mixed berries, Lemon, Lime, Cucumber, Tomato, Cherry tomatoes, Chopped tomatoes, Bell pepper, Red onion, Onion, Spring onions, Pak choi, Broccoli, Cauliflower, Kale, Zucchini, Eggplant, Baby spinach, Spinach, Carrot, Avocado, Potato, Sweet potato, Mushrooms
  HERBS/AROMATICS: Garlic, Ginger, Parsley, Cilantro, Basil, Mint, Dill, Rosemary, Thyme, Oregano, Chives, Bay leaves
  FATS/NUTS/SEEDS: Olive oil, Sesame oil, Coconut oil, Walnuts, Almonds, Cashews, Pumpkin seeds, Sunflower seeds, Chia seeds, Flax seeds, Peanut butter, Almond butter, Tahini
  PANTRY: Soy sauce, Honey, Maple syrup, Dijon mustard, Vinegar, Apple cider vinegar, Balsamic vinegar, Tomato paste, Hummus, Edamame, Lemon juice, Baking powder, Vanilla
  SPICES: Salt, Pepper, Cumin, Paprika powder, Smoked paprika, Cinnamon, Chili flakes, Chili powder, Ras el hanout, Za'atar, Garam masala, Turmeric, Curry powder

  If you need an ingredient not on the list above, use the most common English supermarket name. NEVER add modifiers like "Canned", "Frozen", "Fresh", "Cooked", "Pre-cooked", "Ground" (except where part of a compound name like "Ground beef"), "Raw", "Dried", "Chunks", "Wraps", "Wheat", "Aus der Dose", "Tiefkühl-". NEVER use parens. Write "Chickpeas" — never "Chickpeas (canned)". Write "Mixed berries" — never "Frozen mixed berries".

MANDATORY UNITS — use ONLY the listed unit per ingredient (never any other):
  · Honey, Olive oil, Sesame oil, Soy sauce, Peanut butter, Almond butter, Lemon juice, Tomato paste, Hummus, Maple syrup, Vinegar, Dijon mustard, Tahini: tbsp (for "1 tsp" recipes, write "0.5 tbsp"; for "2 tsp" write "1 tbsp")
  · Salt, Pepper, Cumin, Ras el hanout, Za'atar, Paprika powder, Cinnamon, Chili flakes, Baking powder, Vanilla, Curry powder, Turmeric, Garam masala: tsp
  · Whole grain bread, Whole grain tortilla, Protein bread, Eggs, Banana, Apple, Pear, Avocado: piece (for bread count slices)
  · Garlic, Ginger: g (1 small clove garlic = 3g, 1 thumb ginger = 10g)
  · All other produce (Red onion, Spring onions, Tomato, Cherry tomatoes, Cucumber, Bell pepper, Broccoli, Pak choi, Baby spinach, Spinach, Carrot, Zucchini, Mushrooms, Parsley, Chives, etc.): g (use realistic weights — 1 small onion ≈ 60g, 1 spring onion ≈ 15g)
  · Milk, Egg whites: ml
  · All meats, dairy (Skyr, Quark, Cottage cheese, Feta, Yogurt), grains (Rice, Bulgur, Oats, Lentils, Chickpeas, Soba noodles), nuts/seeds (Walnuts, Almonds, Pumpkin seeds, Chia seeds), Mixed berries, Whey protein, frozen produce: g

USE ONE consistent unit per ingredient across the entire week. Never mix tbsp/tsp for the same ingredient, never mix g/piece for the same ingredient.

VARIETY WITHIN A 7-DAY WEEK — DON'T BE LAZY:
- Vary the PRIMARY PROTEIN. Don't use the same protein more than 3 days. Rotate among Chicken / Salmon / Beef / Lamb / Tuna / Tofu / Eggs / Shrimp.
- Vary the GRAIN/CARB base. Don't use Bulgur (or Rice, or Soba, or Tortilla) more than 3 days. Rotate.
- Vary the DISH TYPE every day. Don't make 4 "[Protein] Bowl"s in a week. Cycle through: Bowl, Wrap, Soup, Salad, Stir-fry, Sheet-pan roast, Curry, Stew, Tacos, Frittata, Pasta dish, Sandwich, Casserole, Skewers, Burger (lean).
- Vary the COOKING METHOD: grilled, baked, sheet-pan, stir-fried, no-cook/assembly, braised, stewed, raw/cured, soup.
- DO NOT relabel the same dish in different regional styles. "Brazilian Chicken Bulgur" and "Peruvian Chicken Bulgur" and "Colombian Chicken Bulgur" all describe the same dish with three country labels — that is NOT variety, it is just relabeling. Real variety changes the PROTEIN or the GRAIN or the TECHNIQUE — not just the country-name prefix.

INGREDIENT COUNTS:
- 4-8 ingredients per meal; snacks 2-4.
- Favor weight-loss-friendly high-protein staples: Chicken breast, Beef, Salmon fillet, White fish, Eggs, Quark, Skyr, Cottage cheese, Lentils, Tofu.

PREP-TIME TIERS: "5" = no-cook / assembly only, "15" = ≤15 min, "30" = ≤30 min, "60" = 30+ min.
- Breakfast: prefer "5" (overnight oats, skyr bowls, cottage cheese plates).
- Snack: ALWAYS "5". Draw from this rotating pool to keep the grocery list clean: ${SNACK_POOL_EN}.`;

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

function dayPrompt(day, settings, allowLongCook, existingNames, existingIngredients = []) {
  const timeRule = allowLongCook
    ? 'TIME CONSTRAINT: At most ONE meal may be prep_time "60", and only dinner. Every other meal must be "5", "15", or "30".'
    : 'TIME CONSTRAINT: NO meal may be prep_time "60". Every meal must be "5", "15", or "30".';
  const avoidRepeats = existingNames.length
    ? `\nMeals already on this week's menu (give today's meals clearly different names AND different core ingredients — not just a different country label): ${existingNames.join(" | ")}.`
    : "";
  const reuseIngredients = existingIngredients.length
    ? `\nINGREDIENT CONSISTENCY: When this day's meals include any of these ingredients already used earlier in the week, use the EXACT same name AND the EXACT same unit shown here. Do not translate, do not add modifiers, do not change unit. Reused ingredients: ${existingIngredients.join(", ")}.`
    : "";
  return `Generate a full-day meal plan for ${day} — four slots: breakfast, lunch, dinner, snack.

DAILY TARGETS: ${settings.kcalTarget} kcal, ${settings.proteinTarget}g protein, ${settings.carbsTarget}g carbs, ${settings.fatTarget}g fat. Protein is the #1 priority — hit the protein target.

PER-SLOT TARGETS:
${slotTargetLines(settings)}

${timeRule}

THIS WEEK'S CUISINE FOCUS: ${settings.cuisines || "any"}. This is the dominant flavor profile for the entire week — spices, proteins-prep, sauces, sides should commit to this style. Lean HEAVILY into it; avoid defaulting to Mediterranean or generic Asian unless that IS the theme. A small minority of meals (1-2 per week) can drift if needed for variety, but most should clearly reflect this cuisine.
AVOID: ${settings.avoid || "nothing"}.${avoidRepeats}${reuseIngredients}

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
  const { mode, day, slot, settings, allowLongCook = false, existingNames = [], existingIngredients = [] } = body || {};

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
  const ingredients = Array.isArray(existingIngredients)
    ? existingIngredients.filter((n) => typeof n === "string")
    : [];

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: mode === "day" ? 4000 : 1500,
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
              ? dayPrompt(day, settings, allowLongCook, names, ingredients)
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
