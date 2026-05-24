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
} from "lucide-react";
import { load, save } from "./lib/storage";
import { generateDay, regenerateMeal as apiRegenerateMeal } from "./lib/api";

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

// Curated alias map for grocery-list dedup. Keys are paren-stripped lowercase
// variants; values are the canonical German display name. The LLM is
// instructed to use German names but occasionally outputs English equivalents
// or adds parenthetical clarifications like "(Pre-Cooked)" / "(Natur)" — both
// become duplicate rows without normalization.
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
  "sobanudeln": "Sobanudeln",
  "pumpkin seeds": "Kürbiskerne",
  "kürbiskerne": "Kürbiskerne",
  "white beans": "Weiße Bohnen",
  "weiße bohnen": "Weiße Bohnen",
  "edamame": "Edamame",
  "tomato paste": "Tomatenmark",
  "tomatenmark": "Tomatenmark",
  "tabbouleh": "Tabbouleh",
};

// Strip parenthetical clarifications and collapse whitespace.
//   "Hähnchenbrust (Pre-Cooked Or Rotisserie)" → "Hähnchenbrust"
//   "Mango (Gefroren Oder Frisch)" → "Mango"
function stripParens(s) {
  return (s || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Apply the alias map to collapse EN/DE variants and paren-decorated forms
// into one canonical (German) display name. Unmatched items fall through
// unchanged, just paren-stripped.
function canonicalName(item) {
  const cleaned = stripParens(item);
  const key = cleaned.toLowerCase();
  return INGREDIENT_ALIAS[key] || cleaned;
}

// Aggregate all 28 meals' ingredients into one list per section, summing
// quantities when (canonical-name, unit) match across meals. Different units
// stay separate (no conversions — "2 piece" + "300g" remain distinct rows).
function consolidateGrocery(meals) {
  const buckets = {};
  for (const day of DAYS) {
    for (const slot of SLOTS) {
      const m = meals[`${day}-${slot}`];
      if (!m?.ingredients?.length) continue;
      for (const ing of m.ingredients) {
        const section = ing.section || "Other";
        const display = canonicalName(ing.item);
        const key = `${display.toLowerCase()}|${ing.unit || ""}`;
        if (!buckets[section]) buckets[section] = {};
        if (buckets[section][key]) {
          buckets[section][key].qty += ing.qty || 0;
        } else {
          buckets[section][key] = { ...ing, item: display, key };
        }
      }
    }
  }
  return SECTION_ORDER
    .filter((s) => buckets[s])
    .map((section) => ({
      section,
      items: Object.values(buckets[section]).sort((a, b) => a.item.localeCompare(b.item)),
    }));
}

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

// ── Main app ──────────────────────────────────────────────────────────

export default function App() {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...load("settings_v2", {}) }));
  const [meals, setMeals] = useState(() => load("meals_v2", {}));
  const [checked, setChecked] = useState(() => load("checked_v2", {}));
  const [view, setView] = useState("plan");
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
  useEffect(() => { save("checked_v2", checked); }, [checked]);

  // Grocery list is derived from meals — no separate state needed.
  const groceryCategories = useMemo(() => consolidateGrocery(meals), [meals]);
  const groceryItemCount = groceryCategories.reduce((n, c) => n + c.items.length, 0);

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
      for (const day of DAYS) {
        const isWeekend = day === "Sat" || day === "Sun";
        const allowLongCook = isWeekend && longCookRemaining > 0;
        const dayMeals = await generateDay(day, settings, allowLongCook, usedNames);
        SLOTS.forEach((slot, i) => {
          const meal = dayMeals[i];
          newMeals[`${day}-${slot}`] = meal;
          if (meal?.name) usedNames.push(meal.name);
          if (meal?.prep_time === "60") longCookRemaining--;
        });
        setMeals({ ...newMeals });
      }
      setChecked({});
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
    const payload = { v: 3, settings, meals, checked };
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
      // v2 payloads keyed checked by `${recipeKey}-${index}`; v3 keys by `${item}|${unit}`.
      // Either form coexists harmlessly — stale keys just don't match new rows.
      setChecked(payload.checked || {});
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

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* ── Top nav ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-20 h-16 bg-canvas border-b border-hairline">
        <div className="max-w-[1280px] mx-auto h-full px-6 sm:px-8 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2.5 select-none">
            <span className="w-7 h-7 rounded-sm bg-ink-deep text-white grid place-items-center text-base font-bold leading-none">M</span>
            <span className="text-[18px] font-semibold tracking-[-0.4px] text-ink">Meals</span>
          </a>
          <div className="flex items-center gap-1.5">
            <IconButton label="Sync" onClick={() => { setTransferMode(hasMeals ? "export" : "import"); setTransferOpen(true); }}>
              <Share2 size={18} />
            </IconButton>
            <IconButton label="Settings" onClick={() => setShowSettings(true)}>
              <SettingsIcon size={18} />
            </IconButton>
            <Button onClick={generateWeek} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {hasMeals ? "Regenerate" : "Generate week"}
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-[1280px] mx-auto px-6 sm:px-8 py-10">
        {/* ── Page heading + plan controls ─────────────────────── */}
        <header className="flex flex-wrap items-end justify-between gap-6 mb-8">
          <div>
            <Eyebrow>Week 01 · Cut</Eyebrow>
            <h1 className="mt-1.5 text-4xl sm:text-[44px] font-semibold tracking-[-0.5px] text-ink leading-[1.1]">
              This week's menu
            </h1>
            <p className="mt-2 text-base text-slate max-w-[520px]">
              {hasMeals
                ? "Seven days · 28 meals · macro-balanced. Tap any meal for ingredients and method."
                : "Set your targets, then generate a week. Plans rebalance to within ±1% of macros."}
            </p>
          </div>

          {hasMeals && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex gap-1.5 p-1 rounded-full bg-surface-soft">
                <button
                  onClick={() => setView("plan")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${view === "plan" ? "bg-ink-deep text-white" : "text-steel hover:text-ink"}`}
                >
                  Plan
                </button>
                <button
                  onClick={() => setView("grocery")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors inline-flex items-center gap-1.5 ${view === "grocery" ? "bg-ink-deep text-white" : "text-steel hover:text-ink"}`}
                >
                  <ShoppingCart size={13} /> Cart
                </button>
              </div>
            </div>
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

        {/* ── Macro stat strip ─────────────────────────────────── */}
        {hasMeals && (
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

        {/* ── Empty state ──────────────────────────────────────── */}
        {!hasMeals && !loading && (
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

        {/* ── Initial loading (no meals yet) ───────────────────── */}
        {loading && !hasMeals && (
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
            <div className="flex items-end justify-between gap-4 mb-5">
              <div>
                <Eyebrow>Cart · Week 01</Eyebrow>
                <h2 className="mt-1 text-2xl sm:text-3xl font-semibold text-ink tracking-[-0.3px]">Grocery list</h2>
                <p className="mt-1 text-sm text-steel">
                  {groceryItemCount} {groceryItemCount === 1 ? "item" : "items"} · sorted by aisle
                </p>
              </div>
            </div>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {groceryCategories.map(({ section, items }) => {
                const done = items.filter((it) => checked[it.key]).length;
                const allDone = done === items.length && items.length > 0;
                return (
                  <div
                    key={section}
                    className="bg-canvas rounded-lg border border-hairline p-5 transition-opacity"
                    style={{ opacity: allDone ? 0.55 : 1 }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-hairline-soft">
                      <Eyebrow>{section}</Eyebrow>
                      <span className="shrink-0 text-xs text-stone font-medium tnum">
                        {done}/{items.length}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {items.map((ing) => {
                        const isChecked = !!checked[ing.key];
                        return (
                          <li key={ing.key}>
                            <button
                              onClick={() => setChecked((p) => ({ ...p, [ing.key]: !p[ing.key] }))}
                              className="w-full flex items-center gap-3 py-1.5 px-1 text-left rounded-sm hover:bg-surface-soft transition-colors"
                            >
                              <span
                                className="w-4 h-4 rounded-xs grid place-items-center shrink-0 border transition-colors"
                                style={{
                                  background: isChecked ? "var(--primary)" : "transparent",
                                  borderColor: isChecked ? "var(--primary)" : "var(--hairline-strong)",
                                }}
                              >
                                {isChecked && <Check size={11} strokeWidth={3} className="text-white" />}
                              </span>
                              <span
                                className="flex-1 text-sm capitalize"
                                style={{
                                  color: isChecked ? "var(--stone)" : "var(--ink)",
                                  textDecoration: isChecked ? "line-through" : "none",
                                }}
                              >
                                {ing.item}
                              </span>
                              <span className="text-xs tnum text-steel font-medium shrink-0">
                                {ing.qty} {ing.unit}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

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
