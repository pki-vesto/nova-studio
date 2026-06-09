// Provider-adapter interface for AI flows.
//
// Nova Studio is local-first and ships with AI disabled. When the designer
// enables it and supplies an Anthropic API key (env ANTHROPIC_API_KEY), the
// adapter calls the Messages API. Without a key it returns an HONEST,
// deterministic local draft so the workflow never silently fakes a model call.
//
// The latest Claude models are the Claude 4.x family. Default model id below is
// a real, current id (Haiku 4.5) chosen for low-cost drafting; the designer can
// switch models in AI settings.

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const PRICING = {
  // USD per 1M tokens (input/output) — used only for local cost estimates.
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 15, out: 75 }
};

function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

function estimateCost(model, tokensIn, tokensOut) {
  const p = PRICING[model] || PRICING[DEFAULT_MODEL];
  return (tokensIn / 1e6) * p.in + (tokensOut / 1e6) * p.out;
}

function localFallback(flow, prompt) {
  return [
    `[Lokaal concept — geen AI-provider geconfigureerd]`,
    ``,
    `Flow: ${flow}. Dit is een deterministische opzet op basis van de aangeleverde projectcontext.`,
    `Stel ANTHROPIC_API_KEY in en zet AI aan in de instellingen om dit door een Claude-model te laten schrijven.`,
    ``,
    `Context-samenvatting:`,
    (prompt || "").slice(0, 600)
  ].join("\n");
}

// Returns { text, tokens_in, tokens_out, cost, provider } and never throws on
// network errors — it falls back to a local draft and reports provider:'local'.
async function runCompletion({ flow = "generic", system = "", prompt = "", model = DEFAULT_MODEL } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const text = localFallback(flow, prompt);
    return { text, tokens_in: estimateTokens(prompt), tokens_out: estimateTokens(text), cost: 0, provider: "local" };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: 1500,
        system: system || undefined,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = await res.json();
    const text = (data.content || []).map((b) => b.text || "").join("").trim();
    const tokens_in = data.usage?.input_tokens ?? estimateTokens(prompt);
    const tokens_out = data.usage?.output_tokens ?? estimateTokens(text);
    return { text, tokens_in, tokens_out, cost: estimateCost(model, tokens_in, tokens_out), provider: "anthropic" };
  } catch (err) {
    const text = `${localFallback(flow, prompt)}\n\n[Let op: providercall mislukte — ${err.message}]`;
    return { text, tokens_in: estimateTokens(prompt), tokens_out: estimateTokens(text), cost: 0, provider: "local" };
  }
}

module.exports = { runCompletion, estimateCost, estimateTokens, DEFAULT_MODEL, PRICING };
