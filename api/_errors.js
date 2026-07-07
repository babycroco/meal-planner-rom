// Shared by the serverless functions (the leading "_" keeps Vercel from
// treating this as an API route). Maps an Anthropic SDK error to a SAFE,
// specific user-facing message + HTTP status. Billing, auth-key, rate-limit,
// and overload states each get their own clear copy so the app can tell the
// user exactly what to fix instead of a generic "something went wrong". The
// raw error is logged at the call site; only these curated strings reach the
// client, so backend/config details never leak into the UI.
export function anthropicUserError(err) {
  const status = typeof err?.status === "number" ? err.status : 0;
  const msg = (err && err.message ? String(err.message) : "").toLowerCase();

  // Out of credits — the most common real-world failure. 400 invalid_request
  // whose message mentions the credit balance / billing page.
  if (status === 402 || msg.includes("credit balance") || msg.includes("plans & billing") || msg.includes("purchase credits")) {
    return {
      status: 402,
      error:
        "Claude is out of API credits — the chef can't cook until the Anthropic account is topped up (console.anthropic.com → Plans & Billing). Try again once you've added credits.",
    };
  }
  // Bad / missing / revoked API key.
  if (status === 401 || msg.includes("authentication") || msg.includes("invalid x-api-key") || msg.includes("invalid api key")) {
    return {
      status: 502,
      error:
        "Claude rejected the API key. Check ANTHROPIC_API_KEY in the Vercel project settings, then try again.",
    };
  }
  // Rate limited.
  if (status === 429 || msg.includes("rate limit")) {
    return { status: 429, error: "Claude is rate-limited right now — wait a moment and try again." };
  }
  // Temporarily overloaded.
  if (status === 529 || msg.includes("overloaded")) {
    return { status: 503, error: "Claude is overloaded right now — give it a moment and try again." };
  }
  // Anything else from the API.
  return { status: 502, error: "Couldn't reach the chef. Try again in a moment." };
}
