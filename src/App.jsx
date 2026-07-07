import { useState, useEffect, useMemo, useRef } from "react";
import {
  Settings as SettingsIcon,
  Sparkles,
  RefreshCw,
  ShoppingCart,
  X,
  Check,
  Loader2,
  ChefHat,
  Flame,
  Beef,
  AlertCircle,
  Share2,
  Download,
  Clock,
  Calendar,
  Package,
  Dumbbell,
  TrendingUp,
  MessageCircle,
  Menu as MenuIcon,
  Send,
} from "lucide-react";
import { load, save } from "./lib/storage";
import { planWeek as apiPlanWeek, generateDay, regenerateMeal as apiRegenerateMeal, coachMessage as apiCoachMessage } from "./lib/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["breakfast", "lunch", "dinner", "snack"];
const SLOT_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const SLOT_TINTS = {
  breakfast: "var(--tint-lavender)",
  lunch: "var(--tint-peach)",
  dinner: "var(--tint-mint)",
  snack: "var(--tint-yellow)",
};

const DEFAULT_SETTINGS = {
  kcalTarget: 2000,
  proteinTarget: 160,
  carbsTarget: 200,
  fatTarget: 65,
  breakfastPct: 25,
  lunchPct: 30,
  dinnerPct: 30,
  snackPct: 15,
  maxLongCookPerWeek: 2,
  cuisines: "", // optional soft preference now — the chef mixes cuisines freely across the week
  avoid: "",
  location: "Berlin, Germany",
  batchMode: true, // cook once, eat twice — dinners chain into next-day lunches
};

// Macro presets the user can switch between via the sidebar. Switching a
// program overwrites the four macro targets on `settings` (everything else —
// meal split, cuisines, etc. — stays untouched). Tuned for a 39yo male,
// 180cm, 79kg, 4x/week training.
const PROGRAMS = [
  { id: "cut",      name: "Cut",      kcalTarget: 2000, proteinTarget: 160, carbsTarget: 200, fatTarget: 65 },
  { id: "maintain", name: "Maintain", kcalTarget: 2400, proteinTarget: 170, carbsTarget: 270, fatTarget: 80 },
  { id: "leanbulk", name: "Lean bulk", kcalTarget: 2700, proteinTarget: 180, carbsTarget: 320, fatTarget: 90 },
];
const PROGRAM_BY_ID = Object.fromEntries(PROGRAMS.map((p) => [p.id, p]));

// Map raw/technical error strings to user-safe banner copy. The raw error is
// still logged to the console at each call site; only the user-facing text is
// softened so backend/config messages (e.g. "APP_SECRET is not set") never
// surface in the UI. Known-friendly transient messages pass through unchanged.
const USER_SAFE_ERROR = [/try again/i, /network error/i, /paste a plan code/i, /invalid plan code/i];
function friendlyError(msg) {
  return typeof msg === "string" && USER_SAFE_ERROR.some((re) => re.test(msg))
    ? msg
    : "Something went wrong. Please try again.";
}

