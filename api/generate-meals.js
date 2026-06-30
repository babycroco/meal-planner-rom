import Anthropic from "@anthropic-ai/sdk";

// Per-call generation runs one Anthropic call; 30s is ample headroom.
export const config = { maxDuration: 30 };

const MODEL = "claude-sonnet-4-6";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["breakfast", "lunch", "dinner", "snack"];
const SLOT_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

// ── Breakfast & snack idea banks + rotation rules. Authored by a 3-lens
// brainstorm (max-protein / global-traditions / speed-formats) then synthesized
// and adversarially de-biased. The old planner made the same "[dairy] bowl with
// fruit and oats" every day — these banks force genuine format variety.
const BREAKFAST_BANK = `Target ~500 kcal / ~40g protein each. Weekday items must be "5" (no-cook / assembly); items tagged "(weekend)" may be "15"/"30" and land ONLY on Sat/Sun. Anchor protein on Eggs, Skyr, Cottage cheese, Quark, Smoked salmon, Tuna, Turkey breast, Whey protein; keep Walnuts / Almonds / Olive oil / Honey as accents, never bulk. The cold-sweet-dairy-spoon family (jars, parfaits, bowls) is where the old monotony lived — fill a SAVORY / hot / hand-held slot first; reach for a spoon-from-jar item only after.

SAVORY PLATE (no-cook, cold, weekday — use these before any spoon item):
- Smoked-salmon lean plate: Smoked salmon, Cottage cheese, Baby spinach, Cherry tomatoes, Cucumber, Whole grain bread
- Greek mezze plate: Feta, Cucumber, Tomato, Olive oil, Parsley, + 2 boiled Eggs
- Savory cottage cheese plate: Cottage cheese, Cherry tomatoes, Cucumber, Chives, Olive oil, + 2 boiled Eggs
- Labneh-style quark plate: Quark, Olive oil, Lemon, Cucumber, Cherry tomatoes, Whole grain bread, + 2 boiled Eggs

TOAST & OPEN SANDWICH (no-cook, cold, weekday, savory):
- Scandi salmon rye: Protein bread, Quark, Smoked salmon, sliced Egg, Dill, Cucumber, Lemon
- Salmon-avocado toast: Protein bread, Smoked salmon, Avocado, Cottage cheese, Lemon, Dill
- Tuna-tomato open sandwich: Whole grain bread, Tuna, Cottage cheese, Cherry tomatoes, Spring onions, Lemon, Parsley
- Cottage-salmon protein toast: Protein bread, Cottage cheese, Smoked salmon, Cucumber, Dill, Lemon

HAND-HELD / WRAP (no-cook, cold, weekday — eat one-handed):
- Turkey hummus wrap: Whole grain bread, Turkey breast, Hummus, Baby spinach, Bell pepper
- Turkey-egg wrap: Whole grain bread, Turkey breast, sliced Eggs, Baby spinach, Mozzarella
- Tuna-salad wrap: Whole grain bread, Tuna, Cottage cheese, Spring onions, Cucumber, Lemon

SMOOTHIE / SHAKE (cold, weekday — on the go):
- Power protein shake: Whey protein, Skyr, Banana, Peanut butter, Oats (small scoop)
- Green smoothie bowl: Skyr, Whey protein, Banana, Mango, Spinach, Pumpkin seeds

SAVORY EGG (HOT — weekend only):
- Spinach-feta omelette (weekend): Eggs, Egg whites, Spinach, Feta, Cherry tomatoes
- Egg-white veggie scramble (weekend): Egg whites, Eggs, Baby spinach, Bell pepper, Feta, Avocado
- Menemen (weekend): Eggs, Tomato, Bell pepper, Spring onions, Feta, Parsley
- Shakshuka (weekend): Eggs, Tomato, Bell pepper, Spinach, Feta
- Egg muffins — BATCH (weekend bake, eaten COLD Mon–Wed): Eggs, Egg whites, Spinach, Bell pepper, Feta

PROTEIN PANCAKES (HOT, weekend only — sweet treat):
- Banana protein pancakes (weekend): Oats, Egg whites, Whey protein, Banana, Cinnamon, topped Skyr + Mixed berries

SPOON-FROM-JAR / PARFAIT (cold, sweet, weekday — counts toward the spoon-family cap):
- Vanilla whey overnight oats: Oats, Whey protein, Skyr, Mixed berries, Cinnamon, Vanilla
- Chocolate chia pudding: Chia seeds, Whey protein, Greek yogurt, Banana, Cinnamon
- Strawberry chia jar: Chia seeds, Whey protein, Strawberries, Almonds, Honey
- Bircher muesli: Oats, Skyr, Apple, Cinnamon, Walnuts, Mixed berries, Chia seeds
- Berry parfait: Greek yogurt, Whey protein, Mixed berries, Walnuts

PLAIN DAIRY BOWL (cold, weekday — HARD CAP 1/week; only when nothing else fits):
- Skyr crunch bowl: Skyr, Mixed berries, Almonds, Honey, Cinnamon
- Savory quark bowl: Quark, Chives, Spring onions, Cucumber, Cherry tomatoes, Pumpkin seeds`;

