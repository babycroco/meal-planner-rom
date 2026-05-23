import { useState, useEffect } from "react";
import {
  Settings,
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
const ROMAN = ["i", "ii", "iii", "iv"];

const DEFAULT_SETTINGS = {
  kcalTarget: 2000,
  proteinTarget: 160,
  carbsTarget: 200,
  fatTarget: 65,
  // % of daily macros per slot
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

// Deepened for legibility on the light paper background.
const TIME_COLORS = {
  "5": "#4f7a3f",
  "15": "#a9802a",
  "30": "#bd6a2e",
  "60": "#a8442f",
};

// Light tints of the time colors — used as chip backgrounds.
const TIME_BG = {
  "5": "#e6ede0",
  "15": "#f1e6c8",
  "30": "#f3ddc8",
  "60": "#f0d8cb",
};

export default function App() {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...load("settings_v2", {}) }));
  const [meals, setMeals] = useState(() => load("meals_v2", {}));
  const [grocery, setGrocery] = useState(() => load("grocery_v2", null));
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
  useEffect(() => { save("grocery_v2", grocery); }, [grocery]);
  useEffect(() => { save("checked_v2", checked); }, [checked]);

  const generateWeek = async () => {
    setLoading(true);
    setError(null);
    try {
      // Long-cook meals are reserved for the weekend, capped per week.
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
        setMeals({ ...newMeals }); // progressive fill — the grid populates day by day
      }
      setGrocery(null);
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
      setGrocery(null);
    } catch (e) {
      console.error(e);
      setError(`Regeneration failed: ${e.message}`);
    }
    setRegenKey(null);
  };

  const buildGroceryList = () => {
    const byRecipe = [];
    for (const day of DAYS) {
      for (const slot of SLOTS) {
        const k = `${day}-${slot}`;
        const m = meals[k];
        if (!m?.ingredients?.length) continue;
        byRecipe.push({
          key: k, day, slot, name: m.name, prep_time: m.prep_time,
          ingredients: m.ingredients,
        });
      }
    }
    setGrocery({ mode: "byRecipe", recipes: byRecipe });
    setChecked({});
    setView("grocery");
  };

  const exportPayload = () => {
    const payload = { v: 2, settings, meals, grocery, checked };
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
      setGrocery(payload.grocery || null);
      setChecked(payload.checked || {});
      setImportText("");
      setTransferOpen(false);
    } catch (e) {
      setError(`Import failed: ${e.message}`);
    }
  };

  // Stats
  const dayKcal = (day) => SLOTS.reduce((s, slot) => s + (meals[`${day}-${slot}`]?.kcal || 0), 0);
  const dayProtein = (day) => SLOTS.reduce((s, slot) => s + (meals[`${day}-${slot}`]?.protein_g || 0), 0);
  const dayCarbs = (day) => SLOTS.reduce((s, slot) => s + (meals[`${day}-${slot}`]?.carbs_g || 0), 0);
  const dayFat = (day) => SLOTS.reduce((s, slot) => s + (meals[`${day}-${slot}`]?.fat_g || 0), 0);
  const totalKcal = DAYS.reduce((s, d) => s + dayKcal(d), 0);
  const totalProtein = DAYS.reduce((s, d) => s + dayProtein(d), 0);
  const totalCarbs = DAYS.reduce((s, d) => s + dayCarbs(d), 0);
  const totalFat = DAYS.reduce((s, d) => s + dayFat(d), 0);
  const hasMeals = Object.keys(meals).length > 0;

  const pctSum = settings.breakfastPct + settings.lunchPct + settings.dinnerPct + settings.snackPct;

  const btnSecondary = { background: "var(--card)", color: "var(--ink)", border: "1px solid var(--line)" };
  const btnPrimary = { background: "var(--gold)", color: "var(--ink)" };
  const fieldStyle = { background: "var(--field)", color: "var(--ink)", border: "1px solid var(--line)" };

  return (
    <div className="min-h-screen w-full" style={{ background: "var(--paper)" }}>
      <div className="max-w-6xl mx-auto px-5 py-8 relative grain">
        <header className="flex items-end justify-between mb-10 pb-6" style={{ borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: "var(--ink-faint)" }}>Week 01 · Cut</div>
            <h1 className="serif text-5xl md:text-6xl font-semibold leading-none" style={{ color: "var(--ink)", letterSpacing: "-0.015em" }}>The <span className="italic">Menu</span></h1>
            <div className="flex items-center gap-3 mt-4 max-w-[260px]" style={{ color: "var(--gold-ink)" }}>
              <span className="h-px flex-1" style={{ background: "currentColor", opacity: 0.5 }} />
              <span className="text-base leading-none">✦</span>
              <span className="h-px flex-1" style={{ background: "currentColor", opacity: 0.5 }} />
            </div>
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2 hover:opacity-60 transition" style={{ color: "var(--ink-soft)" }}>
            <Settings size={20} />
          </button>
        </header>

        {error && (
          <div className="mb-6 p-4 flex items-start gap-3 fade-in bevel" style={{ background: "#f6e3da", border: "1px solid #e3b9a6" }}>
            <AlertCircle size={18} style={{ color: "#a8442f", flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1 text-sm" style={{ color: "#a8442f" }}>{error}</div>
            <button onClick={() => setError(null)} style={{ color: "#a8442f" }}><X size={16} /></button>
          </div>
        )}

        {hasMeals && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px mb-8 fade-in bevel" style={{ background: "var(--line)" }}>
            <div className="p-5" style={{ background: "var(--card)" }}>
              <div className="text-[10px] tracking-[0.22em] uppercase mb-2" style={{ color: "var(--ink-faint)" }}>Avg kcal · day</div>
              <div className="text-3xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>{Math.round(totalKcal / 7)}</div>
              <div className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>target {settings.kcalTarget}</div>
            </div>
            <div className="p-5" style={{ background: "var(--card)" }}>
              <div className="text-[10px] tracking-[0.22em] uppercase mb-2" style={{ color: "var(--ink-faint)" }}>Avg Protein</div>
              <div className="text-3xl font-bold tabular-nums" style={{ color: "var(--gold-ink)" }}>{Math.round(totalProtein / 7)}<span className="text-base font-normal" style={{ color: "var(--ink-soft)" }}>g</span></div>
              <div className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>target {settings.proteinTarget}g</div>
            </div>
            <div className="p-5" style={{ background: "var(--card)" }}>
              <div className="text-[10px] tracking-[0.22em] uppercase mb-2" style={{ color: "var(--ink-faint)" }}>Avg Carbs</div>
              <div className="text-3xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>{Math.round(totalCarbs / 7)}<span className="text-base font-normal" style={{ color: "var(--ink-soft)" }}>g</span></div>
              <div className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>target {settings.carbsTarget}g</div>
            </div>
            <div className="p-5" style={{ background: "var(--card)" }}>
              <div className="text-[10px] tracking-[0.22em] uppercase mb-2" style={{ color: "var(--ink-faint)" }}>Avg Fat</div>
              <div className="text-3xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>{Math.round(totalFat / 7)}<span className="text-base font-normal" style={{ color: "var(--ink-soft)" }}>g</span></div>
              <div className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>target {settings.fatTarget}g</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-8">
          <button onClick={generateWeek} disabled={loading} className="px-6 py-3 flex items-center gap-2 transition disabled:opacity-50 hover:opacity-90 font-semibold bevel" style={btnPrimary}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {hasMeals ? "Regenerate Week" : "Generate Week"}
          </button>
          {hasMeals && (
            <button onClick={buildGroceryList} className="px-6 py-3 flex items-center gap-2 transition hover:opacity-80 bevel" style={btnSecondary}>
              <ShoppingCart size={16} />
              Grocery List
            </button>
          )}
          <button onClick={() => { setTransferMode(hasMeals ? "export" : "import"); setTransferOpen(true); }} className="px-6 py-3 flex items-center gap-2 transition hover:opacity-80 bevel" style={btnSecondary}>
            <Share2 size={16} />
            Sync
          </button>
          {hasMeals && (
            <div className="flex ml-auto bevel" style={{ border: "1px solid var(--line)" }}>
              <button onClick={() => setView("plan")} className="px-4 py-3 text-xs tracking-[0.2em] uppercase transition" style={{ background: view === "plan" ? "var(--gold)" : "transparent", color: view === "plan" ? "var(--ink)" : "var(--ink-soft)" }}>Plan</button>
              <button onClick={() => setView("grocery")} disabled={!grocery} className="px-4 py-3 text-xs tracking-[0.2em] uppercase transition disabled:opacity-30" style={{ background: view === "grocery" ? "var(--gold)" : "transparent", color: view === "grocery" ? "var(--ink)" : "var(--ink-soft)" }}>Cart</button>
            </div>
          )}
        </div>

        {!hasMeals && !loading && (
          <div className="py-24 text-center fade-in">
            <ChefHat size={48} style={{ color: "var(--line)", margin: "0 auto 24px" }} />
            <p className="serif text-xl mb-2" style={{ color: "var(--ink)" }}>No menu yet.</p>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Tune your settings, then generate a week.</p>
          </div>
        )}

        {loading && !hasMeals && (
          <div className="py-24 text-center fade-in">
            <Loader2 size={32} className="animate-spin" style={{ color: "var(--gold-ink)", margin: "0 auto 16px" }} />
            <p className="text-sm tracking-[0.2em] uppercase" style={{ color: "var(--ink-soft)" }}>Composing the week</p>
            <p className="text-xs mt-2" style={{ color: "var(--ink-faint)" }}>filling in day by day…</p>
          </div>
        )}

        {view === "plan" && hasMeals && (
          <div className="space-y-3">
            {DAYS.map((day, di) => (
              <div key={day} className="flex flex-col md:flex-row gap-px fade-in bevel" style={{ background: "var(--line)", animationDelay: `${di * 55}ms` }}>
                <div className="md:w-48 shrink-0 p-4 flex md:flex-col justify-between md:justify-start" style={{ background: "var(--card)" }}>
                  <div>
                    <div className="text-[10px] tracking-[0.28em] uppercase" style={{ color: "var(--ink-faint)" }}>Day 0{di + 1}</div>
                    <div className="serif text-2xl font-semibold mt-1" style={{ color: "var(--ink)" }}>{day}</div>
                  </div>
                  <div className="text-right md:text-left md:mt-4">
                    <div className="text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>{dayKcal(day)} kcal</div>
                    <div className="text-xs tabular-nums" style={{ color: "var(--gold-ink)" }}>{dayProtein(day)}g protein</div>
                    <div className="text-[11px] tabular-nums" style={{ color: "var(--ink-faint)" }}>C {dayCarbs(day)} · F {dayFat(day)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-px flex-1" style={{ background: "var(--line)" }}>
                {SLOTS.map((slot, si) => {
                  const k = `${day}-${slot}`;
                  const m = meals[k];
                  const isRegen = regenKey === k;
                  return (
                    <button key={k} onClick={() => m && setActiveMeal(k)} className="p-4 text-left transition hover:bg-[#ebe3d0] relative group" style={{ background: "var(--card)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] tracking-[0.22em] uppercase flex items-baseline gap-1.5" style={{ color: "var(--ink-faint)" }}>
                          <span className="serif italic" style={{ color: "var(--gold-ink)", textTransform: "none", letterSpacing: 0 }}>{ROMAN[si]}</span>
                          <span>{SLOT_LABELS[slot]}</span>
                        </div>
                        {m?.prep_time && (
                          <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 tabular-nums" style={{ color: TIME_COLORS[m.prep_time], background: TIME_BG[m.prep_time] }}>
                            <Clock size={9} />
                            {TIME_LABELS[m.prep_time]}
                          </div>
                        )}
                      </div>
                      {isRegen ? (
                        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-soft)" }}>
                          <Loader2 size={14} className="animate-spin" /> Reworking…
                        </div>
                      ) : m ? (
                        <>
                          <div className="serif text-[15px] mb-2 leading-snug" style={{ color: "var(--ink)", minHeight: "2.5em" }}>{m.name}</div>
                          <div className="flex gap-3 text-[11px] flex-wrap tabular-nums" style={{ color: "var(--ink-soft)" }}>
                            <span className="flex items-center gap-1"><Flame size={10} />{m.kcal}</span>
                            <span className="flex items-center gap-1" style={{ color: "var(--gold-ink)" }}><Beef size={10} />{m.protein_g}g</span>
                          </div>
                          <div onClick={(e) => { e.stopPropagation(); regenerateMeal(k); }} className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 transition cursor-pointer" style={{ color: "var(--gold-ink)" }}>
                            <RefreshCw size={12} />
                          </div>
                        </>
                      ) : (
                        <div className="text-sm" style={{ color: "var(--line)" }}>—</div>
                      )}
                    </button>
                  );
                })}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "grocery" && grocery?.recipes && (
          <div className="fade-in space-y-4">
            {grocery.recipes.map(recipe => {
              const totalItems = recipe.ingredients.length;
              const checkedCount = recipe.ingredients.filter((_, i) => checked[`${recipe.key}-${i}`]).length;
              const allDone = checkedCount === totalItems && totalItems > 0;
              return (
                <div key={recipe.key} className="p-5 bevel" style={{ background: "var(--card)", opacity: allDone ? 0.5 : 1, transition: "opacity 0.3s" }}>
                  <div className="flex items-baseline justify-between gap-4 mb-4 pb-2" style={{ borderBottom: "1px solid var(--line)" }}>
                    <div className="flex items-baseline gap-3 min-w-0 flex-1">
                      <h3 className="text-xs tracking-[0.28em] uppercase flex-shrink-0 flex items-baseline gap-1.5" style={{ color: "var(--gold-ink)" }}>
                        <span className="serif italic" style={{ textTransform: "none", letterSpacing: 0 }}>{ROMAN[SLOTS.indexOf(recipe.slot)]}</span>
                        <span>{recipe.day} · {SLOT_LABELS[recipe.slot]}</span>
                      </h3>
                      <div className="serif text-[15px] truncate" style={{ color: "var(--ink)" }}>{recipe.name}</div>
                    </div>
                    <div className="text-xs tabular-nums flex-shrink-0" style={{ color: allDone ? "var(--gold-ink)" : "var(--ink-faint)" }}>
                      {checkedCount}/{totalItems}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {recipe.ingredients.map((ing, i) => {
                      const id = `${recipe.key}-${i}`;
                      const isChecked = checked[id];
                      return (
                        <button key={id} onClick={() => setChecked(p => ({ ...p, [id]: !p[id] }))} className="w-full flex items-center gap-4 py-2 px-1 text-left transition hover:bg-[#ebe3d0]">
                          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 transition" style={{ border: `1px solid ${isChecked ? "var(--gold)" : "var(--ink-faint)"}`, background: isChecked ? "var(--gold)" : "transparent" }}>
                            {isChecked && <Check size={11} style={{ color: "var(--ink)" }} strokeWidth={3} />}
                          </div>
                          <div className="flex-1 serif text-[15px]" style={{ color: isChecked ? "var(--ink-faint)" : "var(--ink)", textDecoration: isChecked ? "line-through" : "none" }}>{ing.item}</div>
                          <div className="text-xs tabular-nums" style={{ color: isChecked ? "var(--ink-faint)" : "var(--ink-soft)" }}>{ing.qty} {ing.unit}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeMeal && meals[activeMeal] && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--scrim)" }} onClick={() => setActiveMeal(null)}>
            <div className="max-w-2xl w-full max-h-[85vh] overflow-y-auto fade-in bevel" style={{ background: "var(--card)", border: "1px solid var(--line)" }} onClick={e => e.stopPropagation()}>
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-[10px] tracking-[0.28em] uppercase flex items-baseline gap-1.5" style={{ color: "var(--gold-ink)" }}>
                        <span className="serif italic" style={{ textTransform: "none", letterSpacing: 0 }}>{ROMAN[SLOTS.indexOf(activeMeal.split("-")[1])]}</span>
                        <span>{activeMeal.replace("-", " · ")}</span>
                      </div>
                      {meals[activeMeal].prep_time && (
                        <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 tabular-nums" style={{ color: TIME_COLORS[meals[activeMeal].prep_time], background: TIME_BG[meals[activeMeal].prep_time] }}>
                          <Clock size={9} />
                          {TIME_LABELS[meals[activeMeal].prep_time]}
                        </div>
                      )}
                    </div>
                    <h2 className="serif text-3xl font-semibold leading-tight" style={{ color: "var(--ink)" }}>{meals[activeMeal].name}</h2>
                  </div>
                  <button onClick={() => setActiveMeal(null)} style={{ color: "var(--ink-faint)" }}><X size={20} /></button>
                </div>
                <div className="grid grid-cols-4 gap-4 mb-8 pb-6" style={{ borderBottom: "1px solid var(--line)" }}>
                  <div><div className="text-[10px] tracking-[0.22em] uppercase" style={{ color: "var(--ink-faint)" }}>Kcal</div><div className="text-xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>{meals[activeMeal].kcal}</div></div>
                  <div><div className="text-[10px] tracking-[0.22em] uppercase" style={{ color: "var(--ink-faint)" }}>Protein</div><div className="text-xl font-bold tabular-nums" style={{ color: "var(--gold-ink)" }}>{meals[activeMeal].protein_g}g</div></div>
                  <div><div className="text-[10px] tracking-[0.22em] uppercase" style={{ color: "var(--ink-faint)" }}>Carbs</div><div className="text-xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>{meals[activeMeal].carbs_g}g</div></div>
                  <div><div className="text-[10px] tracking-[0.22em] uppercase" style={{ color: "var(--ink-faint)" }}>Fat</div><div className="text-xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>{meals[activeMeal].fat_g}g</div></div>
                </div>
                <div className="mb-6">
                  <div className="text-[10px] tracking-[0.28em] uppercase mb-3" style={{ color: "var(--gold-ink)" }}>Ingredients</div>
                  <div className="space-y-1.5">
                    {meals[activeMeal].ingredients?.map((ing, i) => (
                      <div key={i} className="flex justify-between items-baseline py-1" style={{ borderBottom: "1px dotted var(--line)" }}>
                        <span className="serif text-[15px]" style={{ color: "var(--ink)" }}>{ing.item}</span>
                        <span className="text-sm tabular-nums" style={{ color: "var(--ink-soft)" }}>{ing.qty} {ing.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] tracking-[0.28em] uppercase mb-3" style={{ color: "var(--gold-ink)" }}>Method</div>
                  <p className="serif text-[15px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>{meals[activeMeal].instructions}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {transferOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--scrim)" }} onClick={() => setTransferOpen(false)}>
            <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto fade-in bevel" style={{ background: "var(--card)", border: "1px solid var(--line)" }} onClick={e => e.stopPropagation()}>
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="serif text-2xl font-semibold" style={{ color: "var(--ink)" }}>Sync</h2>
                  <button onClick={() => setTransferOpen(false)} style={{ color: "var(--ink-faint)" }}><X size={20} /></button>
                </div>
                <div className="flex mb-6" style={{ border: "1px solid var(--line)" }}>
                  <button onClick={() => setTransferMode("export")} className="flex-1 px-4 py-2 text-xs tracking-[0.2em] uppercase transition" style={{ background: transferMode === "export" ? "var(--gold)" : "transparent", color: transferMode === "export" ? "var(--ink)" : "var(--ink-soft)" }}>Export</button>
                  <button onClick={() => setTransferMode("import")} className="flex-1 px-4 py-2 text-xs tracking-[0.2em] uppercase transition" style={{ background: transferMode === "import" ? "var(--gold)" : "transparent", color: transferMode === "import" ? "var(--ink)" : "var(--ink-soft)" }}>Import</button>
                </div>
                {transferMode === "export" ? (
                  hasMeals ? (
                    <>
                      <p className="text-sm mb-4 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                        Move this week to another device: copy the code below, send it to yourself (Notes or iMessage), then open the planner there, tap <span style={{ color: "var(--gold-ink)" }}>Sync &rarr; Import</span>, and paste it.
                      </p>
                      <textarea readOnly value={exportPayload()} onClick={selectAllInTextarea} onFocus={selectAllInTextarea} className="w-full p-3 text-xs font-mono mb-3" style={{ background: "var(--field)", color: "var(--ink-soft)", border: "1px solid var(--line)", height: "120px", resize: "none", wordBreak: "break-all" }} />
                      <div className="flex gap-2">
                        <button onClick={(e) => { const ta = e.currentTarget.parentElement.parentElement.querySelector("textarea"); if (ta) selectAllInTextarea({ target: ta }); }} className="flex-1 px-4 py-3 text-xs tracking-[0.2em] uppercase transition hover:opacity-80 bevel" style={btnSecondary}>Select All</button>
                        <button onClick={handleCopy} className="flex-1 px-4 py-3 flex items-center justify-center gap-2 transition hover:opacity-90 font-semibold bevel" style={btnPrimary}>
                          {copyOk ? <><Check size={14} /> Copied</> : <><Share2 size={14} /> Copy code</>}
                        </button>
                      </div>
                      <p className="text-[11px] mt-3 leading-relaxed" style={{ color: "var(--ink-faint)" }}>If "Copy code" does nothing on your phone, tap Select All, then long-press the highlighted text and choose Copy.</p>
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Generate a week first.</p>
                  )
                ) : (
                  <>
                    <p className="text-sm mb-4 leading-relaxed" style={{ color: "var(--ink-soft)" }}>Paste a plan code from your other device, then Import. This replaces the plan currently on this device.</p>
                    <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste plan code…" className="w-full p-3 text-xs font-mono mb-4" style={{ background: "var(--field)", color: "var(--ink)", border: "1px solid var(--line)", height: "120px", resize: "none", wordBreak: "break-all" }} />
                    <button onClick={handleImport} disabled={!importText.trim()} className="w-full px-6 py-3 flex items-center justify-center gap-2 transition disabled:opacity-30 font-semibold bevel" style={btnPrimary}>
                      <Download size={16} /> Import Plan
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--scrim)" }} onClick={() => setShowSettings(false)}>
            <div className="max-w-md w-full max-h-[90vh] overflow-y-auto fade-in bevel" style={{ background: "var(--card)", border: "1px solid var(--line)" }} onClick={e => e.stopPropagation()}>
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="serif text-2xl font-semibold" style={{ color: "var(--ink)" }}>Settings</h2>
                  <button onClick={() => setShowSettings(false)} style={{ color: "var(--ink-faint)" }}><X size={20} /></button>
                </div>
                <div className="space-y-5">
                  <div>
                    <div className="text-[10px] tracking-[0.22em] uppercase mb-3" style={{ color: "var(--gold-ink)" }}>Daily targets</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <input type="number" value={settings.kcalTarget} onChange={e => setSettings(p => ({ ...p, kcalTarget: Number(e.target.value) }))} className="w-full px-3 py-2 text-sm tabular-nums" style={fieldStyle} />
                        <div className="text-[10px] mt-1" style={{ color: "var(--ink-faint)" }}>kcal</div>
                      </div>
                      <div>
                        <input type="number" value={settings.proteinTarget} onChange={e => setSettings(p => ({ ...p, proteinTarget: Number(e.target.value) }))} className="w-full px-3 py-2 text-sm tabular-nums" style={fieldStyle} />
                        <div className="text-[10px] mt-1" style={{ color: "var(--ink-faint)" }}>Protein (g)</div>
                      </div>
                      <div>
                        <input type="number" value={settings.carbsTarget} onChange={e => setSettings(p => ({ ...p, carbsTarget: Number(e.target.value) }))} className="w-full px-3 py-2 text-sm tabular-nums" style={fieldStyle} />
                        <div className="text-[10px] mt-1" style={{ color: "var(--ink-faint)" }}>Carbs (g)</div>
                      </div>
                      <div>
                        <input type="number" value={settings.fatTarget} onChange={e => setSettings(p => ({ ...p, fatTarget: Number(e.target.value) }))} className="w-full px-3 py-2 text-sm tabular-nums" style={fieldStyle} />
                        <div className="text-[10px] mt-1" style={{ color: "var(--ink-faint)" }}>Fat (g)</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] tracking-[0.22em] uppercase mb-3" style={{ color: "var(--gold-ink)" }}>Meal split (% of daily)</div>
                    <div className="grid grid-cols-4 gap-2">
                      {SLOTS.map(s => (
                        <div key={s}>
                          <input type="number" value={settings[`${s}Pct`]} onChange={e => setSettings(p => ({ ...p, [`${s}Pct`]: Number(e.target.value) }))} className="w-full px-2 py-2 text-sm text-center tabular-nums" style={fieldStyle} />
                          <div className="text-[10px] mt-1 text-center" style={{ color: "var(--ink-faint)" }}>{SLOT_LABELS[s]}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] mt-2" style={{ color: pctSum === 100 ? "#4f7a3f" : "#a8442f" }}>
                      Sum: {pctSum}% {pctSum !== 100 && "(should be 100)"}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] tracking-[0.22em] uppercase block mb-2" style={{ color: "var(--gold-ink)" }}>Max long-cook meals per week</label>
                    <input type="number" min="0" max="14" value={settings.maxLongCookPerWeek} onChange={e => setSettings(p => ({ ...p, maxLongCookPerWeek: Number(e.target.value) }))} className="w-full px-3 py-2 text-sm tabular-nums" style={fieldStyle} />
                    <div className="text-[10px] mt-1" style={{ color: "var(--ink-faint)" }}>Meals over 30 min. Reserved for weekends.</div>
                  </div>

                  <div>
                    <label className="text-[10px] tracking-[0.22em] uppercase block mb-2" style={{ color: "var(--gold-ink)" }}>Cuisines</label>
                    <input type="text" value={settings.cuisines} onChange={e => setSettings(p => ({ ...p, cuisines: e.target.value }))} className="w-full px-3 py-2 text-sm" style={fieldStyle} />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.22em] uppercase block mb-2" style={{ color: "var(--gold-ink)" }}>Avoid</label>
                    <input type="text" value={settings.avoid} onChange={e => setSettings(p => ({ ...p, avoid: e.target.value }))} placeholder="e.g. mushrooms" className="w-full px-3 py-2 text-sm" style={fieldStyle} />
                  </div>
                  <div className="text-[10px] pt-2" style={{ color: "var(--ink-faint)" }}>Saved automatically.</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