// Seasonal produce by month for Central Europe (Germany) — what's genuinely
// fresh, local, and at its peak at the market. The chef is told to cook with
// these so a late-June week tastes like late June, not like January. Index 0
// = January. The first ~6 entries of each month are the "headline" produce
// surfaced in the UI chip; the full list is sent to the chef.
const SEASONAL_PRODUCE = [
  // Jan
  ["Kale", "Leek", "Cabbage", "Brussels sprouts", "Celeriac", "Beetroot", "Carrot", "Mushrooms", "Apple", "Pear"],
  // Feb
  ["Kale", "Leek", "Cabbage", "Celeriac", "Beetroot", "Carrot", "Mushrooms", "Lettuce", "Apple", "Pear"],
  // Mar
  ["Leek", "Spinach", "Chard", "Radishes", "Spring onions", "Lettuce", "Carrot", "Mushrooms", "Apple"],
  // Apr
  ["Asparagus", "Radishes", "Spinach", "Spring onions", "Rhubarb", "Lettuce", "Chard", "Mushrooms"],
  // May
  ["Asparagus", "Strawberries", "Radishes", "Spinach", "Peas", "Rhubarb", "Kohlrabi", "Spring onions", "Lettuce"],
  // Jun
  ["Strawberries", "Zucchini", "Peas", "Green beans", "Cherries", "New potatoes", "Kohlrabi", "Fennel", "Cucumber", "Lettuce"],
  // Jul
  ["Tomato", "Zucchini", "Cucumber", "Green beans", "Cherries", "Mixed berries", "Apricots", "Bell pepper", "Fennel", "Corn"],
  // Aug
  ["Tomato", "Zucchini", "Bell pepper", "Eggplant", "Cucumber", "Green beans", "Corn", "Plums", "Peaches", "Broccoli"],
  // Sep
  ["Tomato", "Bell pepper", "Pumpkin", "Zucchini", "Leek", "Fennel", "Plums", "Apple", "Grapes", "Broccoli", "Cauliflower"],
  // Oct
  ["Pumpkin", "Mushrooms", "Leek", "Kale", "Cabbage", "Beetroot", "Carrot", "Celeriac", "Apple", "Pear", "Cauliflower"],
  // Nov
  ["Pumpkin", "Kale", "Cabbage", "Brussels sprouts", "Leek", "Celeriac", "Beetroot", "Carrot", "Mushrooms", "Apple"],
  // Dec
  ["Kale", "Brussels sprouts", "Cabbage", "Leek", "Celeriac", "Beetroot", "Carrot", "Mushrooms", "Apple", "Pear"],
];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Build the seasonal context for "now": a friendly month label (e.g.
// "early July"), the full in-season produce list for the chef, and a short
// headline list for the UI chip.
function buildSeasonContext(date = new Date()) {
  const m = date.getMonth();
  const dom = date.getDate();
  const part = dom <= 10 ? "early" : dom <= 20 ? "mid" : "late";
  const produce = SEASONAL_PRODUCE[m];
  return {
    monthName: `${part} ${MONTH_NAMES[m]}`,
    seasonalHint: produce.join(", "),
    headline: produce.slice(0, 5),
  };
}

const TIME_LABELS = {
  "5": "≤5 min",
  "15": "≤15 min",
  "30": "≤30 min",
  "60": "30+ min",
};

// Subtle color signal on prep-time chips — readable on pastel backgrounds.
// Values are CSS vars so the dark-mode block can lighten them for the
// darkened tiles (see index.css).
const TIME_COLORS = {
  "5": "var(--time-5)",   // green — no-cook
  "15": "var(--time-15)", // amber — moderate
  "30": "var(--time-30)", // orange — slow
  "60": "var(--time-60)", // red-brown — long-cook
};

// Ingredient section order on the consolidated grocery list. Matches the
// enum in api/generate-meals.js MEAL_SCHEMA — the API tags every ingredient
// with one of these, so the data is already aisle-sortable at the source.
const SECTION_ORDER = ["Produce", "Meat & Fish", "Dairy & Eggs", "Pantry", "Frozen", "Bakery", "Other"];

// Modifier prefixes/suffixes the LLM tends to inject ("Canned", "Frozen",
// "Tiefkühl-", " Spice Blend", " Aus Der Dose", etc.). These get stripped
// before alias lookup so "Frozen Edamame" and "Tiefkühl-Edamame" both
// collapse to plain "Edamame".
const MODIFIER_PREFIXES = [
  "canned ", "frozen ", "fresh ", "raw ", "dried ", "ground ", "cooked ", "boiled ", "roasted ",
  "tiefkühl-", "tiefkühl ", "gefroren ", "gefrorene ", "gefrorener ", "gefrorenes ",
  "frisch ", "frische ", "frischer ", "frisches ",
  "getrocknet ", "getrocknete ", "getrockneter ", "getrocknetes ",
  "gekocht ", "gekochte ", "gekochter ", "gekochtes ",
  "gemahlen ", "gemahlene ", "gemahlener ", "gemahlenes ",
  "geröstet ", "geröstete ", "gerösteter ", "geröstetes ",
];
const MODIFIER_SUFFIXES = [
  " spice blend", " spice mix", " wraps", " chunks",
  " in wasser", " in water", " in eigenem saft", " in eigenem öl",
  " aus der dose", " (aus der dose)",
  " wheat", " grain", " gemahlen", " ungesalzen", " ungeschält",
];

// Curated alias map for grocery-list dedup. Keys are stripped-+-lowercased
// variants; values are the canonical ENGLISH display name. The LLM is
// instructed to use English names but legacy data + occasional drift
// produce German / mixed-language variants — all collapse here.
const INGREDIENT_ALIAS = {
  // Produce
  "banana": "Banana", "banane": "Banana", "bananas": "Banana",
  "cucumber": "Cucumber", "gurke": "Cucumber",
  "garlic": "Garlic", "knoblauch": "Garlic",
  "ginger": "Ginger", "fresh ginger": "Ginger", "ingwer": "Ginger",
  "parsley": "Parsley", "fresh parsley": "Parsley", "petersilie": "Parsley",
  "lemon juice": "Lemon juice", "zitronensaft": "Lemon juice",
  "lemon": "Lemon", "zitrone": "Lemon",
  "red onion": "Red onion", "rote zwiebel": "Red onion",
  "onion": "Onion", "zwiebel": "Onion",
  "bell pepper": "Bell pepper", "paprika": "Bell pepper", "peppers": "Bell pepper",
  "cherry tomatoes": "Cherry tomatoes", "kirschtomaten": "Cherry tomatoes", "cherrytomaten": "Cherry tomatoes",
  "tomato": "Tomato", "tomate": "Tomato", "tomaten": "Tomato",
  "chopped tomatoes": "Chopped tomatoes", "canned chopped tomatoes": "Chopped tomatoes", "diced tomatoes": "Chopped tomatoes", "tomatenstücke": "Chopped tomatoes",
  "spring onions": "Spring onions", "scallions": "Spring onions", "frühlingszwiebeln": "Spring onions", "green onions": "Spring onions",
  "baby spinach": "Baby spinach", "babyspinat": "Baby spinach",
  "spinach": "Spinach", "spinat": "Spinach",
  "zucchini": "Zucchini",
  "mango": "Mango",
  "chives": "Chives", "schnittlauch": "Chives",
  "avocado": "Avocado",
  "broccoli": "Broccoli", "brokkoli": "Broccoli",
  "pak choi": "Pak choi", "bok choy": "Pak choi",
  "carrot": "Carrot", "carrots": "Carrot", "karotte": "Carrot",
  "pineapple": "Pineapple", "ananas": "Pineapple",
  "mixed berries": "Mixed berries", "beerenmischung": "Mixed berries", "berries": "Mixed berries", "beeren": "Mixed berries",
  "apple": "Apple", "äpfel": "Apple", "apfel": "Apple",
  "pear": "Pear", "birne": "Pear",
  "lime": "Lime", "limette": "Lime",
  "cilantro": "Cilantro", "coriander": "Cilantro", "koriander": "Cilantro",
  "basil": "Basil", "basilikum": "Basil",
  "mint": "Mint", "minze": "Mint",
  "dill": "Dill",
  "rosemary": "Rosemary", "rosmarin": "Rosemary",
  "thyme": "Thyme", "thymian": "Thyme",
  "oregano": "Oregano",
  "cauliflower": "Cauliflower", "blumenkohl": "Cauliflower",
  "kale": "Kale", "grünkohl": "Kale",
  "potato": "Potato", "potatoes": "Potato", "kartoffel": "Potato", "kartoffeln": "Potato",
  "sweet potato": "Sweet potato", "süßkartoffel": "Sweet potato",
  "mushrooms": "Mushrooms", "champignons": "Mushrooms", "pilze": "Mushrooms",
  "eggplant": "Eggplant", "aubergine": "Eggplant",

  // Meat & Fish
  "chicken breast": "Chicken breast", "hähnchenbrust": "Chicken breast",
  "chicken thigh": "Chicken thighs", "chicken thighs": "Chicken thighs", "hähnchenschenkel": "Chicken thighs",
  "turkey breast": "Turkey breast", "putenbrust": "Turkey breast", "turkey": "Turkey breast",
  "salmon fillet": "Salmon fillet", "salmon": "Salmon fillet", "lachsfilet": "Salmon fillet", "lachs": "Salmon fillet",
  "tuna": "Tuna", "canned tuna": "Tuna", "thunfisch": "Tuna",
  "beef": "Beef", "lean beef": "Beef", "rindfleisch": "Beef",
  "lamb mince": "Lamb mince", "lean lamb mince": "Lamb mince", "lammhackfleisch": "Lamb mince", "ground lamb": "Lamb mince",
  "ground beef": "Ground beef", "beef mince": "Ground beef", "rinderhack": "Ground beef", "hackfleisch": "Ground beef",
  "ground turkey": "Ground turkey", "putenhack": "Ground turkey", "turkey mince": "Ground turkey",
  "shrimp": "Shrimp", "garnelen": "Shrimp", "prawns": "Shrimp",
  "cod": "Cod", "kabeljau": "Cod",
  "white fish": "White fish", "weißer fisch": "White fish",

  // Dairy & Eggs
  "skyr": "Skyr",
  "cottage cheese": "Cottage cheese", "hüttenkäse": "Cottage cheese",
  "quark": "Quark", "magerquark": "Quark", "low-fat quark": "Quark",
  "feta": "Feta", "feta cheese": "Feta",
  "mozzarella": "Mozzarella",
  "milk": "Milk", "milch": "Milk", "low-fat milk": "Milk",
  "eggs": "Eggs", "egg": "Eggs", "eier": "Eggs",
  "egg whites": "Egg whites", "eiweiß": "Egg whites", "eiweiss": "Egg whites",
  "greek yogurt": "Greek yogurt", "griechischer joghurt": "Greek yogurt",
  "natural yogurt": "Natural yogurt", "naturjoghurt": "Natural yogurt", "plain yogurt": "Natural yogurt",
  "yogurt": "Yogurt", "joghurt": "Yogurt",
  "parmesan": "Parmesan",
  "halloumi": "Halloumi",

  // Grains & carbs
  "oats": "Oats", "rolled oats": "Oats", "haferflocken": "Oats",
  "rice": "Rice", "reis": "Rice", "white rice": "Rice",
  "jasmine rice": "Jasmine rice", "jasminreis": "Jasmine rice",
  "brown rice": "Brown rice", "vollkornreis": "Brown rice",
  "basmati rice": "Basmati rice", "basmatireis": "Basmati rice",
  "bulgur": "Bulgur", "bulgur wheat": "Bulgur",
  "lentils": "Lentils", "linsen": "Lentils",
  "beluga lentils": "Beluga lentils", "beluga linsen": "Beluga lentils", "beluga-linsen": "Beluga lentils",
  "chickpeas": "Chickpeas", "canned chickpeas": "Chickpeas", "kichererbsen": "Chickpeas",
  "white beans": "White beans", "weiße bohnen": "White beans", "cannellini beans": "White beans",
  "black beans": "Black beans", "schwarze bohnen": "Black beans",
  "kidney beans": "Kidney beans", "kidneybohnen": "Kidney beans",
  "edamame": "Edamame",
  "soba noodles": "Soba noodles", "sobanudeln": "Soba noodles", "soba-nudeln": "Soba noodles",
  "rice noodles": "Rice noodles", "reisnudeln": "Rice noodles",
  "whole grain bread": "Whole grain bread", "vollkornbrot": "Whole grain bread", "whole wheat bread": "Whole grain bread",
  "whole grain tortilla": "Whole grain tortilla", "vollkorn-tortilla": "Whole grain tortilla", "whole wheat tortilla": "Whole grain tortilla", "tortilla": "Whole grain tortilla",
  "protein bread": "Protein bread", "eiweißbrot": "Protein bread", "eiweissbrot": "Protein bread",
  "tofu": "Tofu", "firm tofu": "Tofu", "fester tofu": "Tofu",
  "tabbouleh": "Tabbouleh",
  "couscous": "Couscous",
  "quinoa": "Quinoa",
  "pasta": "Pasta", "nudeln": "Pasta",
  "polenta": "Polenta",

  // Fats, oils, nuts, seeds
  "olive oil": "Olive oil", "olivenöl": "Olive oil",
  "sesame oil": "Sesame oil", "sesamöl": "Sesame oil",
  "coconut oil": "Coconut oil", "kokosöl": "Coconut oil",
  "walnuts": "Walnuts", "walnut": "Walnuts", "walnüsse": "Walnuts",
  "almonds": "Almonds", "mandeln": "Almonds",
  "cashews": "Cashews", "cashewkerne": "Cashews",
  "peanuts": "Peanuts", "erdnüsse": "Peanuts",
  "pumpkin seeds": "Pumpkin seeds", "kürbiskerne": "Pumpkin seeds",
  "sunflower seeds": "Sunflower seeds", "sonnenblumenkerne": "Sunflower seeds",
  "chia seeds": "Chia seeds", "chia samen": "Chia seeds", "chia-samen": "Chia seeds", "chiasamen": "Chia seeds",
  "flax seeds": "Flax seeds", "leinsamen": "Flax seeds",
  "peanut butter": "Peanut butter", "erdnussbutter": "Peanut butter",
  "almond butter": "Almond butter", "mandelbutter": "Almond butter",
  "tahini": "Tahini",

  // Pantry / condiments
  "honey": "Honey", "honig": "Honey",
  "maple syrup": "Maple syrup", "ahornsirup": "Maple syrup",
  "soy sauce": "Soy sauce", "sojasauce": "Soy sauce", "sojasoße": "Soy sauce", "soja sauce": "Soy sauce",
  "tomato paste": "Tomato paste", "tomatenmark": "Tomato paste",
  "hummus": "Hummus",
  "dijon mustard": "Dijon mustard", "senf": "Dijon mustard", "mustard": "Dijon mustard",
  "vinegar": "Vinegar", "essig": "Vinegar", "apple cider vinegar": "Apple cider vinegar", "balsamic vinegar": "Balsamic vinegar", "balsamico": "Balsamic vinegar",
  "whey protein": "Whey protein", "whey protein powder": "Whey protein", "molkenprotein": "Whey protein", "protein pulver": "Whey protein",
  "smoked salmon": "Smoked salmon", "räucherlachs": "Smoked salmon", "raucherlachs": "Smoked salmon",
  "rice cakes": "Rice cakes", "rice cake": "Rice cakes", "reiswaffeln": "Rice cakes",
  "labneh": "Quark", "ricotta": "Ricotta",

  // Herbs / spices
  "salt": "Salt", "salz": "Salt",
  "pepper": "Pepper", "black pepper": "Pepper", "pfeffer": "Pepper",
  "salt and pepper": "Salt and pepper", "salz und pfeffer": "Salt and pepper",
  "cumin": "Cumin", "kreuzkümmel": "Cumin", "ground cumin": "Cumin",
  "paprika powder": "Paprika powder", "paprikapulver": "Paprika powder", "sweet paprika": "Paprika powder", "smoked paprika": "Smoked paprika",
  "cinnamon": "Cinnamon", "zimt": "Cinnamon",
  "chili flakes": "Chili flakes", "chiliflocken": "Chili flakes",
  "chili powder": "Chili powder", "chilipulver": "Chili powder",
  "ras el hanout": "Ras el hanout", "ras-el-hanout": "Ras el hanout",
  "za'atar": "Za'atar", "zaatar": "Za'atar",
  "garam masala": "Garam masala",
  "turmeric": "Turmeric", "kurkuma": "Turmeric",
  "curry powder": "Curry powder", "currypulver": "Curry powder",
  "oregano dried": "Oregano",
  "bay leaves": "Bay leaves", "lorbeerblätter": "Bay leaves",
  "sage": "Sage", "salbei": "Sage",
  "baking powder": "Baking powder", "backpulver": "Baking powder",
  "vanilla": "Vanilla", "vanille": "Vanilla",
  "harissa": "Harissa",
  "coconut milk": "Coconut milk", "kokosmilch": "Coconut milk",

  // Seasonal produce (Central Europe) — keep cart clean as the chef cooks
  // with what's fresh each month
  "asparagus": "Asparagus", "spargel": "Asparagus",
  "strawberries": "Strawberries", "strawberry": "Strawberries", "erdbeeren": "Strawberries",
  "cherries": "Cherries", "cherry": "Cherries", "kirschen": "Cherries",
  "plums": "Plums", "plum": "Plums", "pflaumen": "Plums", "zwetschgen": "Plums",
  "peaches": "Peaches", "peach": "Peaches", "pfirsiche": "Peaches",
  "apricots": "Apricots", "apricot": "Apricots", "aprikosen": "Apricots",
  "grapes": "Grapes", "trauben": "Grapes", "weintrauben": "Grapes",
  "rhubarb": "Rhubarb", "rhabarber": "Rhubarb",
  "green beans": "Green beans", "grüne bohnen": "Green beans", "string beans": "Green beans",
  "peas": "Peas", "erbsen": "Peas", "garden peas": "Peas",
  "leek": "Leek", "leeks": "Leek", "lauch": "Leek", "porree": "Leek",
  "cabbage": "Cabbage", "weißkohl": "Cabbage", "kohl": "Cabbage",
  "brussels sprouts": "Brussels sprouts", "rosenkohl": "Brussels sprouts",
  "fennel": "Fennel", "fenchel": "Fennel",
  "chard": "Chard", "mangold": "Chard", "swiss chard": "Chard",
  "beetroot": "Beetroot", "beets": "Beetroot", "rote bete": "Beetroot", "rote beete": "Beetroot",
  "celeriac": "Celeriac", "sellerie": "Celeriac", "celery root": "Celeriac",
  "radishes": "Radishes", "radish": "Radishes", "radieschen": "Radishes",
  "kohlrabi": "Kohlrabi",
  "pumpkin": "Pumpkin", "squash": "Pumpkin", "butternut squash": "Pumpkin", "kürbis": "Pumpkin",
  "corn": "Corn", "sweetcorn": "Corn", "mais": "Corn",
  "new potatoes": "New potatoes", "neue kartoffeln": "New potatoes",
  "lettuce": "Lettuce", "salat": "Lettuce", "green salad": "Lettuce", "mixed leaves": "Lettuce",
  "pork tenderloin": "Pork tenderloin", "schweinefilet": "Pork tenderloin", "pork": "Pork tenderloin", "schweinelende": "Pork tenderloin",
};

// Unit-family map for same-family auto-conversion. Cross-family dupes
// (weight vs volume vs count) stay as separate cart rows since converting
// requires per-ingredient density.
const UNIT_INFO = {
  g:     { family: "weight", toBase: 1 },
  kg:    { family: "weight", toBase: 1000 },
  ml:    { family: "volume", toBase: 1 },
  l:     { family: "volume", toBase: 1000 },
  tsp:   { family: "volume", toBase: 5 },
  tbsp:  { family: "volume", toBase: 15 },
  piece: { family: "count",  toBase: 1 },
};

// Convert qty from one unit to another within the same family.
// Returns null if conversion isn't possible (different families or unknown unit).
function convertUnit(qty, fromUnit, toUnit) {
  const from = UNIT_INFO[fromUnit];
  const to = UNIT_INFO[toUnit];
  if (!from || !to || from.family !== to.family) return null;
  return (qty * from.toBase) / to.toBase;
}

// Round to 1 decimal for display; drop trailing .0.
function roundQty(qty) {
  const r = Math.round(qty * 10) / 10;
  return r;
}

// Same idea as consolidateGrocery but for the pantry array: merge entries
// sharing a canonical name into a single row in the largest same-family
// unit used. Used both for cleaning up historical pantry dupes on load
// and for merging on every addToPantry call.
function consolidatePantry(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  // Pass 1: pick the largest unit per canonical name (across all sections).
  const preferred = {};
  for (const p of items) {
    const cname = canonicalName(p.item || "").toLowerCase();
    const unit = p.unit || "";
    if (!UNIT_INFO[unit] || !cname) continue;
    const current = preferred[cname];
    if (!current) {
      preferred[cname] = unit;
    } else if (
      UNIT_INFO[current] &&
      UNIT_INFO[current].family === UNIT_INFO[unit].family &&
      UNIT_INFO[unit].toBase > UNIT_INFO[current].toBase
    ) {
      preferred[cname] = unit;
    }
  }

  // Pass 2: merge by (cname, unit). Cross-family dupes (Ingwer g vs tsp)
  // stay as separate rows since weight↔volume conversion needs density.
  const buckets = {};
  for (const p of items) {
    const display = canonicalName(p.item || "");
    const cname = display.toLowerCase();
    if (!cname) continue;
    let qty = p.qty || 0;
    let unit = p.unit || "";
    const target = preferred[cname];
    if (target && target !== unit) {
      const converted = convertUnit(qty, unit, target);
      if (converted !== null) {
        qty = converted;
        unit = target;
      }
    }
    const key = `${cname}|${unit}`;
    if (buckets[key]) {
      buckets[key].qty += qty;
    } else {
      buckets[key] = { ...p, item: display, qty, unit };
    }
  }

  return Object.values(buckets).map((b) => ({ ...b, qty: roundQty(b.qty) }));
}

// Strip parenthetical clarifications, prep-state prefixes, ingredient
// suffixes, and collapse whitespace. Pipeline:
//   1. Drop everything inside "(...)" — "Hähnchenbrust (Pre-Cooked)" → "Hähnchenbrust"
//   2. Drop the first matching MODIFIER_PREFIX — "Canned Chickpeas" → "Chickpeas"
//   3. Drop the first matching MODIFIER_SUFFIX — "Bulgur Wheat" → "Bulgur"
function stripModifiers(s) {
  let cleaned = (s || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  const lower = cleaned.toLowerCase();
  for (const p of MODIFIER_PREFIXES) {
    if (lower.startsWith(p)) {
      cleaned = cleaned.slice(p.length).trim();
      break;
    }
  }
  const lower2 = cleaned.toLowerCase();
  for (const sfx of MODIFIER_SUFFIXES) {
    if (lower2.endsWith(sfx)) {
      cleaned = cleaned.slice(0, cleaned.length - sfx.length).trim();
      break;
    }
  }
  return cleaned;
}

// Apply the strip pipeline + alias map to collapse EN/DE variants,
// paren-decorated forms, and prep-state-modified names into one canonical
// (German) display name. Unmatched items fall through unchanged after
// stripping.
function canonicalName(item) {
  const cleaned = stripModifiers(item);
  const key = cleaned.toLowerCase();
  return INGREDIENT_ALIAS[key] || cleaned;
}

// Aggregate all 28 meals' ingredients into one list per section.
// Items with the same canonical name AND a convertible unit (volume↔volume,
// weight↔weight) merge into a single row, converted to the LARGEST unit in
// the family that was used (so Sesamöl tsp+tbsp shows as tbsp, not tsp).
// Cross-family dupes (Ingwer 80g vs Ingwer 1 tsp) stay as separate rows
// since weight↔volume conversion needs per-ingredient density.
// Pantry items subtract the same way.
function consolidateGrocery(meals, pantry = []) {
  // Pass 1: pick the preferred unit per (section, canonical-name) — the
  // largest unit in any unit family that was used.
  const preferredUnit = {}; // section → cname → unit
  const considerUnit = (section, cname, unit) => {
    if (!UNIT_INFO[unit]) return;
    if (!preferredUnit[section]) preferredUnit[section] = {};
    const current = preferredUnit[section][cname];
    if (!current) {
      preferredUnit[section][cname] = unit;
    } else if (
      UNIT_INFO[current] &&
      UNIT_INFO[current].family === UNIT_INFO[unit].family &&
      UNIT_INFO[unit].toBase > UNIT_INFO[current].toBase
    ) {
      preferredUnit[section][cname] = unit;
    }
  };
  for (const day of DAYS) {
    for (const slot of SLOTS) {
      const m = meals[`${day}-${slot}`];
      if (!m?.ingredients?.length) continue;
      for (const ing of m.ingredients) {
        considerUnit(ing.section || "Other", canonicalName(ing.item).toLowerCase(), ing.unit || "");
      }
    }
  }

  // Pass 2: aggregate into the preferred unit. Cross-family rows fall into
  // separate buckets keyed by `${cname}|${unit}`.
  const buckets = {};
  for (const day of DAYS) {
    for (const slot of SLOTS) {
      const m = meals[`${day}-${slot}`];
      if (!m?.ingredients?.length) continue;
      for (const ing of m.ingredients) {
        const section = ing.section || "Other";
        const display = canonicalName(ing.item);
        const cname = display.toLowerCase();
        let qty = ing.qty || 0;
        let unit = ing.unit || "";
        const target = preferredUnit[section]?.[cname];
        if (target && target !== unit) {
          const converted = convertUnit(qty, unit, target);
          if (converted !== null) {
            qty = converted;
            unit = target;
          }
          // else: different family — keep original unit, separate bucket
        }
        const key = `${cname}|${unit}`;
        if (!buckets[section]) buckets[section] = {};
        if (buckets[section][key]) {
          buckets[section][key].qty += qty;
        } else {
          buckets[section][key] = { ...ing, item: display, cname, qty, unit, key };
        }
      }
    }
  }

  // Pantry subtraction — convert pantry qty into the matching bucket's unit
  // when possible; cross-family pantry items just don't subtract.
  for (const p of pantry) {
    const cname = canonicalName(p.item).toLowerCase();
    const qty = p.qty || 0;
    const unit = p.unit || "";
    let subtracted = false;
    for (const section of Object.keys(buckets)) {
      if (subtracted) break;
      for (const key of Object.keys(buckets[section])) {
        const entry = buckets[section][key];
        if (entry.cname !== cname) continue;
        const converted = convertUnit(qty, unit, entry.unit);
        if (converted === null) continue;
        entry.qty -= converted;
        if (entry.qty <= 0) delete buckets[section][key];
        subtracted = true;
        break;
      }
    }
  }

  return SECTION_ORDER
    .filter((s) => buckets[s] && Object.keys(buckets[s]).length > 0)
    .map((section) => ({
      section,
      items: Object.values(buckets[section])
        .map((it) => ({ ...it, qty: roundQty(it.qty) }))
        .sort((a, b) => a.item.localeCompare(b.item)),
    }));
}

const UNITS = ["g", "ml", "piece", "tbsp", "tsp"];
const EMPTY_PANTRY_DRAFT = { item: "", qty: "", unit: "g", section: "Produce" };

// Drop junk/placeholder meal entries that can linger in storage from
// interrupted generations or old test data (e.g. "dummy3", "Placeholder2",
// 0–1 kcal stubs). A real meal always has a sensible name and kcal. Cleaning
// on load means stale cubes vanish on the next page refresh — no manual reset.
const JUNK_NAME = /^(dummy|placeholder|filler|test|todo|tbd|x)\b/i;
function sanitizeMeals(meals) {
  if (!meals || typeof meals !== "object") return {};
  const clean = {};
  for (const [k, m] of Object.entries(meals)) {
    if (!m || typeof m !== "object") continue;
    const name = (m.name || "").trim();
    if (!name || JUNK_NAME.test(name)) continue;
    if (!(Number(m.kcal) >= 20)) continue;
    clean[k] = m;
  }
  return clean;
}

// ── Tiny presentational helpers ───────────────────────────────────────

// Animate a number from its previous value to `target` with ease-out cubic.
// Skipped entirely (jumps straight to target) under prefers-reduced-motion.
function useCountUp(target, duration = 700) {
  const safeTarget = Number.isFinite(Number(target)) ? Number(target) : 0;
  const [display, setDisplay] = useState(safeTarget);
  const prevRef = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(safeTarget);
      prevRef.current = safeTarget;
      return;
    }
    const from = prevRef.current;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (safeTarget - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = safeTarget;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [safeTarget, duration]);
  return display;
}

function Button({ variant = "primary", className = "", children, ...props }) {
  const base =
    "btn-spring inline-flex items-center justify-center gap-2 rounded-md font-medium text-sm leading-tight px-[18px] py-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
  const styles = {
    primary: "bg-primary text-white hover:bg-primary-pressed",
    dark: "bg-ink-deep text-white hover:opacity-90",
    secondary:
      "bg-transparent text-ink border border-hairline-strong hover:bg-surface-soft",
    "secondary-on-dark":
      "bg-transparent text-white border border-white/30 hover:bg-white/10",
    ghost:
      "bg-transparent text-ink px-3 py-2 rounded-sm hover:bg-surface-soft",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

function IconButton({ label, onClick, children, className = "" }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`btn-spring w-10 h-10 inline-flex items-center justify-center rounded-md text-charcoal hover:bg-surface-soft transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

function Eyebrow({ children, className = "" }) {
  return (
    <div
      className={`text-[11px] font-semibold uppercase tracking-[0.08em] text-stone ${className}`}
    >
      {children}
    </div>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full h-11 px-4 rounded-md bg-canvas text-ink border border-hairline-strong text-sm focus:outline-none focus:border-primary focus:border-2 focus:px-[15px] transition-colors ${props.className || ""}`}
    />
  );
}

function MacroStat({ label, value, unit, target }) {
  const animated = useCountUp(value);
  return (
    <div className="px-5 py-4">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1 text-3xl font-semibold tnum text-ink leading-none">
        {animated.toLocaleString()}
        {unit && <span className="text-base font-normal text-steel ml-0.5">{unit}</span>}
      </div>
      {target != null && (
        <div className="mt-1.5 text-xs text-steel tnum">target {target}{unit || ""}</div>
      )}
    </div>
  );
}

function TimeChip({ prep }) {
  if (!prep) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold tnum"
      style={{ color: TIME_COLORS[prep] }}
    >
      <Clock size={9} strokeWidth={2.5} />
      {TIME_LABELS[prep]}
    </span>
  );
}