const SNACK_BANK = `All ≤5 min, no-cook / assembly. Target ~300 kcal / ~24g protein. Anchor fruit-forward ideas with Skyr / Quark / Cottage cheese / Whey protein / Eggs rather than dropping them; trim portions to stay near 300 kcal.

SAVORY (default here so days don't skew sweet):
- Turkey cucumber roll-ups: Turkey breast, Cucumber, Quark, Chives
- Smoked-salmon cucumber rolls: Smoked salmon, Quark, Dill, Cucumber
- Hard-boiled eggs & tomatoes: Eggs, Cherry tomatoes, Olive oil
- Tuna on rice cakes: Tuna, Rice cakes, Lemon, Spring onions
- Tuna-cucumber boats: Cucumber, Tuna, Cottage cheese, Spring onions
- Cottage cheese veggie dip: Cottage cheese, Bell pepper, Cucumber, Chives
- Hummus & veg plate: Hummus, Bell pepper, Cucumber, Cherry tomatoes, + small Skyr or 1 Egg
- Edamame pods: Edamame, Lemon, Spring onions
- Cottage-turkey plate: Cottage cheese, Turkey breast, Cherry tomatoes
- Cottage cheese rice cakes: Cottage cheese, Rice cakes, Tomato, Chives

SWEET:
- Quark honey-walnut cup: Quark, Honey, Walnuts, Cinnamon
- Skyr berry-seed pot: Skyr, Strawberries, Pumpkin seeds
- Greek yogurt almond crunch: Greek yogurt, Almonds, Cinnamon, Honey
- PB protein pot: Skyr, Peanut butter, Banana, Cinnamon, Chia seeds
- Chia-whey pot: Chia seeds, Whey protein, Mixed berries
- Cottage cheese mango cup: Cottage cheese, Mango, Cinnamon
- Apple + nut butter + skyr: Apple, Peanut butter, Skyr
- Whey protein shake: Whey protein, Banana`;

const BREAKFAST_SNACK_ROTATION = `- Produce 7 visibly different breakfast FORMATS across the week. No format more than TWICE, never on consecutive days.
- HARD CAP the cold-sweet-dairy-spoon family: overnight-oats/chia jars + parfaits + plain bowls COMBINED at 2 per week, plain bowls specifically at 1. Default instead to savory plates, toast, hand-held wraps, or smoothies. Fill at least one savory format before any spoon item.
- Each week: at least 3 SAVORY and 3 SWEET breakfasts, and at least 3 savory + 3 sweet snacks. On any single day, at least one of {breakfast, snack} must be savory — never pair a sweet breakfast with a sweet snack.
- Rotate the PROTEIN BASE day to day (dairy → egg → fish → poultry → whey) so no source anchors more than 2 breakfasts. Same across snacks.
- Cooked breakfasts (egg dishes, pancakes) land ONLY on Sat/Sun, tagged "(weekend)", max 2 per week. Every weekday breakfast and ALL snacks must be "5" (no-cook / assembly).
- Enforce the floor: every breakfast ~40g protein / ~500 kcal, every snack ~24g / ~300 kcal. Anchor fruit ideas with Whey protein / Egg whites / Cottage cheese / extra Skyr; trim nuts/oil/honey if calories run over. Swap fruit to what's in season, keeping the canonical name.`;

