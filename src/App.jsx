import { useState, useEffect, useMemo } from "react";
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
import { generateDay, regenerateMeal as apiRegenerateMeal, coachMessage as apiCoachMessage } from "./lib/api";

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
  cuisines: "Mediterranean, Middle Eastern, Asian",
  avoid: "",
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

const TIME_LABELS = {
  "5": "≤5 min",
  "15": "≤15 min",
  "30": "≤30 min",
  "60": "30+ min",
};

// Subtle color signal on prep-time chips — readable on pastel backgrounds.
const TIME_COLORS = {
  "5": "#2B6E2E",   // green — no-cook
  "15": "#8A6A1C",  // amber — moderate
  "30": "#A85C1C",  // orange — slow
  "60": "#A8442F",  // red-brown — long-cook
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
// variants; values are the canonical German display name. The LLM is
// instructed to use German names but occasionally outputs English equivalents,
// spelling variants ("Sojasoße"/"Sojasauce"), or modifiers — all collapse
// here.
const INGREDIENT_ALIAS = {
  // Produce
  "banana": "Banane",
  "banane": "Banane",
  "cucumber": "Gurke",
  "gurke": "Gurke",
  "garlic": "Knoblauch",
  "knoblauch": "Knoblauch",
  "fresh ginger": "Ingwer",
  "ginger": "Ingwer",
  "ingwer": "Ingwer",
  "fresh parsley": "Petersilie",
  "parsley": "Petersilie",
  "petersilie": "Petersilie",
  "lemon juice": "Zitronensaft",
  "zitronensaft": "Zitronensaft",
  "lemon": "Zitrone",
  "zitrone": "Zitrone",
  "red onion": "Rote Zwiebel",
  "rote zwiebel": "Rote Zwiebel",
  "onion": "Zwiebel",
  "zwiebel": "Zwiebel",
  "bell pepper": "Paprika",
  "paprika": "Paprika",
  "paprika rot und gelb": "Paprika",
  "cherry tomatoes": "Kirschtomaten",
  "cherrytomaten": "Kirschtomaten",
  "kirschtomaten": "Kirschtomaten",
  "tomato": "Tomate",
  "tomate": "Tomate",
  "spring onions": "Frühlingszwiebeln",
  "scallions": "Frühlingszwiebeln",
  "frühlingszwiebeln": "Frühlingszwiebeln",
  "baby spinach": "Babyspinat",
  "babyspinat": "Babyspinat",
  "spinach": "Spinat",
  "spinat": "Spinat",
  "zucchini": "Zucchini",
  "mango": "Mango",
  "mango gefroren oder frisch": "Mango",
  "schnittlauch": "Schnittlauch",
  "chives": "Schnittlauch",
  "avocado": "Avocado",
  "broccoli": "Brokkoli",
  "brokkoli": "Brokkoli",
  "pak choi": "Pak Choi",
  "carrot": "Karotte",
  "carrots": "Karotte",
  "karotte": "Karotte",

  // Meat & Fish
  "chicken breast": "Hähnchenbrust",
  "hähnchenbrust": "Hähnchenbrust",
  "hähnchenbrust pre-cooked or rotisserie": "Hähnchenbrust",
  "hähnchenbrust pre-cooked or sliced deli": "Hähnchenbrust",
  "salmon fillet": "Lachsfilet",
  "salmon": "Lachsfilet",
  "lachsfilet": "Lachsfilet",
  "lachs": "Lachsfilet",
  "lean lamb mince": "Lammhackfleisch",
  "lamb mince": "Lammhackfleisch",
  "lammhackfleisch": "Lammhackfleisch",
  "chicken thigh": "Hähnchenschenkel",
  "chicken thighs": "Hähnchenschenkel",
  "hähnchenschenkel": "Hähnchenschenkel",
  "hähnchenschenkel ohne knochen und haut": "Hähnchenschenkel",
  "turkey breast": "Putenbrust",
  "putenbrust": "Putenbrust",
  "putenbrust aufschnitt": "Putenbrust",
  "tuna": "Thunfisch",
  "canned tuna": "Thunfisch",
  "thunfisch": "Thunfisch",
  "lean beef": "Rindfleisch",
  "beef": "Rindfleisch",
  "rindfleisch": "Rindfleisch",
  "shrimp": "Garnelen",
  "garnelen": "Garnelen",

  // Dairy & Eggs
  "cottage cheese": "Hüttenkäse",
  "hüttenkäse": "Hüttenkäse",
  "feta": "Feta",
  "feta cheese": "Feta",
  "skyr": "Skyr",
  "skyr natur": "Skyr",
  "low-fat milk": "Milch",
  "milk": "Milch",
  "milch": "Milch",
  "magerquark": "Magerquark",
  "eggs": "Eier",
  "egg": "Eier",
  "eier": "Eier",
  "egg whites": "Eiweiß",
  "eiweiß": "Eiweiß",
  "eiweiss": "Eiweiß",
  "greek yogurt": "Griechischer Joghurt",
  "griechischer joghurt": "Griechischer Joghurt",
  "griechischer joghurt 2%": "Griechischer Joghurt",
  "natural yogurt": "Naturjoghurt",
  "naturjoghurt": "Naturjoghurt",
  "naturjoghurt fettarm": "Naturjoghurt",
  "yogurt": "Joghurt",
  "joghurt": "Joghurt",
  "mozzarella": "Mozzarella",

  // Pantry
  "oats": "Haferflocken",
  "rolled oats": "Haferflocken",
  "haferflocken": "Haferflocken",
  "honey": "Honig",
  "honig": "Honig",
  "walnuts": "Walnüsse",
  "walnut": "Walnüsse",
  "walnüsse": "Walnüsse",
  "almonds": "Mandeln",
  "mandeln": "Mandeln",
  "olive oil": "Olivenöl",
  "olivenöl": "Olivenöl",
  "soy sauce": "Sojasauce",
  "sojasauce": "Sojasauce",
  "rice": "Reis",
  "reis": "Reis",
  "jasmine rice": "Jasminreis",
  "jasminreis": "Jasminreis",
  "bulgur": "Bulgur",
  "lentils": "Linsen",
  "linsen": "Linsen",
  "chickpeas": "Kichererbsen",
  "kichererbsen": "Kichererbsen",
  "hummus": "Hummus",
  "tofu": "Tofu",
  "whole grain bread": "Vollkornbrot",
  "vollkornbrot": "Vollkornbrot",
  "protein bread": "Eiweißbrot",
  "eiweißbrot": "Eiweißbrot",
  "eiweissbrot": "Eiweißbrot",
  "peanut butter": "Erdnussbutter",
  "erdnussbutter": "Erdnussbutter",
  "almond butter": "Mandelbutter",
  "mandelbutter": "Mandelbutter",
  "soba noodles": "Sobanudeln",
  "soba-nudeln": "Sobanudeln",
  "sobanudeln": "Sobanudeln",
  "pumpkin seeds": "Kürbiskerne",
  "kürbiskerne": "Kürbiskerne",
  "white beans": "Weiße Bohnen",
  "weiße bohnen": "Weiße Bohnen",
  "edamame": "Edamame",
  "tomato paste": "Tomatenmark",
  "tomatenmark": "Tomatenmark",
  "tabbouleh": "Tabbouleh",

  // Items the LLM was emitting as dupes (post-Phase-1-3 cart audit)
  "sesame oil": "Sesamöl",
  "sesamöl": "Sesamöl",
  "soy sauce": "Sojasauce",
  "sojasoße": "Sojasauce",
  "sojasauce": "Sojasauce",
  "soja sauce": "Sojasauce",
  "bulgur": "Bulgur",
  "bulgur wheat": "Bulgur",
  "chickpeas": "Kichererbsen",
  "canned chickpeas": "Kichererbsen",
  "kichererbsen": "Kichererbsen",
  "pineapple": "Ananas",
  "pineapple chunks": "Ananas",
  "ananas": "Ananas",
  "tuna": "Thunfisch",
  "tuna in water": "Thunfisch",
  "thunfisch in wasser": "Thunfisch",
  "thunfisch in eigenem saft": "Thunfisch",
  "thunfisch": "Thunfisch",
  "canned tuna": "Thunfisch",
  "mixed berries": "Beerenmischung",
  "frozen mixed berries": "Beerenmischung",
  "beerenmischung": "Beerenmischung",
  "tiefkühl-beeren": "Beerenmischung",
  "beeren": "Beerenmischung",
  "chia seeds": "Chia-Samen",
  "chia samen": "Chia-Samen",
  "chia-samen": "Chia-Samen",
  "chiasamen": "Chia-Samen",
  "ras el hanout": "Ras El Hanout",
  "ras-el-hanout": "Ras El Hanout",
  "kreuzkümmel": "Kreuzkümmel",
  "cumin": "Kreuzkümmel",
  "salt": "Salz",
  "salz": "Salz",
  "pepper": "Pfeffer",
  "black pepper": "Pfeffer",
  "pfeffer": "Pfeffer",
  "salt and pepper": "Salz und Pfeffer",
  "salz und pfeffer": "Salz und Pfeffer",
  "beluga lentils": "Beluga-Linsen",
  "beluga linsen": "Beluga-Linsen",
  "beluga-linsen": "Beluga-Linsen",
  "tortilla": "Vollkorn-Tortilla",
  "vollkorn-tortilla": "Vollkorn-Tortilla",
  "whole grain tortilla": "Vollkorn-Tortilla",
  "whole grain wraps": "Vollkorn-Tortilla",
  "whole wheat tortilla": "Vollkorn-Tortilla",
  "whole wheat wraps": "Vollkorn-Tortilla",
  "vollkornbrot": "Vollkornbrot",
  "whole grain bread": "Vollkornbrot",
  "whole wheat bread": "Vollkornbrot",
  "chopped tomatoes": "Tomatenstücke",
  "canned chopped tomatoes": "Tomatenstücke",
  "diced tomatoes": "Tomatenstücke",
  "tomatenstücke": "Tomatenstücke",
  "tomato": "Tomate",
  "tomate": "Tomate",
  "tomaten": "Tomate",
  "baking powder": "Backpulver",
  "backpulver": "Backpulver",
  "rice": "Reis",
  "reis": "Reis",
  "white rice": "Reis",
  "tofu": "Tofu",
  "firm tofu": "Tofu",
  "fester tofu": "Tofu",
  "räuchertofu": "Tofu",
  "smoked tofu": "Tofu",
  "whey protein": "Whey Protein",
  "whey protein powder": "Whey Protein",
  "molkenprotein": "Whey Protein",
  "protein pulver": "Whey Protein",
  "za'atar": "Za'atar",
  "zaatar": "Za'atar",
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

// ── Tiny presentational helpers ───────────────────────────────────────

function Button({ variant = "primary", className = "", children, ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md font-medium text-sm leading-tight px-[18px] py-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
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
      className={`w-10 h-10 inline-flex items-center justify-center rounded-md text-charcoal hover:bg-surface-soft transition-colors ${className}`}
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
  return (
    <div className="px-5 py-4">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1 text-3xl font-semibold tnum text-ink leading-none">
        {value}
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

function MealTile({ slot, meal, isRegen, onClick, onRegen }) {
  return (
    <button
      onClick={meal ? onClick : undefined}
      disabled={!meal}
      className="group relative w-full text-left p-3 rounded-md border border-transparent disabled:cursor-default transition-colors"
      style={{ background: SLOT_TINTS[slot] }}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-charcoal/70">
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
          <div className="text-[13px] font-medium leading-snug text-charcoal min-h-[2.5em]">
            {meal.name}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-charcoal/80 tnum">
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

function DayCard({ dayIndex, day, isToday, kcal, protein, carbs, fat, meals, regenKey, onOpenMeal, onRegen }) {
  return (
    <article
      className="bg-canvas rounded-lg border border-hairline p-4 flex flex-col gap-3 hover:shadow-s2 transition-shadow fade-in"
      style={{ animationDelay: `${dayIndex * 45}ms` }}
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
        <div className="text-right text-[11px] text-steel font-medium leading-tight tnum">
          <div className="text-ink font-semibold">{kcal.toLocaleString()} kcal</div>
          <div>{protein}g protein</div>
          <div className="text-stone">C {carbs} · F {fat}</div>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        {SLOTS.map((slot) => {
          const k = `${day}-${slot}`;
          return (
            <MealTile
              key={slot}
              slot={slot}
              meal={meals[k]}
              isRegen={regenKey === k}
              onClick={() => onOpenMeal(k)}
              onRegen={meals[k] ? () => onRegen(k) : null}
            />
          );
        })}
      </div>
    </article>
  );
}

function Modal({ open, onClose, children, maxWidth = "max-w-lg" }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in"
      style={{ background: "var(--scrim)" }}
      onClick={onClose}
    >
      <div
        className={`${maxWidth} w-full max-h-[90vh] overflow-y-auto bg-canvas rounded-lg border border-hairline shadow-s4`}
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

function SidebarItem({ icon: Icon, label, active, onClick, dotColor }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-left transition-colors ${active ? "bg-surface-soft text-ink" : "text-charcoal hover:bg-surface-soft"}`}
    >
      {Icon && <Icon size={16} strokeWidth={2} className={active ? "text-ink" : "text-steel"} />}
      <span className="flex-1 truncate">{label}</span>
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

        <div className="flex-1 overflow-y-auto px-2.5 py-4">
          <SidebarSection title="Workspace">
            <SidebarItem icon={Calendar} label="This week" active={view === "plan"} onClick={() => { setView("plan"); onCloseSidebar(); }} />
            <SidebarItem icon={ShoppingCart} label="Grocery list" active={view === "grocery"} onClick={() => { setView("grocery"); onCloseSidebar(); }} />
            <SidebarItem icon={Package} label="Pantry" active={view === "pantry"} onClick={() => { setView("pantry"); onCloseSidebar(); }} />
          </SidebarSection>

          <SidebarSection title="Programs">
            <SidebarItem icon={Flame} label="Cut" active={activeProgramId === "cut"} onClick={() => switchProgram("cut")} dotColor={activeProgramId === "cut" ? "var(--primary)" : null} />
            <SidebarItem icon={Dumbbell} label="Maintain" active={activeProgramId === "maintain"} onClick={() => switchProgram("maintain")} dotColor={activeProgramId === "maintain" ? "var(--primary)" : null} />
            <SidebarItem icon={TrendingUp} label="Lean bulk" active={activeProgramId === "leanbulk"} onClick={() => switchProgram("leanbulk")} dotColor={activeProgramId === "leanbulk" ? "var(--primary)" : null} />
          </SidebarSection>

          <SidebarSection title="Tools">
            <SidebarItem icon={MessageCircle} label="Coach" active={view === "coach"} onClick={() => { setView("coach"); onCloseSidebar(); }} />
          </SidebarSection>
        </div>

        <div className="border-t border-hairline p-3 flex items-center gap-1">
          <IconButton label="Settings" onClick={onSettings}><SettingsIcon size={18} /></IconButton>
          <IconButton label="Sync" onClick={onSync}><Share2 size={18} /></IconButton>
          <button
            onClick={onGenerate}
            disabled={loading}
            className="ml-auto inline-flex items-center justify-center gap-2 rounded-md font-medium text-sm leading-tight px-3 py-2 bg-primary text-white hover:bg-primary-pressed transition-colors disabled:opacity-50"
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

// ── Main app ──────────────────────────────────────────────────────────

export default function App() {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...load("settings_v2", {}) }));
  const [meals, setMeals] = useState(() => load("meals_v2", {}));
  const [activeProgramId, setActiveProgramId] = useState(() => load("activeProgram", "cut"));
  const [pantry, setPantry] = useState(() => load("pantry_v1", []));
  const [pantryDraft, setPantryDraft] = useState(EMPTY_PANTRY_DRAFT);
  const [coachMessages, setCoachMessages] = useState(() => load("coachMessages_v1", []));
  const [coachInput, setCoachInput] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [view, setView] = useState("plan");
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

  useEffect(() => { save("settings_v2", settings); }, [settings]);
  useEffect(() => { save("meals_v2", meals); }, [meals]);
  useEffect(() => { save("activeProgram", activeProgramId); }, [activeProgramId]);
  useEffect(() => { save("pantry_v1", pantry); }, [pantry]);
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
      setError(`Coach: ${e.message}`);
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

  // Lower-level helper: adds an item to the pantry, merging by
  // (canonical-name, unit) when a matching row already exists.
  // Called both from the Pantry view's add form and from the cart's
  // "I bought it" checkbox.
  const addToPantry = (rawItem, qty, unit, section) => {
    const trimmed = (rawItem || "").trim();
    const safeQty = Number(qty);
    if (!trimmed || !safeQty || safeQty <= 0) return;
    const display = canonicalName(trimmed);
    const norm = display.toLowerCase();
    setPantry((prev) => {
      const matchIdx = prev.findIndex(
        (p) => canonicalName(p.item).toLowerCase() === norm && p.unit === unit,
      );
      if (matchIdx >= 0) {
        const next = [...prev];
        next[matchIdx] = { ...next[matchIdx], qty: next[matchIdx].qty + safeQty };
        return next;
      }
      return [
        ...prev,
        {
          id: `p${Date.now()}${Math.floor(Math.random() * 1000)}`,
          item: display,
          qty: safeQty,
          unit: unit || "g",
          section: section || "Other",
        },
      ];
    });
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

  const generateWeek = async () => {
    setLoading(true);
    setError(null);
    try {
      let longCookRemaining = settings.maxLongCookPerWeek;
      const newMeals = {};
      const usedNames = [];
      // Track every ingredient name + the unit it was used with so the LLM
      // stays consistent across the week (avoids "Honig" tbsp on Mon, tsp on
      // Tue, or "Banana" Mon vs "Banane" Tue).
      const usedIngredients = new Map(); // canonical lowercase → "{Item} ({unit})"
      for (const day of DAYS) {
        const isWeekend = day === "Sat" || day === "Sun";
        const allowLongCook = isWeekend && longCookRemaining > 0;
        const ingredientList = [...usedIngredients.values()];
        const dayMeals = await generateDay(day, settings, allowLongCook, usedNames, ingredientList);
        SLOTS.forEach((slot, i) => {
          const meal = dayMeals[i];
          newMeals[`${day}-${slot}`] = meal;
          if (meal?.name) usedNames.push(meal.name);
          if (meal?.prep_time === "60") longCookRemaining--;
          for (const ing of meal?.ingredients || []) {
            const k = `${canonicalName(ing.item).toLowerCase()}|${ing.unit || ""}`;
            if (!usedIngredients.has(k)) {
              usedIngredients.set(k, `${ing.item} (${ing.unit})`);
            }
          }
        });
        setMeals({ ...newMeals });
      }
    } catch (e) {
      console.error(e);
      setError(e.message);
    }
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
      const meal = await apiRegenerateMeal(day, slot, settings, others);
      setMeals((prev) => ({ ...prev, [key]: meal }));
    } catch (e) {
      console.error(e);
      setError(`Regeneration failed: ${e.message}`);
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
      setMeals(payload.meals || {});
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
            className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-primary text-white disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </button>
        </header>

        <main className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
          {/* ── Page heading ────────────────────────────────────── */}
          <header className="mb-8">
            <Eyebrow>Week 01 · {activeProgram.name}</Eyebrow>
            <h1 className="mt-1.5 text-3xl sm:text-4xl lg:text-[44px] font-semibold tracking-[-0.5px] text-ink leading-[1.1]">
              {viewTitle}
            </h1>
            {view === "plan" && (
              <p className="mt-2 text-base text-slate max-w-[520px]">
                {hasMeals
                  ? "Seven days · 28 meals · macro-balanced. Tap any meal for ingredients and method."
                  : "Set your targets, then generate a week. Plans rebalance to within ±1% of macros."}
              </p>
            )}
          </header>

        {/* ── Error banner ─────────────────────────────────────── */}
        {error && (
          <div className="mb-6 p-4 rounded-lg flex items-start gap-3 fade-in" style={{ background: "var(--error-tint)" }}>
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-error" />
            <div className="flex-1 text-sm text-error font-medium">{error}</div>
            <button onClick={() => setError(null)} className="text-error/70 hover:text-error">
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

        {/* ── Initial loading (Plan view only) ─────────────────── */}
        {view === "plan" && loading && !hasMeals && (
          <div className="py-24 text-center fade-in">
            <Loader2 size={28} className="animate-spin text-primary mx-auto mb-4" />
            <Eyebrow className="!text-slate">Composing the week</Eyebrow>
            <p className="mt-2 text-xs text-stone">filling in day by day…</p>
          </div>
        )}

        {/* ── Plan view: 7 day cards, today first ──────────────── */}
        {view === "plan" && hasMeals && (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {orderedDays.map((day, di) => (
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
            ))}
          </div>
        )}

        {/* ── Grocery view: consolidated by section ────────────── */}
        {view === "grocery" && hasMeals && (
          <div className="fade-in">
            <p className="text-sm text-steel mb-5">
              {groceryItemCount} {groceryItemCount === 1 ? "item" : "items"} · sorted by aisle
            </p>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {groceryCategories.map(({ section, items }) => (
                <div
                  key={section}
                  className="bg-canvas rounded-lg border border-hairline p-5"
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
                            className="w-4 h-4 rounded-xs grid place-items-center shrink-0 border border-hairline-strong group-hover:border-primary group-hover:bg-primary/10 transition-colors"
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
                {pantryBySection.map(({ section, items }) => (
                  <div key={section} className="bg-canvas rounded-lg border border-hairline p-5">
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
            <div className="bg-canvas border border-hairline rounded-lg p-3 sticky bottom-4 shadow-s1">
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
          </div>
        )}
      </Modal>

      {/* ── Sync modal ─────────────────────────────────────────── */}
      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} maxWidth="max-w-lg">
        <ModalHeader title="Sync" onClose={() => setTransferOpen(false)} />
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
                  Move this week to another device: copy the code, send it to yourself (Notes or iMessage), then open the planner there, tap <span className="text-primary font-medium">Sync → Import</span>, and paste.
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
            <label className="block">
              <Eyebrow className="!text-charcoal mb-2">Cuisines</Eyebrow>
              <Input
                type="text"
                value={settings.cuisines}
                onChange={(e) => setSettings((p) => ({ ...p, cuisines: e.target.value }))}
              />
            </label>
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