function MealTile({ slot, meal, isRegen, hero = false, onClick, onRegen }) {
  return (
    <button
      onClick={meal ? onClick : undefined}
      disabled={!meal}
      className={`tile-lift group relative w-full text-left rounded-md border border-transparent disabled:cursor-default ${hero ? "p-4" : "p-3"}`}
      style={{ background: SLOT_TINTS[slot] }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`font-semibold uppercase tracking-[0.1em] text-charcoal/70 ${hero ? "text-[11px]" : "text-[10px]"}`}>
          {SLOT_LABELS[slot]}
        </span>
        {meal?.prep_time && <TimeChip prep={meal.prep_time} />}
      </div>

      {isRegen ? (
        <div className="flex items-center gap-2 text-xs text-charcoal/70 py-1">
          <Loader2 size={12} className="animate-spin" /> Reworking…
        </div>
      ) : meal ? (
        <>
          <div className={`font-medium leading-snug text-charcoal min-h-[2.5em] ${hero ? "text-[15px]" : "text-[13px]"}`}>
            {meal.name}
          </div>
          <div className={`mt-1.5 flex items-center justify-between font-semibold text-charcoal/80 tnum ${hero ? "text-xs" : "text-[11px]"}`}>
            <span className="inline-flex items-center gap-1">
              <Flame size={10} />{meal.kcal} kcal
            </span>
            <span className="inline-flex items-center gap-1">
              <Beef size={10} />{meal.protein_g}g
            </span>
          </div>
          {onRegen && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onRegen(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onRegen(); } }}
              className="absolute top-1.5 right-1.5 w-6 h-6 inline-flex items-center justify-center rounded-sm bg-white/60 text-charcoal opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              title="Regenerate this meal"
            >
              <RefreshCw size={11} />
            </span>
          )}
        </>
      ) : (
        <div className="text-xs text-charcoal/40">—</div>
      )}
    </button>
  );
}