// ── System prompt — a "thinking chef" persona, parameterised by the time of
// year and location so the chef cooks with what is genuinely in season. The
// whole block is identical across all calls in one week-generation, so it is
// marked cacheable (cache_control below).
function buildSystemPrompt({ monthName, location, seasonalHint }) {
  const seasonLine = seasonalHint
    ? `IN SEASON RIGHT NOW (favor these — they're at their peak, freshest, cheapest, and best at the market this month): ${seasonalHint}.`
    : "Cook with whatever is freshest and in season.";
  return `You are a thoughtful private chef planning a week of meals for one specific person. You cook with the seasons and the local market, and you bring genuine culinary range — as comfortable with a Sichuan stir-fry as a Provençal braise, a Levantine mezze, or a simple Italian plate. You are curious and never phone it in. Repetition bores you; you treat every week as a fresh chance to cook something the eater hasn't had.

WHERE & WHEN:
- You are cooking in ${location || "Germany"}. Shop at local supermarkets (Rewe / Edeka) and the weekly farmers' market.
- It is ${monthName || "this time of year"}. Cook food that tastes like right now — a high-summer plate should sing with tomatoes and herbs; a deep-winter plate leans on roots, brassicas, and slow warmth.
- ${seasonLine}
- Do NOT force out-of-season produce. If berries or asparagus aren't listed as in season, don't build a meal around them — reach for what IS fresh.

THE EATER: 39yo male, 180cm, 79kg, cutting to 75kg. Trains 4x/week (2 cardio, 2 lifting). New baby at home — needs FAST weekday cooking. A capable, adventurous cook who is bored by repetition and loves discovering new dishes.

PRIORITIES, in order, for every meal:
1. Hit the protein target. This is the #1 priority, every single day.
2. Stay close to the calorie target.
3. Respect the prep-time constraint given for each meal.

CULINARY RANGE — this is what makes you a chef, not a template:
- Across the week, deliberately TRAVEL. One day a Thai-leaning dinner, the next a French bistro plate, the next a Turkish grill, the next a clean Italian. MIX cuisines across the days — never lock the whole week to one country or region.
- Within a week: don't use the same primary protein more than 3 days (rotate Chicken / Salmon / Beef / Lamb / Tuna / Tofu / Eggs / Shrimp / White fish / Pork). Don't use the same grain/base more than 3 days (rotate Rice / Bulgur / Potato / Soba / Tortilla / Quinoa / Couscous / Bread / Pasta / Lentils). Vary the FORMAT every day (Bowl, Wrap, Soup, Salad, Stir-fry, Sheet-pan roast, Curry, Stew, Tacos, Frittata, Pasta, Sandwich, Traybake, Skewers, lean Burger). Vary the METHOD (grilled, baked, sheet-pan, stir-fried, no-cook, braised, stewed, poached).
- NEVER relabel the same dish in different regional styles. "Brazilian Chicken Bowl" + "Peruvian Chicken Bowl" + "Colombian Chicken Bowl" is one dish wearing three country labels — that is NOT range, it's laziness. Real range changes the protein, the technique, the sauce, or the format.

LANGUAGE — ALWAYS WRITE IN ENGLISH (never German, Italian, Spanish, French, or any other language):
- "name": a concise, appetising English meal title. GOOD: "Sheet-Pan Harissa Chicken with Zucchini", "Miso-Glazed Salmon with Soba", "Summer Tomato & White Bean Salad with Tuna". BAD (never produce): "Hähnchenbrust alla Puttanesca", "Pollo a la Brasa", "Lachsfilet alla Siciliana". Translate any regional dish name to English.
- "instructions": 1-2 short English sentences, action-focused.
- "ingredients[].item": use ONLY these English canonical names — never a German equivalent, never with parens, never with modifiers:
  PROTEINS: Chicken breast, Chicken thighs, Turkey breast, Ground turkey, Beef, Ground beef, Pork tenderloin, Lamb mince, Salmon fillet, Smoked salmon, Cod, White fish, Tuna, Shrimp, Eggs, Egg whites, Tofu, Whey protein
  DAIRY: Skyr, Cottage cheese, Quark, Feta, Mozzarella, Halloumi, Parmesan, Ricotta, Greek yogurt, Natural yogurt, Milk
  GRAINS & CARBS: Oats, Rice, Jasmine rice, Brown rice, Basmati rice, Bulgur, Lentils, Beluga lentils, Chickpeas, White beans, Black beans, Kidney beans, Soba noodles, Rice noodles, Whole grain bread, Whole grain tortilla, Protein bread, Rice cakes, Tabbouleh, Couscous, Quinoa, Pasta, Polenta
  PRODUCE: Banana, Apple, Pear, Mango, Pineapple, Mixed berries, Strawberries, Cherries, Plums, Peaches, Apricots, Grapes, Rhubarb, Lemon, Lime, Cucumber, Tomato, Cherry tomatoes, Chopped tomatoes, Bell pepper, Red onion, Onion, Spring onions, Leek, Pak choi, Broccoli, Cauliflower, Cabbage, Kale, Brussels sprouts, Zucchini, Eggplant, Green beans, Peas, Asparagus, Fennel, Baby spinach, Spinach, Chard, Carrot, Beetroot, Celeriac, Radishes, Kohlrabi, Avocado, Potato, Sweet potato, Pumpkin, Mushrooms, Corn, Lettuce
  HERBS/AROMATICS: Garlic, Ginger, Parsley, Cilantro, Basil, Mint, Dill, Rosemary, Thyme, Oregano, Sage, Chives, Bay leaves
  FATS/NUTS/SEEDS: Olive oil, Sesame oil, Coconut oil, Walnuts, Almonds, Cashews, Pumpkin seeds, Sunflower seeds, Chia seeds, Flax seeds, Peanut butter, Almond butter, Tahini
  PANTRY: Soy sauce, Honey, Maple syrup, Dijon mustard, Vinegar, Apple cider vinegar, Balsamic vinegar, Tomato paste, Hummus, Edamame, Lemon juice, Coconut milk, Baking powder, Vanilla
  SPICES: Salt, Pepper, Cumin, Paprika powder, Smoked paprika, Cinnamon, Chili flakes, Chili powder, Ras el hanout, Za'atar, Garam masala, Turmeric, Curry powder, Harissa
  If you need an ingredient not listed, use the most common English supermarket name. NEVER add modifiers like "Canned", "Frozen", "Fresh", "Cooked", "Pre-cooked", "Ground" (except in compound names like "Ground beef"), "Raw", "Dried", "Chunks", "Wraps", "Wheat". NEVER use parens. Write "Chickpeas" — never "Chickpeas (canned)".

MANDATORY UNITS — use ONLY the listed unit per ingredient (never any other):
  · Honey, Olive oil, Sesame oil, Coconut oil, Soy sauce, Peanut butter, Almond butter, Lemon juice, Tomato paste, Hummus, Tahini, Maple syrup, Vinegar, Dijon mustard, Harissa: tbsp (for "1 tsp" write "0.5 tbsp"; for "2 tsp" write "1 tbsp")
  · Salt, Pepper, Cumin, Ras el hanout, Za'atar, Paprika powder, Smoked paprika, Cinnamon, Chili flakes, Chili powder, Baking powder, Vanilla, Curry powder, Turmeric, Garam masala: tsp
  · Whole grain bread, Whole grain tortilla, Protein bread, Eggs, Banana, Apple, Pear, Avocado: piece (for bread, count slices)
  · Garlic, Ginger: g (1 small clove garlic = 3g, 1 thumb ginger = 10g)
  · All other produce (Red onion, Spring onions, Tomato, Cucumber, Bell pepper, Zucchini, Green beans, Asparagus, Carrot, Mushrooms, Leek, etc.): g (realistic weights — 1 small onion ≈ 60g, 1 spring onion ≈ 15g)
  · Milk, Egg whites, Coconut milk: ml
  · All meats, dairy (Skyr, Quark, Cottage cheese, Feta, Yogurt), grains (Rice, Bulgur, Oats, Lentils, Chickpeas, Soba noodles), nuts/seeds, Mixed berries, Strawberries, Cherries, Whey protein: g
USE ONE consistent unit per ingredient across the whole week. Never mix tbsp/tsp, never mix g/piece, for the same ingredient.

INGREDIENT COUNTS: 4-8 ingredients per meal; snacks 2-4.
Favor weight-loss-friendly high-protein staples for the protein backbone: Chicken breast, Beef, Salmon fillet, White fish, Eggs, Quark, Skyr, Cottage cheese, Lentils, Tofu.

PREP-TIME TIERS: "5" = no-cook / assembly only, "15" = ≤15 min, "30" = ≤30 min, "60" = 30+ min. Weekday breakfasts and ALL snacks must be "5". Cooked breakfasts ("15"/"30") land ONLY on Sat/Sun.

BREAKFAST — the old plans were monotonous "[dairy] bowl with fruit and oats" every single day. Bring real variety: aim for 7 visibly different breakfast FORMATS across the week, mixing savory & sweet and hot & cold. Idea bank:
${BREAKFAST_BANK}

SNACK — rotate sweet & savory; never repeat one twice a week. Idea bank:
${SNACK_BANK}

BREAKFAST & SNACK ROTATION RULES — follow strictly across the 7-day week:
${BREAKFAST_SNACK_ROTATION}`;
}

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

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "string", enum: DAYS },
          concept: { type: "string", description: "1-2 sentence lunch+dinner culinary direction" },
          breakfast: { type: "string", description: "the breakfast FORMAT/idea assigned to this day (e.g. 'Savory smoked-salmon plate', 'Spinach-feta omelette (weekend)')" },
          snack: { type: "string", description: "the snack assigned to this day (e.g. 'Turkey cucumber roll-ups')" },
        },
        required: ["day", "concept", "breakfast", "snack"],
      },
    },
  },
  required: ["days"],
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

