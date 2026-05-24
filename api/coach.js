import Anthropic from "@anthropic-ai/sdk";

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

USER: 39yo male, 180cm, 79kg, cutting to 75kg. Trains 4x/week (2 cardio, 2 lifting). Newborn baby — needs FAST cooking on weekdays. A capable cook, but time-constrained.

HOW TO RESPOND:
- Be concise and direct. 1-3 sentences of advice, then the changes.
- If the user asks to swap, change, or rebuild a meal, return the FULL new meal in proposedChanges (one entry per change). Each meal must satisfy the schema and respect the user's targets.
- If the user is just asking advice (no change needed) — return an empty proposedChanges array.
- Day-slot keys you can target: ${DAYS.map((d) => SLOTS.map((s) => `${d}-${s}`)).flat().join(", ")}.

PRIORITIES, in order, for every meal you propose:
1. Hit the protein target. Protein is the #1 priority.
2. Stay close to the calorie target for the slot.
3. Respect the prep-time constraint the user mentions (or the slot default: breakfast/snack 5min, lunch 15min, dinner 30min weekdays / 60min weekend).

INGREDIENT RULES (same as the planner):
- ALWAYS use German supermarket names — never English. Banane (not Banana), Hähnchenbrust (not Chicken Breast), Lachsfilet (not Salmon Fillet), Hüttenkäse (not Cottage Cheese), Eier (not Eggs), Linsen (not Lentils), Haferflocken (not Oats), Walnüsse (not Walnuts), Mandeln (not Almonds), Erdnussbutter (not Peanut Butter), Honig (not Honey), Sojasauce (not Soy Sauce), Olivenöl (not Olive Oil), Gurke (not Cucumber), Knoblauch (not Garlic), Ingwer (not Ginger), Petersilie (not Parsley), Zitronensaft (not Lemon Juice), Paprika (not Bell Pepper), Tomate (not Tomato), Kirschtomaten (not Cherry Tomatoes), Rote Zwiebel (not Red Onion), Brokkoli (not Broccoli). Skyr, Magerquark, Bulgur, Hummus, Tofu, Feta, Mango, Pak Choi are the same in both languages.
- NEVER add parenthetical clarifications to ingredient names. Write "Hähnchenbrust" — never "Hähnchenbrust (Pre-Cooked)" or "Skyr (Natur)".
- 4-8 ingredients per meal; snacks 2-4.
- "instructions" field: 1-2 short action-focused sentences.

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
  const { messages, settings, meals } = body || {};

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

  // Inject the current week + targets as context into the first user turn
  const contextHeader = `CURRENT TARGETS:
  ${settings.kcalTarget} kcal, ${settings.proteinTarget}g protein, ${settings.carbsTarget}g carbs, ${settings.fatTarget}g fat (per day).

CURRENT WEEK:
${summarizeWeek(meals || {})}

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
      const status = err.status === 429 ? 429 : 502;
      return res.status(status).json({ error: `Anthropic API error: ${err.message}` });
    }
    return res.status(500).json({ error: `Unexpected server error: ${err?.message || "unknown"}` });
  }
}