function DayCard({ dayIndex, day, isToday, kcal, protein, carbs, fat, meals, regenKey, hero = false, onOpenMeal, onRegen }) {
  return (
    <article
      className={`bg-canvas rounded-lg border border-hairline flex flex-col gap-3 hover:shadow-s2 pop-in card-lift ${hero ? "p-5" : "p-4"}`}
      style={{ animationDelay: `${dayIndex * 60}ms` }}
    >
      <header className="flex items-baseline justify-between gap-2 pb-2.5 border-b border-hairline-soft">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-semibold text-ink tracking-[-0.2px] ${hero ? "text-xl" : "text-lg"}`}>{day}</span>
          {isToday && (
            <span className="pulse-today px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-semibold uppercase tracking-[0.08em] leading-none">
              Today
            </span>
          )}
        </div>
        <div className="text-right text-[11px] text-steel font-medium leading-tight tnum">
          <div className="text-ink font-semibold">{kcal.toLocaleString()} kcal</div>
          <div>{protein}g protein</div>
          <div className="text-stone">C {carbs} · F {fat}</div>
        </div>
      </header>

      <div className={`grid gap-2 ${hero ? "grid-cols-2" : "grid-cols-1"}`}>
        {SLOTS.map((slot) => {
          const k = `${day}-${slot}`;
          return (
            <MealTile
              key={slot}
              slot={slot}
              meal={meals[k]}
              isRegen={regenKey === k}
              hero={hero}
              onClick={() => onOpenMeal(k)}
              onRegen={meals[k] ? () => onRegen(k) : null}
            />
          );
        })}
      </div>
    </article>
  );
}

// Placeholder card shown while a day is still cooking during parallel
// generation — surfaces the blueprint's concept so the wait is a menu
// preview, not dead time.
function PendingDayCard({ day, dayIndex, isToday, plan }) {
  return (
    <article
      className="bg-canvas rounded-lg border border-dashed border-hairline-strong p-4 flex flex-col gap-3 pop-in"
      style={{ animationDelay: `${dayIndex * 60}ms` }}
      aria-label={`${day} — cooking`}
    >
      <header className="flex items-baseline justify-between gap-2 pb-2.5 border-b border-hairline-soft">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg font-semibold text-ink tracking-[-0.2px]">{day}</span>
          {isToday && (
            <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-semibold uppercase tracking-[0.08em] leading-none">
              Today
            </span>
          )}
        </div>
        <Loader2 size={14} className="animate-spin text-primary shrink-0" />
      </header>

      {plan?.concept ? (
        <div className="flex flex-col gap-2.5">
          <div className="p-3 rounded-md bg-surface-soft">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone mb-1">
              On the menu
            </div>
            <p className="text-[13px] leading-snug text-slate italic">{plan.concept}</p>
          </div>
          {plan.breakfastIdea && (
            <div className="text-[11px] text-steel leading-snug">
              <span className="font-semibold uppercase tracking-[0.08em] text-stone text-[10px]">Breakfast · </span>
              {plan.breakfastIdea}
            </div>
          )}
          {plan.snackIdea && (
            <div className="text-[11px] text-steel leading-snug">
              <span className="font-semibold uppercase tracking-[0.08em] text-stone text-[10px]">Snack · </span>
              {plan.snackIdea}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-stone">
            <span className="shimmer-dot" />
            cooking…
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-md shimmer-block" />
          ))}
        </div>
      )}
    </article>
  );
}

function Modal({ open, onClose, children, maxWidth = "max-w-lg" }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 scrim-in"
      style={{ background: "var(--scrim)" }}
      onClick={onClose}
    >
      <div
        className={`${maxWidth} w-full max-h-[90vh] overflow-y-auto bg-canvas rounded-lg border border-hairline shadow-s4 modal-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <div className="flex items-center justify-between p-6 pb-4 border-b border-hairline-soft">
      <h2 className="text-xl font-semibold text-ink tracking-[-0.3px]">{title}</h2>
      <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
    </div>
  );
}

function SidebarSection({ title, children }) {
  return (
    <div className="mb-4">
      <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-stone">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarItem({ icon: Icon, label, subtitle, active, onClick, dotColor }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`nav-nudge w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-left ${active ? "bg-surface-soft text-ink" : "text-charcoal hover:bg-surface-soft"}`}
    >
      {Icon && <Icon size={16} strokeWidth={2} className={active ? "text-ink" : "text-steel"} />}
      <span className="flex-1 min-w-0">
        <span className="block truncate">{label}</span>
        {subtitle && <span className="block truncate text-[11px] font-normal leading-tight text-steel">{subtitle}</span>}
      </span>
      {dotColor && (
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
      )}
    </button>
  );
}

function Sidebar({
  view, setView, activeProgramId, switchProgram,
  onSettings, onSync, onGenerate, hasMeals, loading,
  sidebarOpen, onCloseSidebar,
}) {
  return (
    <>
      {/* Mobile scrim */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={onCloseSidebar}
        />
      )}
      <aside
        aria-label="Sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-60 bg-surface border-r border-hairline flex flex-col transform transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-hairline">
          <a href="/" className="flex items-center gap-2.5 select-none">
            <span className="w-7 h-7 rounded-sm bg-ink-deep text-white grid place-items-center text-base font-bold leading-none">M</span>
            <span className="text-[18px] font-semibold tracking-[-0.4px] text-ink">Meals</span>
          </a>
          <button
            className="lg:hidden text-charcoal p-1 hover:bg-surface-soft rounded-sm"
            onClick={onCloseSidebar}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2.5 py-4">
          <SidebarSection title="Workspace">
            <SidebarItem icon={Calendar} label="This week" active={view === "plan"} onClick={() => { setView("plan"); onCloseSidebar(); }} />
            <SidebarItem icon={ShoppingCart} label="Grocery list" active={view === "grocery"} onClick={() => { setView("grocery"); onCloseSidebar(); }} />
            <SidebarItem icon={Package} label="Pantry" active={view === "pantry"} onClick={() => { setView("pantry"); onCloseSidebar(); }} />
          </SidebarSection>

          <SidebarSection title="Programs">
            <SidebarItem icon={Flame} label="Cut" subtitle="lose weight" active={activeProgramId === "cut"} onClick={() => switchProgram("cut")} dotColor={activeProgramId === "cut" ? "var(--primary)" : null} />
            <SidebarItem icon={Dumbbell} label="Maintain" subtitle="hold weight" active={activeProgramId === "maintain"} onClick={() => switchProgram("maintain")} dotColor={activeProgramId === "maintain" ? "var(--primary)" : null} />
            <SidebarItem icon={TrendingUp} label="Lean bulk" subtitle="gain muscle" active={activeProgramId === "leanbulk"} onClick={() => switchProgram("leanbulk")} dotColor={activeProgramId === "leanbulk" ? "var(--primary)" : null} />
          </SidebarSection>

          <SidebarSection title="Tools">
            <SidebarItem icon={MessageCircle} label="Coach" active={view === "coach"} onClick={() => { setView("coach"); onCloseSidebar(); }} />
          </SidebarSection>
        </nav>

        <div className="border-t border-hairline p-3 flex items-center gap-1">
          <IconButton label="Settings" onClick={onSettings}><SettingsIcon size={18} /></IconButton>
          <IconButton label="Transfer" onClick={onSync}><Share2 size={18} /></IconButton>
          <button
            onClick={onGenerate}
            disabled={loading}
            className={`btn-spring ml-auto inline-flex items-center justify-center gap-2 rounded-md font-medium text-sm leading-tight px-3 py-2 bg-primary text-white hover:bg-primary-pressed transition-colors disabled:opacity-50 ${loading ? "generating" : ""}`}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {hasMeals ? "Regenerate" : "Generate"}
          </button>
        </div>
      </aside>
    </>
  );
}

function ComingSoon({ icon: Icon, title, description }) {
  return (
    <div className="py-16 sm:py-24 text-center fade-in">
      <div className="w-16 h-16 mx-auto mb-5 rounded-lg bg-surface-soft grid place-items-center text-stone">
        {Icon && <Icon size={28} />}
      </div>
      <h2 className="text-2xl font-semibold text-ink tracking-[-0.3px]">{title}</h2>
      <p className="mt-2 text-sm text-slate max-w-[420px] mx-auto leading-relaxed">{description}</p>
      <div className="mt-5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tint-lavender text-brand-purple-800 text-[11px] font-semibold uppercase tracking-[0.08em]">
        Coming next
      </div>
    </div>
  );
}

// The four top-level views, in tab order for the mobile bottom bar.
const TABS = [
  { id: "plan", label: "This week", icon: Calendar },
  { id: "grocery", label: "Cart", icon: ShoppingCart },
  { id: "pantry", label: "Pantry", icon: Package },
  { id: "coach", label: "Coach", icon: MessageCircle },
];