// ── Mode: "plan" — the chef designs the whole week at once, deliberately
// varied and seasonal, before any day is cooked.
function planPrompt(settings) {
  const prefs = settings.cuisines
    ? `\nThe eater especially enjoys these cuisines — weight toward them across the week, but don't be bound to them: ${settings.cuisines}.`
    : "";
  const avoid = settings.avoid ? `\nAVOID entirely (allergies / dislikes): ${settings.avoid}.` : "";
  return `Design a varied, seasonal 7-day menu blueprint (Mon → Sun) for this eater.

For EACH of the 7 days return FOUR things:
- "concept": a short 1-2 sentence culinary direction for that day's LUNCH and DINNER — the inspiration / cuisine lean, the hero seasonal ingredient, and the technique. Think like a chef sketching a week's menu on a chalkboard.
- "breakfast": the breakfast FORMAT assigned to this day, picked from the breakfast idea bank in your instructions.
- "snack": the snack assigned to this day, picked from the snack idea bank.

LUNCH/DINNER variety: deliberately VARY cuisine (travel the world — don't repeat a country two days running), primary protein (max 3 days each), technique, and format. Anchor every day to what's in season this month. No two days alike.

BREAKFAST & SNACK variety — assign these UP FRONT so the week is varied by design, not by chance: lay out Mon→Sun and give each day a DISTINCT breakfast format and a DISTINCT snack, obeying the breakfast/snack rotation rules in your instructions (7 different breakfast formats, cooked breakfasts only Sat/Sun, spoon-family bowls/jars/parfaits capped, mix sweet & savory, rotate the protein base, never a sweet breakfast + sweet snack on the same day).${prefs}${avoid}

Return exactly 7 entries in "days", one per day Mon..Sun, each with concept + breakfast + snack.`;
}

