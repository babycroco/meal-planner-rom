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

const TIME_COLORS = {
  "5": "#7fb069",
  "15": "#c9a961",
  "30": "#d49058",
  "60": "#a85c5c",
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

  return (
    <div className="min-h-screen w-full" style={{ background: "#0a0a0a", fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div className="max-w-6xl mx-auto px-5 py-8 relative grain">
        <header className="flex items-end justify-between mb-10 pb-6" style={{ borderBottom: "1px solid #1f1f1f" }}>
          <div>
            <div className="text-xs tracking-[0.3em] uppercase mb-2" style={{ color: "#6b6b6b" }}>Week 01 · Cut</div>
            <h1 className="text-5xl md:text-6xl font-bold leading-none" style={{ color: "#f0ebe0", letterSpacing: "-0.02em" }}>The Menu</h1>
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2 hover:opacity-70 transition" style={{ color: "#a89a7d" }}>
            <Settings size={20} />
          </button>
        </header>

        {error && (
          <div className="mb-6 p-4 flex items-start gap-3 fade-in" style={{ background: "#2a1010", border: "1px solid #5a1f1f" }}>
            <AlertCircle size={18} style={{ color: "#e07070", flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1 text-sm" style={{ color: "#e07070" }}>{error}</div>
            <button onClick={() => setError(null)} style={{ color: "#e07070" }}><X size={16} /></button>
          </div>
        )}

        {hasMeals && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px mb-8 fade-in" style={{ background: "#1f1f1f" }}>
            <div className="p-5" style={{ background: "#0a0a0a" }}>
              <div className="text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: "#6b6b6b" }}>Avg kcal · day</div>
              <div className="text-3xl font-bold" style={{ color: "#f0ebe0" }}>{Math.round(totalKcal / 7)}</div>
              <div className="text-xs mt-1" style={{ color: "#a89a7d" }}>target {settings.kcalTarget}</div>
            </div>
            <div className="p-5" style={{ background: "#0a0a0a" }}>
              <div className="text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: "#6b6b6b" }}>Avg Protein</div>
              <div className="text-3xl font-bold" style={{ color: "#f0ebe0" }}>{Math.round(totalProtein / 7)}<span className="text-base font-normal" style={{ color: "#a89a7d" }}>g</span></div>
              <div className="text-xs mt-1" style={{ color: "#a89a7d" }}>target {settings.proteinTarget}g</div>
            </div>
            <div className="p-5" style={{ background: "#0a0a0a" }}>
              <div className="text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: "#6b6b6b" }}>Avg Carbs</div>
              <div className="text-3xl font-bold" style={{ color: "#f0ebe0" }}>{Math.round(totalCarbs / 7)}<span className="text-base font-normal" style={{ color: "#a89a7d" }}>g</span></div>
              <div className="text-xs mt-1" style={{ color: "#a89a7d" }}>target {settings.carbsTarget}g</div>
            </div>
            <div className="p-5" style={{ background: "#0a0a0a" }}>
              <div className="text-[10px] tracking-[0.25em] uppercase mb-2" style={{ color: "#6b6b6b" }}>Avg Fat</div>
              <div className="text-3xl font-bold" style={{ color: "#f0ebe0" }}>{Math.round(totalFat / 7)}<span className="text-base font-normal" style={{ color: "#a89a7d" }}>g</span></div>
              <div className="text-xs mt-1" style={{ color: "#a89a7d" }}>target {settings.fatTarget}g</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-8">
          <button onClick={generateWeek} disabled={loading} className="px-6 py-3 flex items-center gap-2 transition disabled:opacity-50 hover:opacity-90" style={{ background: "#c9a961", color: "#0a0a0a", fontWeight: 600 }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {hasMeals ? "Regenerate Week" : "Generate Week"}
          </button>
          {hasMeals && (
            <button onClick={buildGroceryList} className="px-6 py-3 flex items-center gap-2 transition hover:opacity-90" style={{ background: "transparent", color: "#f0ebe0", border: "1px solid #3a3a3a" }}>
              <ShoppingCart size={16} />
              Grocery List
            </button>
          )}
          <button onClick={() => { setTransferMode(hasMeals ? "export" : "import"); setTransferOpen(true); }} className="px-6 py-3 flex items-center gap-2 transition hover:opacity-90" style={{ background: "transparent", color: "#f0ebe0", border: "1px solid #3a3a3a" }}>
            <Share2 size={16} />
            Sync
          </button>
          {hasMeals && (
            <div className="flex ml-auto" style={{ border: "1px solid #3a3a3a" }}>
              <button onClick={() => setView("plan")} className="px-4 py-3 text-xs tracking-[0.2em] uppercase transition" style={{ background: view === "plan" ? "#c9a961" : "transparent", color: view === "plan" ? "#0a0a0a" : "#a89a7d" }}>Plan</button>
              <button onClick={() => setView("grocery")} disabled={!grocery} className="px-4 py-3 text-xs tracking-[0.2em] uppercase transition disabled:opacity-30" style={{ background: view === "grocery" ? "#c9a961" : "transparent", color: view === "grocery" ? "#0a0a0a" : "#a89a7d" }}>Cart</button>
            </div>
          )}
        </div>

        {!hasMeals && !loading && (
          <div className="py-24 text-center fade-in">
            <ChefHat size={48} style={{ color: "#3a3a3a", margin: "0 auto 24px" }} />
            <p className="text-lg mb-2" style={{ color: "#a89a7d" }}>No menu yet.</p>
            <p className="text-sm" style={{ color: "#6b6b6b" }}>Tune your settings, then generate a week.</p>
          </div>
        )}

        {loading && !hasMeals && (
          <div className="py-24 text-center fade-in">
            <Loader2 size={32} className="animate-spin" style={{ color: "#c9a961", margin: "0 auto 16px" }} />
            <p className="text-sm tracking-[0.2em] uppercase" style={{ color: "#a89a7d" }}>Composing the week</p>
            <p className="text-xs mt-2" style={{ color: "#6b6b6b" }}>filling in day by day…</p>
          </div>
        )}

        {view === "plan" && hasMeals && (
          <div className="space-y-px fade-in" style={{ background: "#1f1f1f" }}>
            {DAYS.map((day, di) => (
              <div key={day} className="flex flex-col md:flex-row gap-px" style={{ background: "#1f1f1f" }}>
                <div className="md:w-48 shrink-0 p-4 flex md:flex-col justify-between md:justify-start" style={{ background: "#0a0a0a" }}>
                  <div>
                    <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "#6b6b6b" }}>Day 0{di + 1}</div>
                    <div className="text-2xl font-bold mt-1" style={{ color: "#f0ebe0" }}>{day}</div>
                  </div>
                  <div className="text-right md:text-left md:mt-4">
                    <div className="text-xs" style={{ color: "#a89a7d" }}>{dayKcal(day)} kcal</div>
                    <div className="text-xs" style={{ color: "#c9a961" }}>{dayProtein(day)}g protein</div>
                    <div className="text-[10px]" style={{ color: "#6b6b6b" }}>C {dayCarbs(day)} · F {dayFat(day)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-px flex-1" style={{ background: "#1f1f1f" }}>
                {SLOTS.map(slot => {
                  const k = `${day}-${slot}`;
                  const m = meals[k];
                  const isRegen = regenKey === k;
                  return (
                    <button key={k} onClick={() => m && setActiveMeal(k)} className="p-4 text-left transition hover:bg-[#141414] relative group" style={{ background: "#0a0a0a" }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] tracking-[0.25em] uppercase" style={{ color: "#6b6b6b" }}>{SLOT_LABELS[slot]}</div>
                        {m?.prep_time && (
                          <div className="flex items-center gap-1 text-[10px]" style={{ color: TIME_COLORS[m.prep_time] }}>
                            <Clock size={9} />
                            {TIME_LABELS[m.prep_time]}
                          </div>
                        )}
                      </div>
                      {isRegen ? (
                        <div className="flex items-center gap-2 text-sm" style={{ color: "#a89a7d" }}>
                          <Loader2 size={14} className="animate-spin" /> Reworking…
                        </div>
                      ) : m ? (
                        <>
                          <div className="text-sm mb-2 leading-snug" style={{ color: "#f0ebe0", minHeight: "2.5em" }}>{m.name}</div>
                          <div className="flex gap-2 text-[11px] flex-wrap" style={{ color: "#a89a7d" }}>
                            <span className="flex items-center gap-1"><Flame size={10} />{m.kcal}</span>
                            <span className="flex items-center gap-1" style={{ color: "#c9a961" }}><Beef size={10} />{m.protein_g}g</span>
                          </div>
                          <div onClick={(e) => { e.stopPropagation(); regenerateMeal(k); }} className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 transition cursor-pointer" style={{ color: "#c9a961" }}>
                            <RefreshCw size={12} />
                          </div>
                        </>
                      ) : (
                        <div className="text-sm" style={{ color: "#3a3a3a" }}>—</div>
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
          <div className="fade-in">
            {grocery.recipes.map(recipe => {
              const totalItems = recipe.ingredients.length;
              const checkedCount = recipe.ingredients.filter((_, i) => checked[`${recipe.key}-${i}`]).length;
              const allDone = checkedCount === totalItems && totalItems > 0;
              return (
                <div key={recipe.key} className="mb-10" style={{ opacity: allDone ? 0.5 : 1, transition: "opacity 0.3s" }}>
                  <div className="flex items-baseline justify-between gap-4 mb-4 pb-2" style={{ borderBottom: "1px solid #1f1f1f" }}>
                    <div className="flex items-baseline gap-3 min-w-0 flex-1">
                      <h3 className="text-xs tracking-[0.3em] uppercase flex-shrink-0" style={{ color: "#c9a961" }}>
                        {recipe.day} · {SLOT_LABELS[recipe.slot]}
                      </h3>
                      <div className="text-sm truncate" style={{ color: "#f0ebe0" }}>{recipe.name}</div>
                    </div>
                    <div className="text-xs tabular-nums flex-shrink-0" style={{ color: allDone ? "#c9a961" : "#3a3a3a" }}>
                      {checkedCount}/{totalItems}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {recipe.ingredients.map((ing, i) => {
                      const id = `${recipe.key}-${i}`;
                      const isChecked = checked[id];
                      return (
                        <button key={id} onClick={() => setChecked(p => ({ ...p, [id]: !p[id] }))} className="w-full flex items-center gap-4 py-2 px-1 text-left transition hover:bg-[#141414]">
                          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 transition" style={{ border: `1px solid ${isChecked ? "#c9a961" : "#3a3a3a"}`, background: isChecked ? "#c9a961" : "transparent" }}>
                            {isChecked && <Check size={11} style={{ color: "#0a0a0a" }} strokeWidth={3} />}
                          </div>
                          <div className="flex-1 text-sm" style={{ color: isChecked ? "#3a3a3a" : "#f0ebe0", textDecoration: isChecked ? "line-through" : "none" }}>{ing.item}</div>
                          <div className="text-xs tabular-nums" style={{ color: isChecked ? "#3a3a3a" : "#a89a7d" }}>{ing.qty} {ing.unit}</div>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }} onClick={() => setActiveMeal(null)}>
            <div className="max-w-2xl w-full max-h-[85vh] overflow-y-auto fade-in" style={{ background: "#0f0f0f", border: "1px solid #1f1f1f" }} onClick={e => e.stopPropagation()}>
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "#c9a961" }}>{activeMeal.replace("-", " · ")}</div>
                      {meals[activeMeal].prep_time && (
                        <div className="flex items-center gap-1 text-[10px] px-2 py-0.5" style={{ color: TIME_COLORS[meals[activeMeal].prep_time], border: `1px solid ${TIME_COLORS[meals[activeMeal].prep_time]}` }}>
                          <Clock size={9} />
                          {TIME_LABELS[meals[activeMeal].prep_time]}
                        </div>
                      )}
                    </div>
                    <h2 className="text-3xl font-bold leading-tight" style={{ color: "#f0ebe0" }}>{meals[activeMeal].name}</h2>
                  </div>
                  <button onClick={() => setActiveMeal(null)} style={{ color: "#6b6b6b" }}><X size={20} /></button>
                </div>
                <div className="grid grid-cols-4 gap-4 mb-8 pb-6" style={{ borderBottom: "1px solid #1f1f1f" }}>
                  <div><div className="text-[10px] tracking-[0.25em] uppercase" style={{ color: "#6b6b6b" }}>Kcal</div><div className="text-xl font-bold" style={{ color: "#f0ebe0" }}>{meals[activeMeal].kcal}</div></div>
                  <div><div className="text-[10px] tracking-[0.25em] uppercase" style={{ color: "#6b6b6b" }}>Protein</div><div className="text-xl font-bold" style={{ color: "#c9a961" }}>{meals[activeMeal].protein_g}g</div></div>
                  <div><div className="text-[10px] tracking-[0.25em] uppercase" style={{ color: "#6b6b6b" }}>Carbs</div><div className="text-xl font-bold" style={{ color: "#f0ebe0" }}>{meals[activeMeal].carbs_g}g</div></div>
                  <div><div className="text-[10px] tracking-[0.25em] uppercase" style={{ color: "#6b6b6b" }}>Fat</div><div className="text-xl font-bold" style={{ color: "#f0ebe0" }}>{meals[activeMeal].fat_g}g</div></div>
                </div>
                <div className="mb-6">
                  <div className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: "#c9a961" }}>Ingredients</div>
                  <div className="space-y-1.5">
                    {meals[activeMeal].ingredients?.map((ing, i) => (
                      <div key={i} className="flex justify-between text-sm py-1" style={{ borderBottom: "1px dotted #1f1f1f" }}>
                        <span style={{ color: "#f0ebe0" }}>{ing.item}</span>
                        <span style={{ color: "#a89a7d" }}>{ing.qty} {ing.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: "#c9a961" }}>Method</div>
                  <p className="text-sm leading-relaxed" style={{ color: "#a89a7d" }}>{meals[activeMeal].instructions}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {transferOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }} onClick={() => setTransferOpen(false)}>
            <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto fade-in" style={{ background: "#0f0f0f", border: "1px solid #1f1f1f" }} onClick={e => e.stopPropagation()}>
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold" style={{ color: "#f0ebe0" }}>Sync</h2>
                  <button onClick={() => setTransferOpen(false)} style={{ color: "#6b6b6b" }}><X size={20} /></button>
                </div>
                <div className="flex mb-6" style={{ border: "1px solid #3a3a3a" }}>
                  <button onClick={() => setTransferMode("export")} className="flex-1 px-4 py-2 text-xs tracking-[0.2em] uppercase transition" style={{ background: transferMode === "export" ? "#c9a961" : "transparent", color: transferMode === "export" ? "#0a0a0a" : "#a89a7d" }}>Export</button>
                  <button onClick={() => setTransferMode("import")} className="flex-1 px-4 py-2 text-xs tracking-[0.2em] uppercase transition" style={{ background: transferMode === "import" ? "#c9a961" : "transparent", color: transferMode === "import" ? "#0a0a0a" : "#a89a7d" }}>Import</button>
                </div>
                {transferMode === "export" ? (
                  hasMeals ? (
                    <>
                      <p className="text-sm mb-4 leading-relaxed" style={{ color: "#a89a7d" }}>
                        Tap <span style={{ color: "#c9a961" }}>Select All</span>, long-press the highlighted text, choose <span style={{ color: "#c9a961" }}>Copy</span>. Paste into Notes to send to your other device.
                      </p>
                      <textarea readOnly value={exportPayload()} onClick={selectAllInTextarea} onFocus={selectAllInTextarea} className="w-full p-3 text-xs font-mono mb-3" style={{ background: "#0a0a0a", color: "#a89a7d", border: "1px solid #3a3a3a", height: "140px", resize: "none", wordBreak: "break-all" }} />
                      <div className="flex gap-2">
                        <button onClick={(e) => { const ta = e.currentTarget.parentElement.parentElement.querySelector("textarea"); if (ta) selectAllInTextarea({ target: ta }); }} className="flex-1 px-4 py-3 text-xs tracking-[0.2em] uppercase transition hover:opacity-90" style={{ background: "transparent", color: "#f0ebe0", border: "1px solid #3a3a3a" }}>Select All</button>
                        <button onClick={handleCopy} className="flex-1 px-4 py-3 flex items-center justify-center gap-2 transition hover:opacity-90" style={{ background: "#c9a961", color: "#0a0a0a", fontWeight: 600 }}>
                          {copyOk ? <><Check size={14} /> Copied</> : <><Share2 size={14} /> Try Copy</>}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: "#a89a7d" }}>Generate a week first.</p>
                  )
                ) : (
                  <>
                    <p className="text-sm mb-4 leading-relaxed" style={{ color: "#a89a7d" }}>Paste a plan code from your other device.</p>
                    <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste plan code…" className="w-full p-3 text-xs font-mono mb-4" style={{ background: "#0a0a0a", color: "#f0ebe0", border: "1px solid #3a3a3a", height: "140px", resize: "none", wordBreak: "break-all" }} />
                    <button onClick={handleImport} disabled={!importText.trim()} className="w-full px-6 py-3 flex items-center justify-center gap-2 transition disabled:opacity-30" style={{ background: "#c9a961", color: "#0a0a0a", fontWeight: 600 }}>
                      <Download size={16} /> Import Plan
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }} onClick={() => setShowSettings(false)}>
            <div className="max-w-md w-full max-h-[90vh] overflow-y-auto fade-in" style={{ background: "#0f0f0f", border: "1px solid #1f1f1f" }} onClick={e => e.stopPropagation()}>
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold" style={{ color: "#f0ebe0" }}>Settings</h2>
                  <button onClick={() => setShowSettings(false)} style={{ color: "#6b6b6b" }}><X size={20} /></button>
                </div>
                <div className="space-y-5">
                  <div>
                    <div className="text-[10px] tracking-[0.25em] uppercase mb-3" style={{ color: "#c9a961" }}>Daily targets</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <input type="number" value={settings.kcalTarget} onChange={e => setSettings(p => ({ ...p, kcalTarget: Number(e.target.value) }))} className="w-full px-3 py-2 text-sm" style={{ background: "#0a0a0a", color: "#f0ebe0", border: "1px solid #3a3a3a" }} />
                        <div className="text-[10px] mt-1" style={{ color: "#6b6b6b" }}>kcal</div>
                      </div>
                      <div>
                        <input type="number" value={settings.proteinTarget} onChange={e => setSettings(p => ({ ...p, proteinTarget: Number(e.target.value) }))} className="w-full px-3 py-2 text-sm" style={{ background: "#0a0a0a", color: "#f0ebe0", border: "1px solid #3a3a3a" }} />
                        <div className="text-[10px] mt-1" style={{ color: "#6b6b6b" }}>Protein (g)</div>
                      </div>
                      <div>
                        <input type="number" value={settings.carbsTarget} onChange={e => setSettings(p => ({ ...p, carbsTarget: Number(e.target.value) }))} className="w-full px-3 py-2 text-sm" style={{ background: "#0a0a0a", color: "#f0ebe0", border: "1px solid #3a3a3a" }} />
                        <div className="text-[10px] mt-1" style={{ color: "#6b6b6b" }}>Carbs (g)</div>
                      </div>
                      <div>
                        <input type="number" value={settings.fatTarget} onChange={e => setSettings(p => ({ ...p, fatTarget: Number(e.target.value) }))} className="w-full px-3 py-2 text-sm" style={{ background: "#0a0a0a", color: "#f0ebe0", border: "1px solid #3a3a3a" }} />
                        <div className="text-[10px] mt-1" style={{ color: "#6b6b6b" }}>Fat (g)</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] tracking-[0.25em] uppercase mb-3" style={{ color: "#c9a961" }}>Meal split (% of daily)</div>
                    <div className="grid grid-cols-4 gap-2">
                      {SLOTS.map(s => (
                        <div key={s}>
                          <input type="number" value={settings[`${s}Pct`]} onChange={e => setSettings(p => ({ ...p, [`${s}Pct`]: Number(e.target.value) }))} className="w-full px-2 py-2 text-sm text-center" style={{ background: "#0a0a0a", color: "#f0ebe0", border: "1px solid #3a3a3a" }} />
                          <div className="text-[10px] mt-1 text-center" style={{ color: "#6b6b6b" }}>{SLOT_LABELS[s]}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] mt-2" style={{ color: pctSum === 100 ? "#7fb069" : "#a85c5c" }}>
                      Sum: {pctSum}% {pctSum !== 100 && "(should be 100)"}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] tracking-[0.25em] uppercase block mb-2" style={{ color: "#c9a961" }}>Max long-cook meals per week</label>
                    <input type="number" min="0" max="14" value={settings.maxLongCookPerWeek} onChange={e => setSettings(p => ({ ...p, maxLongCookPerWeek: Number(e.target.value) }))} className="w-full px-3 py-2 text-sm" style={{ background: "#0a0a0a", color: "#f0ebe0", border: "1px solid #3a3a3a" }} />
                    <div className="text-[10px] mt-1" style={{ color: "#6b6b6b" }}>Meals over 30 min. Reserved for weekends.</div>
                  </div>

                  <div>
                    <label className="text-[10px] tracking-[0.25em] uppercase block mb-2" style={{ color: "#c9a961" }}>Cuisines</label>
                    <input type="text" value={settings.cuisines} onChange={e => setSettings(p => ({ ...p, cuisines: e.target.value }))} className="w-full px-3 py-2 text-sm" style={{ background: "#0a0a0a", color: "#f0ebe0", border: "1px solid #3a3a3a" }} />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.25em] uppercase block mb-2" style={{ color: "#c9a961" }}>Avoid</label>
                    <input type="text" value={settings.avoid} onChange={e => setSettings(p => ({ ...p, avoid: e.target.value }))} placeholder="e.g. mushrooms" className="w-full px-3 py-2 text-sm" style={{ background: "#0a0a0a", color: "#f0ebe0", border: "1px solid #3a3a3a" }} />
                  </div>
                  <div className="text-[10px] pt-2" style={{ color: "#6b6b6b" }}>Saved automatically.</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