// Fixed bottom tab bar — mobile only (desktop uses the sidebar). One thumb-tap
// per top-level view. Sits above the iPhone home indicator via safe-area inset.
// Programs + Settings/Transfer stay behind the hamburger drawer.
function BottomTabBar({ view, setView }) {
  return (
    <nav
      aria-label="Views"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-canvas/95 backdrop-blur border-t border-hairline flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            onClick={() => setView(id)}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            className={`btn-spring flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 min-h-[54px] text-[10px] font-semibold tracking-[0.02em] transition-colors ${active ? "text-primary" : "text-stone hover:text-charcoal"}`}
          >
            <Icon size={21} strokeWidth={active ? 2.5 : 2} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

// Horizontal day switcher for the mobile Plan view — today-first, scrollable.
// Pills show a dot for today and a spinner for days still cooking.
function DayPills({ days, today, selected, onSelect, meals, loading }) {
  return (
    <div className="lg:hidden flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
      {days.map((d) => {
        const active = d === selected;
        const isToday = d === today;
        const ready = SLOTS.some((s) => meals[`${d}-${s}`]);
        return (
          <button
            key={d}
            onClick={() => onSelect(d)}
            aria-current={active ? "true" : undefined}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors ${
              active
                ? "bg-primary text-white border-transparent"
                : "bg-canvas text-charcoal border-hairline-strong hover:bg-surface-soft"
            }`}
          >
            {d}
            {loading && !ready ? (
              <Loader2 size={11} className="animate-spin" />
            ) : isToday ? (
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: active ? "#fff" : "var(--primary)" }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────

export default function App() {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...load("settings_v2", {}) }));
  const [meals, setMeals] = useState(() => sanitizeMeals(load("meals_v2", {})));
  const [activeProgramId, setActiveProgramId] = useState(() => load("activeProgram", "cut"));
  // Snapshot of the season the current week was cooked for — drives the chip.
  const [weekContext, setWeekContext] = useState(() => load("weekContext_v1", null));
  // Transient: the blueprint for a week currently being generated — drives the
  // concept placeholder cards while days cook in parallel. Not persisted.
  const [weekPlan, setWeekPlan] = useState(null);
  // Rolling meal-name history (last ~3 weeks) so regenerated weeks stay fresh.
  const [mealHistory, setMealHistory] = useState(() => load("mealHistory_v1", []));
  // ⭐ loved / 🚫 banned meal names — fed back into generation.
  const [favorites, setFavorites] = useState(() => {
    const f = load("favorites_v1", { loved: [], banned: [] });
    return { loved: Array.isArray(f?.loved) ? f.loved : [], banned: Array.isArray(f?.banned) ? f.banned : [] };
  });
  const [pantry, setPantry] = useState(() => consolidatePantry(load("pantry_v1", [])));
  const [pantryDraft, setPantryDraft] = useState(EMPTY_PANTRY_DRAFT);
  const [coachMessages, setCoachMessages] = useState(() => load("coachMessages_v1", []));
  const [coachInput, setCoachInput] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [view, setView] = useState("plan");
  // Mobile Plan view: which day the hero card shows. null → today.
  const [selectedDay, setSelectedDay] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [regenKey, setRegenKey] = useState(null);
  const [activeMeal, setActiveMeal] = useState(null);
  const [error, setError] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferMode, setTransferMode] = useState("export");
  const [importText, setImportText] = useState("");
  const [copyOk, setCopyOk] = useState(false);
  const [listCopied, setListCopied] = useState(false);

  useEffect(() => { save("settings_v2", settings); }, [settings]);
  useEffect(() => { save("meals_v2", meals); }, [meals]);
  useEffect(() => { save("activeProgram", activeProgramId); }, [activeProgramId]);
  useEffect(() => { save("weekContext_v1", weekContext); }, [weekContext]);
  useEffect(() => { save("mealHistory_v1", mealHistory); }, [mealHistory]);
  useEffect(() => { save("favorites_v1", favorites); }, [favorites]);
  useEffect(() => { save("pantry_v1", pantry); }, [pantry]);

  const toggleLoved = (name) => {
    if (!name) return;
    setFavorites((f) => ({
      loved: f.loved.includes(name) ? f.loved.filter((n) => n !== name) : [...f.loved.slice(-39), name],
      banned: f.banned.filter((n) => n !== name),
    }));
  };
  const toggleBanned = (name) => {
    if (!name) return;
    setFavorites((f) => ({
      loved: f.loved.filter((n) => n !== name),
      banned: f.banned.includes(name) ? f.banned.filter((n) => n !== name) : [...f.banned.slice(-39), name],
    }));
  };
  useEffect(() => { save("coachMessages_v1", coachMessages); }, [coachMessages]);

  const sendCoachMessage = async (text) => {
    const trimmed = (text || "").trim();
    if (!trimmed || coachLoading) return;
    const userMsg = { id: `u${Date.now()}`, role: "user", content: trimmed };
    const nextHistory = [...coachMessages, userMsg];
    setCoachMessages(nextHistory);
    setCoachInput("");
    setCoachLoading(true);
    setError(null);
    try {
      const { reply, proposedChanges } = await apiCoachMessage(
        nextHistory.map((m) => ({ role: m.role, content: m.content })),
        settings,
        meals,
        pantry,
      );
      setCoachMessages((prev) => [
        ...prev,
        {
          id: `a${Date.now()}`,
          role: "assistant",
          content: reply || "",
          proposedChanges: proposedChanges || [],
          applied: false,
        },
      ]);
    } catch (e) {
      console.error(e);
      setError(`Coach: ${friendlyError(e.message)}`);
    }
    setCoachLoading(false);
  };

  const applyCoachChanges = (msgId, changes) => {
    if (!Array.isArray(changes) || changes.length === 0) return;
    setMeals((prev) => {
      const next = { ...prev };
      for (const c of changes) {
        if (c.day && c.slot && c.meal) next[`${c.day}-${c.slot}`] = c.meal;
      }
      return next;
    });
    setCoachMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, applied: true } : m)));
  };

  const clearCoachHistory = () => {
    if (coachMessages.length === 0) return;
    setCoachMessages([]);
  };

  // Lower-level helper: adds an item to the pantry, then runs the full
  // same-family-unit consolidation so any existing matching row (in the
  // same unit family) gets merged. Called both from the Pantry view's
  // add form and from the cart's "I bought it" checkbox.
  const addToPantry = (rawItem, qty, unit, section) => {
    const trimmed = (rawItem || "").trim();
    const safeQty = Number(qty);
    if (!trimmed || !safeQty || safeQty <= 0) return;
    const display = canonicalName(trimmed);
    setPantry((prev) =>
      consolidatePantry([
        ...prev,
        {
          id: `p${Date.now()}${Math.floor(Math.random() * 1000)}`,
          item: display,
          qty: safeQty,
          unit: unit || "g",
          section: section || "Other",
        },
      ]),
    );
  };

  const addPantryItem = () => {
    addToPantry(pantryDraft.item, pantryDraft.qty, pantryDraft.unit, pantryDraft.section);
    setPantryDraft({ ...EMPTY_PANTRY_DRAFT, unit: pantryDraft.unit, section: pantryDraft.section });
  };

  const deletePantryItem = (id) => {
    setPantry((prev) => prev.filter((p) => p.id !== id));
  };

  const switchProgram = (id) => {
    const p = PROGRAM_BY_ID[id];
    if (!p) return;
    setActiveProgramId(id);
    setSettings((prev) => ({
      ...prev,
      kcalTarget: p.kcalTarget,
      proteinTarget: p.proteinTarget,
      carbsTarget: p.carbsTarget,
      fatTarget: p.fatTarget,
    }));
  };

  const activeProgram = PROGRAM_BY_ID[activeProgramId] || PROGRAMS[0];

  // Grocery list is derived from meals minus pantry — no separate state.
  const groceryCategories = useMemo(() => consolidateGrocery(meals, pantry), [meals, pantry]);
  const groceryItemCount = groceryCategories.reduce((n, c) => n + c.items.length, 0);

  // Pantry items grouped by section for display, sorted alphabetically.
  const pantryBySection = useMemo(() => {
    const buckets = {};
    for (const p of pantry) {
      const section = p.section || "Other";
      if (!buckets[section]) buckets[section] = [];
      buckets[section].push(p);
    }
    return SECTION_ORDER
      .filter((s) => buckets[s]?.length)
      .map((section) => ({
        section,
        items: [...buckets[section]].sort((a, b) => a.item.localeCompare(b.item)),
      }));
  }, [pantry]);

  // Display order: today first, then today+1, today+2, ..., wrapping around.
  // new Date().getDay() returns 0 for Sun..6 for Sat; DAYS is Mon..Sun (Mon=0).
  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayName = DAYS[todayIdx];
  const orderedDays = [...DAYS.slice(todayIdx), ...DAYS.slice(0, todayIdx)];
  // Mobile Plan view shows one day at a time; defaults to today.
  const activeDay = selectedDay || todayName;

  const generateWeek = async () => {
    setLoading(true);
    setError(null);
    // Anchor the whole generation to the current season + location so the chef
    // cooks for the right time of year and market.
    const season = buildSeasonContext();
    const ctx = {
      monthName: season.monthName,
      location: settings.location || "Germany",
      seasonalHint: season.seasonalHint,
    };
    // Wipe any stale / junk meals up front so a fresh week never inherits
    // leftover cubes. We restore the previous week only if generation produces
    // nothing at all (transient failure), so a good week isn't lost on a hiccup.
    const prevMeals = meals;
    setMeals({});
    setWeekPlan(null);
    setSelectedDay(null); // new week → hero returns to today
    // Cross-week memory: what we ate recently (avoid), what's loved (may
    // return), what's banned (never).
    const memory = {
      recentMeals: [...new Set(mealHistory.slice(-84).map((h) => h.name))],
      loved: favorites.loved,
      banned: favorites.banned,
    };
    try {
      // Phase 1 — the chef sketches the whole week at once: per-day concepts,
      // breakfast/snack assignments, and the week's ingredient palette. The
      // palette is what lets phase 2 run all 7 days in PARALLEL while keeping
      // the grocery cart tight. Best-effort; on failure we cook without it.
      const planByDay = {};
      let palette = [];
      try {
        const blueprint = await apiPlanWeek(settings, ctx, memory, !!settings.batchMode);
        for (const d of blueprint?.days || []) {
          if (d?.day) {
            planByDay[d.day] = {
              concept: d.concept || "",
              breakfastIdea: d.breakfast || "",
              snackIdea: d.snack || "",
            };
          }
        }
        palette = blueprint?.ingredientPalette || [];
        if (Object.keys(planByDay).length > 0) setWeekPlan(planByDay);
      } catch (planErr) {
        console.warn("Week planning failed, generating without a blueprint:", planErr);
      }

      // Long-cook budget assigned deterministically (parallel days can't
      // share a running counter): weekend dinners get it first.
      const allowLongCookByDay = {
        Sat: settings.maxLongCookPerWeek >= 1,
        Sun: settings.maxLongCookPerWeek >= 2,
      };

      // Phase 2 — cook all 7 days in PARALLEL. Each day sees the palette
      // (exact names+units) and the other days' concepts, so the week stays
      // coherent without sequential threading. Grid fills as days land.
      const collectedNames = [];
      const results = await Promise.allSettled(
        DAYS.map((day) => {
          const otherDaysSummary = DAYS.filter((d) => d !== day)
            .map((d) => (planByDay[d]?.concept ? `${d}: ${planByDay[d].concept}` : null))
            .filter(Boolean)
            .join(" | ");
          return generateDay(day, settings, allowLongCookByDay[day] || false, [], [], {
            ...ctx,
            concept: planByDay[day]?.concept || "",
            breakfastIdea: planByDay[day]?.breakfastIdea || "",
            snackIdea: planByDay[day]?.snackIdea || "",
            palette,
            otherDaysSummary,
            bannedMeals: memory.banned,
          }).then((dayMeals) => {
            setMeals((prev) => {
              const next = { ...prev };
              SLOTS.forEach((slot, i) => {
                next[`${day}-${slot}`] = dayMeals[i];
                if (dayMeals[i]?.name) collectedNames.push(dayMeals[i].name);
              });
              return next;
            });
            return day;
          });
        }),
      );

      const failedDays = DAYS.filter((_, i) => results[i].status === "rejected");
      if (failedDays.length > 0 && failedDays.length < DAYS.length) {
        setError(`${failedDays.join(", ")} didn't generate — hit Regenerate to fill the gaps.`);
      } else if (failedDays.length === DAYS.length) {
        throw new Error(results[0].reason?.message || "Generation failed. Try again.");
      }

      // Record what we cooked so future weeks avoid repeating it (~3 weeks).
      if (collectedNames.length > 0) {
        const now = Date.now();
        setMealHistory((prev) =>
          [...prev, ...collectedNames.map((name) => ({ name, at: now }))]
            .filter((h) => now - (h.at || 0) < 28 * 24 * 3600 * 1000)
            .slice(-120),
        );
      }
      setWeekContext({
        monthName: season.monthName,
        location: settings.location || "Germany",
        headline: season.headline,
      });
    } catch (e) {
      console.error(e);
      setError(friendlyError(e.message));
      // If nothing got generated before the failure, put the previous week
      // back so a transient error doesn't leave the planner empty.
      setMeals((cur) => (Object.keys(cur).length ? cur : prevMeals));
    }
    setWeekPlan(null);
    setLoading(false);
  };

  const regenerateMeal = async (key) => {
    setRegenKey(key);
    setError(null);
    try {
      const [day, slot] = key.split("-");
      const others = Object.entries(meals)
        .filter(([k]) => k !== key)
        .map(([, m]) => m?.name)
        .filter(Boolean);
      const season = buildSeasonContext();
      const meal = await apiRegenerateMeal(day, slot, settings, others, {
        monthName: season.monthName,
        location: settings.location || "Germany",
        seasonalHint: season.seasonalHint,
      });
      setMeals((prev) => ({ ...prev, [key]: meal }));
    } catch (e) {
      console.error(e);
      setError(`Regeneration failed: ${friendlyError(e.message)}`);
    }
    setRegenKey(null);
  };

  const exportPayload = () => {
    const payload = { v: 4, settings, meals, pantry };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportPayload());
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    } catch { setCopyOk(false); }
  };

  // Plain-text grocery list, aisle-grouped — paste into WhatsApp / Notes /
  // any shopping app.
  const copyGroceryList = async () => {
    const lines = ["🛒 Grocery list — Meals", ""];
    for (const { section, items } of groceryCategories) {
      lines.push(`${section.toUpperCase()}`);
      for (const it of items) {
        lines.push(`  ☐ ${it.item} — ${it.qty} ${it.unit}`);
      }
      lines.push("");
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n").trim());
      setListCopied(true);
      setTimeout(() => setListCopied(false), 2000);
    } catch {
      setListCopied(false);
    }
  };

  const selectAllInTextarea = (e) => {
    e.target.focus();
    e.target.select();
    if (e.target.setSelectionRange) e.target.setSelectionRange(0, e.target.value.length);
  };

  const handleImport = () => {
    setError(null);
    try {
      const trimmed = importText.trim();
      if (!trimmed) throw new Error("Paste a plan code first");
      const json = decodeURIComponent(escape(atob(trimmed)));
      const payload = JSON.parse(json);
      if (!payload.meals) throw new Error("Invalid plan code");
      if (payload.settings) setSettings({ ...DEFAULT_SETTINGS, ...payload.settings });
      setMeals(sanitizeMeals(payload.meals || {}));
      if (Array.isArray(payload.pantry)) setPantry(payload.pantry);
      setImportText("");
      setTransferOpen(false);
    } catch (e) {
      setError(`Import failed: ${e.message}`);
    }
  };

  // Derived stats
  const dayKcal = (d) => SLOTS.reduce((s, slot) => s + (meals[`${d}-${slot}`]?.kcal || 0), 0);
  const dayProtein = (d) => SLOTS.reduce((s, slot) => s + (meals[`${d}-${slot}`]?.protein_g || 0), 0);
  const dayCarbs = (d) => SLOTS.reduce((s, slot) => s + (meals[`${d}-${slot}`]?.carbs_g || 0), 0);
  const dayFat = (d) => SLOTS.reduce((s, slot) => s + (meals[`${d}-${slot}`]?.fat_g || 0), 0);
  const totalKcal = DAYS.reduce((s, d) => s + dayKcal(d), 0);
  const totalProtein = DAYS.reduce((s, d) => s + dayProtein(d), 0);
  const totalCarbs = DAYS.reduce((s, d) => s + dayCarbs(d), 0);
  const totalFat = DAYS.reduce((s, d) => s + dayFat(d), 0);
  const hasMeals = Object.keys(meals).length > 0;

  const pctSum = settings.breakfastPct + settings.lunchPct + settings.dinnerPct + settings.snackPct;

  // Page title varies by view + active program
  const viewTitle = {
    plan: "This week's menu",
    grocery: "Grocery list",
    pantry: "Pantry",
    coach: "Coach",
  }[view] || "Meals";

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:rounded-md focus:bg-primary focus:text-white focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <Sidebar
        view={view}
        setView={setView}
        activeProgramId={activeProgramId}
        switchProgram={switchProgram}
        onSettings={() => { setShowSettings(true); setSidebarOpen(false); }}
        onSync={() => { setTransferMode(hasMeals ? "export" : "import"); setTransferOpen(true); setSidebarOpen(false); }}
        onGenerate={() => { generateWeek(); setSidebarOpen(false); }}
        hasMeals={hasMeals}
        loading={loading}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      />

      <div className="lg:pl-60">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-20 h-14 bg-canvas border-b border-hairline flex items-center justify-between px-4">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="text-charcoal p-1.5 rounded-md hover:bg-surface-soft"
          >
            <MenuIcon size={20} />
          </button>
          <div className="flex items-center gap-2 font-semibold text-ink">
            <span className="w-6 h-6 rounded-sm bg-ink-deep text-white grid place-items-center text-xs font-bold">M</span>
            <span>Meals</span>
          </div>
          <button
            onClick={generateWeek}
            disabled={loading}
            aria-label="Regenerate"
            className={`btn-spring inline-flex items-center justify-center w-9 h-9 rounded-md bg-primary text-white disabled:opacity-50 ${loading ? "generating" : ""}`}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </button>
        </header>

        <main id="main-content" className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 pt-6 pb-28 lg:py-10">
          {/* ── Page heading ────────────────────────────────────── */}
          <header className="mb-8">
            <Eyebrow>Week 01 · {activeProgram.name}</Eyebrow>
            <h1 className="mt-1.5 text-3xl sm:text-4xl lg:text-[44px] font-semibold tracking-[-0.5px] text-ink leading-[1.1]">
              {viewTitle}
            </h1>
            {view === "plan" && (
              <p className="mt-2 text-base text-slate max-w-[560px]">
                {hasMeals
                  ? "Seven days · 28 meals · macro-balanced. Tap any meal for ingredients and method."
                  : "Set your targets, then generate a week. The chef cooks with the season and your local market — a different, varied menu every time."}
              </p>
            )}
            {view === "plan" && hasMeals && weekContext?.headline?.length > 0 && (
              <div className="pop-in mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-tint-mint text-brand-green text-[11px] font-semibold tracking-[0.02em]" style={{ animationDelay: "150ms" }}>
                <span aria-hidden className="wiggle-hello">🌿</span>
                <span>
                  {weekContext.monthName} · in season: {weekContext.headline.slice(0, 4).join(", ")}
                </span>
              </div>
            )}
          </header>

        {/* ── Error banner ─────────────────────────────────────── */}
        {error && (
          <div className="mb-6 p-4 rounded-lg flex items-start gap-3 fade-in" style={{ background: "var(--error-tint)" }}>
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-error" />
            <div className="flex-1 text-sm text-error font-medium">{error}</div>
            <button onClick={() => setError(null)} aria-label="Dismiss" className="text-error/70 hover:text-error">
              <X size={16} />
            </button>
          </div>
        )}

        {/* ── Macro stat strip (Plan view only) ───────────────── */}
        {view === "plan" && hasMeals && (
          <div
            className="mb-8 rounded-lg bg-surface border border-hairline grid grid-cols-2 md:grid-cols-4 fade-in"
          >
            <div className="border-b md:border-b-0 md:border-r border-hairline">
              <MacroStat label="Avg kcal · day" value={Math.round(totalKcal / 7)} target={settings.kcalTarget} />
            </div>
            <div className="border-b md:border-b-0 md:border-r border-hairline">
              <MacroStat label="Avg protein" value={Math.round(totalProtein / 7)} unit="g" target={settings.proteinTarget} />
            </div>
            <div className="md:border-r border-hairline">
              <MacroStat label="Avg carbs" value={Math.round(totalCarbs / 7)} unit="g" target={settings.carbsTarget} />
            </div>
            <div>
              <MacroStat label="Avg fat" value={Math.round(totalFat / 7)} unit="g" target={settings.fatTarget} />
            </div>
          </div>
        )}

        {/* ── Empty state (Plan view only) ─────────────────────── */}
        {view === "plan" && !hasMeals && !loading && (
          <div className="py-20 sm:py-28 text-center fade-in">
            <div className="w-16 h-16 mx-auto mb-5 rounded-lg bg-surface-soft grid place-items-center text-stone">
              <ChefHat size={28} />
            </div>
            <h2 className="text-2xl font-semibold text-ink tracking-[-0.3px]">No week planned yet</h2>
            <p className="mt-2 text-sm text-slate max-w-[360px] mx-auto">
              Tune your targets, then generate a week. The grid fills in day by day as Claude composes it.
            </p>
            <div className="mt-6 inline-flex gap-3">
              <Button onClick={generateWeek}>
                <Sparkles size={14} /> Generate week
              </Button>
              <Button variant="secondary" onClick={() => setShowSettings(true)}>
                <SettingsIcon size={14} /> Settings
              </Button>
            </div>
          </div>
        )}

        {/* ── Phase-1 loading: the chef is sketching the menu ──── */}
        {view === "plan" && loading && !hasMeals && !weekPlan && (
          <div className="py-24 text-center fade-in">
            <Loader2 size={28} className="animate-spin text-primary mx-auto mb-4" />
            <Eyebrow className="!text-slate">The chef is planning the menu</Eyebrow>
            <p className="mt-2 text-xs text-stone">sketching seven days around what's in season…</p>
          </div>
        )}

        {/* ── Plan view: 7 day cards, today first. While generating,
               days that haven't landed yet show their blueprint concept. */}
        {view === "plan" && (hasMeals || (loading && weekPlan)) && (
          <>
            {/* Desktop (lg+): full 7-column grid, unchanged. */}
            <div className="hidden lg:grid gap-3 lg:grid-cols-4 xl:grid-cols-7">
              {orderedDays.map((day, di) => {
                const dayHasMeals = SLOTS.some((s) => meals[`${day}-${s}`]);
                if (!dayHasMeals && loading) {
                  return (
                    <PendingDayCard
                      key={day}
                      day={day}
                      dayIndex={di}
                      isToday={day === todayName}
                      plan={weekPlan?.[day]}
                    />
                  );
                }
                if (!dayHasMeals) return null;
                return (
                  <DayCard
                    key={day}
                    dayIndex={di}
                    day={day}
                    isToday={day === todayName}
                    kcal={dayKcal(day)}
                    protein={dayProtein(day)}
                    carbs={dayCarbs(day)}
                    fat={dayFat(day)}
                    meals={meals}
                    regenKey={regenKey}
                    onOpenMeal={setActiveMeal}
                    onRegen={regenerateMeal}
                  />
                );
              })}
            </div>

            {/* Mobile / tablet (< lg): today-first hero + day switcher. */}
            <div className="lg:hidden">
              <DayPills
                days={orderedDays}
                today={todayName}
                selected={activeDay}
                onSelect={setSelectedDay}
                meals={meals}
                loading={loading}
              />
              <div className="mt-4">
                {SLOTS.some((s) => meals[`${activeDay}-${s}`]) ? (
                  <DayCard
                    key={activeDay}
                    dayIndex={0}
                    day={activeDay}
                    isToday={activeDay === todayName}
                    kcal={dayKcal(activeDay)}
                    protein={dayProtein(activeDay)}
                    carbs={dayCarbs(activeDay)}
                    fat={dayFat(activeDay)}
                    meals={meals}
                    regenKey={regenKey}
                    hero
                    onOpenMeal={setActiveMeal}
                    onRegen={regenerateMeal}
                  />
                ) : loading ? (
                  <PendingDayCard
                    key={activeDay}
                    day={activeDay}
                    dayIndex={0}
                    isToday={activeDay === todayName}
                    plan={weekPlan?.[activeDay]}
                  />
                ) : null}
              </div>
            </div>
          </>
        )}

        {/* ── Grocery view: consolidated by section ────────────── */}
        {view === "grocery" && hasMeals && (
          <div className="fade-in">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <p className="text-sm text-steel">
                {groceryItemCount} {groceryItemCount === 1 ? "item" : "items"} · sorted by aisle
              </p>
              {groceryItemCount > 0 && (
                <Button variant="secondary" onClick={copyGroceryList} className="!py-2 !px-3.5 !text-xs">
                  {listCopied ? <><Check size={13} /> Copied</> : <><Share2 size={13} /> Copy list</>}
                </Button>
              )}
            </div>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {groceryCategories.map(({ section, items }, si) => (
                <div
                  key={section}
                  className="bg-canvas rounded-lg border border-hairline p-5 pop-in"
                  style={{ animationDelay: `${si * 60}ms` }}
                >
                  <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-hairline-soft">
                    <Eyebrow>{section}</Eyebrow>
                    <span className="shrink-0 text-xs text-stone font-medium tnum">
                      {items.length} {items.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {items.map((ing) => (
                      <li key={ing.key}>
                        <button
                          onClick={() => addToPantry(ing.item, ing.qty, ing.unit, ing.section || section)}
                          title="Mark as bought — adds to pantry"
                          className="group w-full flex items-center gap-3 py-1.5 px-1 text-left rounded-sm hover:bg-surface-soft transition-colors"
                        >
                          <span
                            className="check-pop w-4 h-4 rounded-xs grid place-items-center shrink-0 border border-hairline-strong group-hover:border-primary group-hover:bg-primary/10"
                          />
                          <span className="flex-1 text-sm capitalize text-ink">
                            {ing.item}
                          </span>
                          <span className="text-xs tnum text-steel font-medium shrink-0">
                            {ing.qty} {ing.unit}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Grocery: everything bought / all in pantry ───────── */}
        {view === "grocery" && hasMeals && groceryItemCount === 0 && (
          <div className="py-12 text-center fade-in">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-tint-mint grid place-items-center text-brand-green">
              <Check size={22} strokeWidth={3} />
            </div>
            <h2 className="text-xl font-semibold text-ink">Cart's empty</h2>
            <p className="mt-2 text-sm text-slate max-w-[360px] mx-auto">
              Everything for this week is in your pantry. Generate a new week or add more items to your plan.
            </p>
          </div>
        )}

        {/* ── Grocery empty state ──────────────────────────────── */}
        {view === "grocery" && !hasMeals && (
          <ComingSoon
            icon={ShoppingCart}
            title="No grocery list yet"
            description="Generate a week first — the cart populates automatically from your meals, aisle by aisle."
          />
        )}

        {/* ── Pantry view ──────────────────────────────────────── */}
        {view === "pantry" && (
          <div className="fade-in">
            <p className="text-sm text-steel mb-5">
              {pantry.length === 0
                ? "Add what's already in your fridge. Pantry items subtract from the grocery list automatically."
                : `${pantry.length} ${pantry.length === 1 ? "item" : "items"} in stock · subtracted from grocery list`}
            </p>

            {/* Add-item form */}
            <div className="bg-canvas border border-hairline rounded-lg p-4 sm:p-5 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_100px_140px_auto] gap-2 items-end">
                <label className="block">
                  <Eyebrow className="mb-1.5">Item</Eyebrow>
                  <Input
                    type="text"
                    value={pantryDraft.item}
                    onChange={(e) => setPantryDraft((p) => ({ ...p, item: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addPantryItem(); }}
                    placeholder="e.g. Skyr"
                  />
                </label>
                <label className="block">
                  <Eyebrow className="mb-1.5">Qty</Eyebrow>
                  <Input
                    type="number"
                    min="0"
                    value={pantryDraft.qty}
                    onChange={(e) => setPantryDraft((p) => ({ ...p, qty: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addPantryItem(); }}
                    placeholder="0"
                  />
                </label>
                <label className="block">
                  <Eyebrow className="mb-1.5">Unit</Eyebrow>
                  <select
                    value={pantryDraft.unit}
                    onChange={(e) => setPantryDraft((p) => ({ ...p, unit: e.target.value }))}
                    className="w-full h-11 px-4 rounded-md bg-canvas text-ink border border-hairline-strong text-sm focus:outline-none focus:border-primary focus:border-2"
                  >
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
                <label className="block">
                  <Eyebrow className="mb-1.5">Section</Eyebrow>
                  <select
                    value={pantryDraft.section}
                    onChange={(e) => setPantryDraft((p) => ({ ...p, section: e.target.value }))}
                    className="w-full h-11 px-4 rounded-md bg-canvas text-ink border border-hairline-strong text-sm focus:outline-none focus:border-primary focus:border-2"
                  >
                    {SECTION_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <Button
                  onClick={addPantryItem}
                  disabled={!pantryDraft.item.trim() || !Number(pantryDraft.qty)}
                  className="h-11"
                >
                  Add
                </Button>
              </div>
            </div>

            {/* Pantry list grouped by section */}
            {pantry.length === 0 ? (
              <div className="py-12 text-center fade-in">
                <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-surface-soft grid place-items-center text-stone">
                  <Package size={22} />
                </div>
                <p className="text-sm text-slate">No items yet — add one above.</p>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {pantryBySection.map(({ section, items }, si) => (
                  <div key={section} className="bg-canvas rounded-lg border border-hairline p-5 pop-in" style={{ animationDelay: `${si * 60}ms` }}>
                    <div className="mb-3 pb-3 border-b border-hairline-soft flex items-center justify-between">
                      <Eyebrow>{section}</Eyebrow>
                      <span className="text-xs text-stone font-medium tnum">{items.length}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {items.map((item) => (
                        <li key={item.id} className="group flex items-center gap-3 py-1.5 px-1 rounded-sm hover:bg-surface-soft">
                          <span className="flex-1 text-sm text-ink capitalize">{item.item}</span>
                          <span className="text-xs tnum text-steel font-medium">{item.qty} {item.unit}</span>
                          <button
                            onClick={() => deletePantryItem(item.id)}
                            className="text-stone hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label={`Remove ${item.item}`}
                          >
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Coach view ───────────────────────────────────────── */}
        {view === "coach" && (
          <div className="fade-in">
            <div className="flex items-start justify-between gap-4 mb-5">
              <p className="text-sm text-steel max-w-[560px]">
                Ask the coach to swap a meal, rebalance macros, or work around a constraint. Proposed changes show an Apply button so you stay in control.
              </p>
              {coachMessages.length > 0 && (
                <button
                  onClick={clearCoachHistory}
                  className="text-xs text-steel hover:text-error font-medium"
                >
                  Clear history
                </button>
              )}
            </div>

            {coachMessages.length === 0 ? (
              <div className="bg-canvas border border-hairline rounded-lg p-6 sm:p-8">
                <Eyebrow className="!text-charcoal mb-3">Try asking</Eyebrow>
                <div className="space-y-2">
                  {[
                    "Swap Wednesday's dinner — I'm short on time, under 20 min.",
                    "Cut Friday's carbs by 30g without dropping protein.",
                    "Replace all the salmon this week with chicken.",
                    "I've got leftover lentils — work them into tomorrow.",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendCoachMessage(prompt)}
                      disabled={!hasMeals || coachLoading}
                      className="w-full text-left px-4 py-2.5 rounded-md bg-surface hover:bg-surface-soft text-sm text-ink border border-hairline-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      "{prompt}"
                    </button>
                  ))}
                </div>
                {!hasMeals && (
                  <p className="mt-4 text-xs text-stone">
                    Generate a week first — the coach reads your current plan to suggest changes.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                {coachMessages.map((msg) => (
                  <div key={msg.id}>
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[80%] px-4 py-2.5 rounded-lg bg-primary text-white text-sm">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-[85%]">
                        <div className="bg-canvas border border-hairline rounded-lg p-4">
                          <Eyebrow className="!text-charcoal mb-2">Coach</Eyebrow>
                          <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{msg.content}</div>
                          {msg.proposedChanges?.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-hairline-soft">
                              <Eyebrow className="!text-stone mb-2">
                                {msg.proposedChanges.length === 1 ? "1 change" : `${msg.proposedChanges.length} changes`}
                              </Eyebrow>
                              <ul className="space-y-1.5 mb-3">
                                {msg.proposedChanges.map((c, i) => (
                                  <li key={i} className="text-xs text-charcoal">
                                    <span className="font-semibold">{c.day} {SLOT_LABELS[c.slot] || c.slot}</span>
                                    {" · "}
                                    <span>{c.meal?.name}</span>
                                    {c.meal?.kcal && (
                                      <span className="text-stone"> ({c.meal.kcal} kcal · {c.meal.protein_g}g P · prep {c.meal.prep_time})</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                              {msg.applied ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-success font-semibold">
                                  <Check size={12} strokeWidth={3} /> Applied
                                </span>
                              ) : (
                                <Button onClick={() => applyCoachChanges(msg.id, msg.proposedChanges)} className="!py-1.5 !px-3 !text-xs">
                                  <Check size={12} /> Apply changes
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {coachLoading && (
                  <div className="max-w-[85%]">
                    <div className="bg-canvas border border-hairline rounded-lg p-4 flex items-center gap-2 text-sm text-steel">
                      <Loader2 size={14} className="animate-spin" /> Coach is thinking…
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Input — always at the bottom, sticky-feel */}
            <div className="bg-canvas border border-hairline rounded-lg p-3 sticky bottom-[calc(66px_+_env(safe-area-inset-bottom))] lg:bottom-4 shadow-s1 focus-within:border-primary transition-colors">
              <form
                onSubmit={(e) => { e.preventDefault(); sendCoachMessage(coachInput); }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={coachInput}
                  onChange={(e) => setCoachInput(e.target.value)}
                  placeholder={hasMeals ? "Ask the coach…" : "Generate a week first to talk to the coach"}
                  disabled={!hasMeals || coachLoading}
                  className="flex-1 h-10 px-3 text-sm bg-transparent text-ink placeholder:text-stone focus:outline-none disabled:cursor-not-allowed"
                />
                <button
                  type="submit"
                  disabled={!coachInput.trim() || !hasMeals || coachLoading}
                  aria-label="Send"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-primary text-white hover:bg-primary-pressed disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {coachLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </form>
            </div>
          </div>
        )}
        </main>
      </div>

      <BottomTabBar view={view} setView={setView} />

      {/* ── Active meal modal ──────────────────────────────────── */}
      <Modal open={!!activeMeal && !!meals[activeMeal]} onClose={() => setActiveMeal(null)} maxWidth="max-w-2xl">
        {activeMeal && meals[activeMeal] && (
          <div className="p-6 sm:p-8">
            <div className="flex justify-between items-start gap-4 mb-5">
              <div className="flex-1">
                <div className="flex items-center gap-2.5 mb-2">
                  <Eyebrow>{activeMeal.replace("-", " · ")}</Eyebrow>
                  {meals[activeMeal].prep_time && <TimeChip prep={meals[activeMeal].prep_time} />}
                </div>
                <h2 className="text-2xl sm:text-[28px] font-semibold leading-tight text-ink tracking-[-0.3px]">
                  {meals[activeMeal].name}
                </h2>
              </div>
              <IconButton label="Close" onClick={() => setActiveMeal(null)}><X size={18} /></IconButton>
            </div>

            <div className="grid grid-cols-4 gap-3 py-4 mb-5 border-y border-hairline-soft">
              {[
                { l: "Kcal", v: meals[activeMeal].kcal },
                { l: "Protein", v: `${meals[activeMeal].protein_g}g` },
                { l: "Carbs", v: `${meals[activeMeal].carbs_g}g` },
                { l: "Fat", v: `${meals[activeMeal].fat_g}g` },
              ].map((s) => (
                <div key={s.l}>
                  <Eyebrow>{s.l}</Eyebrow>
                  <div className="mt-0.5 text-lg font-semibold text-ink tnum">{s.v}</div>
                </div>
              ))}
            </div>

            <div className="mb-5">
              <Eyebrow className="!text-charcoal">Ingredients</Eyebrow>
              <ul className="mt-2 space-y-1.5">
                {meals[activeMeal].ingredients?.map((ing, i) => (
                  <li key={i} className="flex justify-between items-baseline py-1 border-b border-dashed border-hairline">
                    <span className="text-sm text-ink">{ing.item}</span>
                    <span className="text-sm text-steel tnum">{ing.qty} {ing.unit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <Eyebrow className="!text-charcoal">Method</Eyebrow>
              <p className="mt-2 text-[15px] leading-relaxed text-slate">{meals[activeMeal].instructions}</p>
            </div>

            {/* Feed the chef's memory: loved meals may return, banned never do. */}
            <div className="mt-6 pt-4 border-t border-hairline-soft flex items-center gap-2">
              {(() => {
                const mealName = meals[activeMeal].name;
                const isLoved = favorites.loved.includes(mealName);
                const isBanned = favorites.banned.includes(mealName);
                return (
                  <>
                    <button
                      onClick={() => toggleLoved(mealName)}
                      aria-pressed={isLoved}
                      className={`btn-spring inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        isLoved
                          ? "bg-tint-yellow border-transparent text-charcoal"
                          : "bg-transparent border-hairline-strong text-slate hover:bg-surface-soft"
                      }`}
                    >
                      <span aria-hidden>⭐</span> {isLoved ? "Loved — the chef may bring it back" : "Love it"}
                    </button>
                    <button
                      onClick={() => toggleBanned(mealName)}
                      aria-pressed={isBanned}
                      className={`btn-spring inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        isBanned
                          ? "bg-error-tint border-transparent text-error"
                          : "bg-transparent border-hairline-strong text-slate hover:bg-surface-soft"
                      }`}
                    >
                      <span aria-hidden>🚫</span> {isBanned ? "Banned — never again" : "Never again"}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Transfer modal ─────────────────────────────────────── */}
      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} maxWidth="max-w-lg">
        <ModalHeader title="Transfer" onClose={() => setTransferOpen(false)} />
        <div className="p-6 pt-5">
          <div className="inline-flex w-full p-1 rounded-md bg-surface-soft mb-5">
            <button
              onClick={() => setTransferMode("export")}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-sm transition-colors ${transferMode === "export" ? "bg-canvas shadow-s1 text-ink" : "text-steel hover:text-ink"}`}
            >
              Export
            </button>
            <button
              onClick={() => setTransferMode("import")}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-sm transition-colors ${transferMode === "import" ? "bg-canvas shadow-s1 text-ink" : "text-steel hover:text-ink"}`}
            >
              Import
            </button>
          </div>

          {transferMode === "export" ? (
            hasMeals ? (
              <>
                <p className="text-sm text-slate leading-relaxed mb-4">
                  Move this week to another device: copy the code, send it to yourself (Notes or iMessage), then open the planner there, tap <span className="text-primary font-medium">Transfer → Import</span>, and paste.
                </p>
                <textarea
                  readOnly
                  value={exportPayload()}
                  onClick={selectAllInTextarea}
                  onFocus={selectAllInTextarea}
                  className="w-full p-3 text-xs font-mono rounded-md bg-surface border border-hairline text-slate mb-3 h-32 resize-none break-all"
                />
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={(e) => {
                      const ta = e.currentTarget.parentElement.parentElement.querySelector("textarea");
                      if (ta) selectAllInTextarea({ target: ta });
                    }}
                  >
                    Select all
                  </Button>
                  <Button className="flex-1" onClick={handleCopy}>
                    {copyOk ? <><Check size={14} /> Copied</> : <><Share2 size={14} /> Copy code</>}
                  </Button>
                </div>
                <p className="text-[11px] mt-3 leading-relaxed text-stone">
                  If "Copy code" doesn't work on your phone, tap Select all, then long-press the highlighted text and choose Copy.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate">Generate a week first.</p>
            )
          ) : (
            <>
              <p className="text-sm text-slate leading-relaxed mb-4">
                Paste a plan code from your other device, then Import. This replaces the plan currently on this device.
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Paste plan code…"
                className="w-full p-3 text-xs font-mono rounded-md bg-canvas border border-hairline-strong text-ink mb-4 h-32 resize-none break-all focus:outline-none focus:border-primary focus:border-2"
              />
              <Button className="w-full" onClick={handleImport} disabled={!importText.trim()}>
                <Download size={14} /> Import plan
              </Button>
            </>
          )}
        </div>
      </Modal>

      {/* ── Settings modal ─────────────────────────────────────── */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} maxWidth="max-w-md">
        <ModalHeader title="Settings" onClose={() => setShowSettings(false)} />
        <div className="p-6 pt-5 space-y-6">
          <div>
            <Eyebrow className="!text-charcoal mb-3">Daily targets</Eyebrow>
            <div className="grid grid-cols-2 gap-3">
              {[
                { k: "kcalTarget", label: "kcal" },
                { k: "proteinTarget", label: "Protein (g)" },
                { k: "carbsTarget", label: "Carbs (g)" },
                { k: "fatTarget", label: "Fat (g)" },
              ].map(({ k, label }) => (
                <div key={k}>
                  <Input
                    type="number"
                    value={settings[k]}
                    onChange={(e) => setSettings((p) => ({ ...p, [k]: Number(e.target.value) }))}
                  />
                  <div className="mt-1 text-[11px] text-stone font-medium">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Eyebrow className="!text-charcoal mb-3">Meal split (% of daily)</Eyebrow>
            <div className="grid grid-cols-4 gap-2">
              {SLOTS.map((s) => (
                <div key={s}>
                  <Input
                    type="number"
                    value={settings[`${s}Pct`]}
                    onChange={(e) => setSettings((p) => ({ ...p, [`${s}Pct`]: Number(e.target.value) }))}
                    className="text-center"
                  />
                  <div className="mt-1 text-[11px] text-stone font-medium text-center">{SLOT_LABELS[s]}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] font-medium" style={{ color: pctSum === 100 ? "var(--success)" : "var(--error)" }}>
              Sum: {pctSum}% {pctSum !== 100 && "(should be 100)"}
            </div>
          </div>

          <div>
            <label className="block">
              <Eyebrow className="!text-charcoal mb-2">Max long-cook meals per week</Eyebrow>
              <Input
                type="number"
                min="0"
                max="14"
                value={settings.maxLongCookPerWeek}
                onChange={(e) => setSettings((p) => ({ ...p, maxLongCookPerWeek: Number(e.target.value) }))}
              />
            </label>
            <div className="mt-1 text-[11px] text-stone">Meals over 30 min. Reserved for weekends.</div>
          </div>

          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.batchMode}
                onChange={(e) => setSettings((p) => ({ ...p, batchMode: e.target.checked }))}
                className="mt-0.5 w-4 h-4 accent-[var(--primary)] cursor-pointer"
              />
              <span>
                <Eyebrow className="!text-charcoal">Cook once, eat twice</Eyebrow>
                <span className="block mt-1 text-[11px] text-stone leading-snug">
                  2-3 dinners a week are scaled to yield leftovers that become the next day's ≤5-min lunch remix.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label className="block">
              <Eyebrow className="!text-charcoal mb-2">Location</Eyebrow>
              <Input
                type="text"
                value={settings.location}
                onChange={(e) => setSettings((p) => ({ ...p, location: e.target.value }))}
                placeholder="e.g. Berlin, Germany"
              />
            </label>
            <div className="mt-1 text-[11px] text-stone">The chef cooks for your local market and the current season.</div>
          </div>

          <div>
            <label className="block">
              <Eyebrow className="!text-charcoal mb-2">Favorite cuisines <span className="text-stone normal-case font-normal tracking-normal">— optional</span></Eyebrow>
              <Input
                type="text"
                value={settings.cuisines}
                onChange={(e) => setSettings((p) => ({ ...p, cuisines: e.target.value }))}
                placeholder="e.g. Thai, Levantine — leave blank to roam freely"
              />
            </label>
            <div className="mt-1 text-[11px] text-stone">The chef mixes cuisines across the week. Names here just nudge the leaning.</div>
          </div>

          <div>
            <label className="block">
              <Eyebrow className="!text-charcoal mb-2">Avoid</Eyebrow>
              <Input
                type="text"
                value={settings.avoid}
                onChange={(e) => setSettings((p) => ({ ...p, avoid: e.target.value }))}
                placeholder="e.g. mushrooms"
              />
            </label>
          </div>

          <p className="text-[11px] text-stone">Saved automatically.</p>
        </div>
      </Modal>
    </div>
  );
}