function dayPrompt(day, settings, allowLongCook, existingNames, existingIngredients = [], concept = "", breakfastIdea = "", snackIdea = "") {
  const timeRule = allowLongCook
    ? 'TIME CONSTRAINT: At most ONE meal may be prep_time "60", and only dinner. Every other meal must be "5", "15", or "30".'
    : 'TIME CONSTRAINT: NO meal may be prep_time "60". Every meal must be "5", "15", or "30".';
  const conceptLine = concept
    ? `\nTODAY'S LUNCH + DINNER CONCEPT (from the week's menu plan — build lunch and dinner around this): ${concept}`
    : "";
  const breakfastLine = breakfastIdea
    ? `\nTODAY'S BREAKFAST (assigned by the menu plan — cook exactly this format, realised with fresh detail and on-target macros): ${breakfastIdea}`
    : "\nBREAKFAST: pick a format from the breakfast idea bank that hasn't been used yet this week — favor a savory / hand-held / toast option over another dairy bowl.";
  const snackLine = snackIdea
    ? `\nTODAY'S SNACK (assigned by the menu plan): ${snackIdea}`
    : "\nSNACK: pick from the snack idea bank, rotating sweet vs savory from the days already planned.";
  const avoidRepeats = existingNames.length
    ? `\nAlready on this week's menu (make today clearly different — different dishes, proteins, and formats, not just a renamed version): ${existingNames.join(" | ")}.`
    : "";
  const reuseIngredients = existingIngredients.length
    ? `\nINGREDIENT CONSISTENCY: when today's meals reuse any of these ingredients, use the EXACT same name AND unit shown here (don't translate, don't add modifiers, don't change unit): ${existingIngredients.join(", ")}.`
    : "";
  return `Cook a full day for ${day} — four slots: breakfast, lunch, dinner, snack.

DAILY TARGETS: ${settings.kcalTarget} kcal, ${settings.proteinTarget}g protein, ${settings.carbsTarget}g carbs, ${settings.fatTarget}g fat. Protein is the #1 priority.

PER-SLOT TARGETS:
${slotTargetLines(settings)}

${timeRule}${conceptLine}${breakfastLine}${snackLine}${avoidRepeats}${reuseIngredients}

Return exactly 4 meals in "meals", in slot order: breakfast, lunch, dinner, snack.`;
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
    ? `\nMake it clearly different from these (already on the menu): ${existingNames.join(", ")}.`
    : "";
  return `Cook ONE ${slot} for ${day} — something fresh and in season, inspired but realistic.

TARGET: ~${t.kcal} kcal, ~${t.protein}g protein, ~${t.carbs}g carbs, ~${t.fat}g fat. Protein is the priority. Do not exceed ${t.kcal} kcal.

${timeRule}${avoidRepeats}`;
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
  const {
    mode,
    day,
    slot,
    settings,
    allowLongCook = false,
    existingNames = [],
    existingIngredients = [],
    concept = "",
    breakfastIdea = "",
    snackIdea = "",
    monthName = "",
    location = "",
    seasonalHint = "",
  } = body || {};

  if (mode !== "day" && mode !== "meal" && mode !== "plan") {
    return res.status(400).json({ error: "'mode' must be 'plan', 'day', or 'meal'." });
  }
  if (!validSettings(settings)) {
    return res.status(400).json({ error: "'settings' must include numeric macro targets." });
  }
  if (mode !== "plan" && !DAYS.includes(day)) {
    return res.status(400).json({ error: "'day' must be one of Mon-Sun." });
  }
  if (mode === "meal" && !SLOTS.includes(slot)) {
    return res.status(400).json({ error: "'slot' must be breakfast, lunch, dinner, or snack." });
  }
  const names = Array.isArray(existingNames) ? existingNames.filter((n) => typeof n === "string") : [];
  const ingredients = Array.isArray(existingIngredients)
    ? existingIngredients.filter((n) => typeof n === "string")
    : [];

  const anthropic = new Anthropic({ apiKey });

  const systemText = buildSystemPrompt({ monthName, location, seasonalHint });
  const schema = mode === "plan" ? PLAN_SCHEMA : mode === "day" ? DAY_SCHEMA : MEAL_SCHEMA;
  const userContent =
    mode === "plan"
      ? planPrompt(settings)
      : mode === "day"
        ? dayPrompt(day, settings, allowLongCook, names, ingredients, concept, breakfastIdea, snackIdea)
        : mealPrompt(day, slot, settings, names);

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: mode === "day" ? 4000 : mode === "plan" ? 2000 : 1500,
      thinking: { type: "disabled" },
      output_config: {
        format: { type: "json_schema", schema },
      },
      // System block is identical across all 8 calls of one week-generation —
      // cache it so calls 2..8 read the cached prefix instead of re-billing it.
      system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
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

    if (mode === "plan") {
      if (!Array.isArray(data.days) || data.days.length === 0) {
        return res.status(502).json({ error: "The planner returned no menu. Try again." });
      }
      return res.status(200).json({ days: data.days });
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
