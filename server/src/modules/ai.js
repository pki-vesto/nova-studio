const express = require("express");
const { db } = require("../db/database");
const { id, parseJson } = require("./utils");
const { runCompletion, estimateCost, DEFAULT_MODEL } = require("./aiProvider");
const { record } = require("./audit");
const { validateBody, z } = require("./validate");

const router = express.Router();

// ---- Validation schemas ----------------------------------------------------

const settingsSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  enabled: z.any().optional(),
  privacy_mode: z.any().optional()
});

const promptSchema = z.object({
  key: z.string(),
  name: z.string(),
  system_prompt: z.string().optional(),
  user_prompt: z.string().optional(),
  is_active: z.any().optional()
});

const promptUpdateSchema = z.object({
  key: z.string().optional(),
  name: z.string().optional(),
  system_prompt: z.string().optional(),
  user_prompt: z.string().optional(),
  version: z.coerce.number().int().optional(),
  is_active: z.any().optional()
});

const reviewSchema = z.object({
  review_status: z.enum(["approved", "rejected", "pending"])
});

const runSchema = z.object({
  flow: z.enum([
    "intake_analysis",
    "proposal_writing",
    "product_research",
    "moodboard_analysis",
    "knowledge_retrieval"
  ]),
  project_id: z.string().optional(),
  input: z.any().optional(),
  tone: z.string().optional()
});

const regenerateSchema = z.object({
  tone: z.string().optional()
});

// Supported AI flows. Each maps to a context-builder below.
const FLOWS = [
  "intake_analysis",
  "proposal_writing",
  "product_research",
  "moodboard_analysis",
  "knowledge_retrieval"
];

const REVIEW_STATES = ["approved", "rejected", "pending"];

// Static, code-defined tone-of-voice presets. The `standaard` entry is the
// default voice and intentionally injects no instruction, so the default code
// path keeps producing a byte-identical `system` prompt to before this change.
const TONE_PRESETS = {
  standaard: {
    label: "Standaard",
    instruction: ""
  },
  "premium-editorial": {
    label: "Premium / editorial",
    instruction:
      "Schrijf in een premium, redactionele Nederlandse studio-stijl: verzorgd, beeldend en met aandacht voor sfeer, materiaal en compositie. Vermijd marketingtaal en clichés."
  },
  "warm-persoonlijk": {
    label: "Warm / persoonlijk",
    instruction:
      "Schrijf warm en persoonlijk in het Nederlands, met directe aanspreekvorm en gevoel voor de bewoner. Houd het uitnodigend en herkenbaar zonder amicaal te worden."
  },
  "zakelijk-beknopt": {
    label: "Zakelijk / beknopt",
    instruction:
      "Schrijf zakelijk en beknopt in het Nederlands: concrete formuleringen, korte zinnen en heldere structuur. Geen versieringen, geen overbodige bijvoeglijke naamwoorden."
  }
};

function resolveTone(input) {
  const key = typeof input === "string" ? input.trim() : "";
  return Object.prototype.hasOwnProperty.call(TONE_PRESETS, key) ? key : "standaard";
}

function listTonePresets() {
  return Object.entries(TONE_PRESETS).map(([key, value]) => ({ key, label: value.label }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSettings() {
  // Singleton row id=1 is seeded by the schema; SELECT it (and self-heal if missing).
  let row = db.prepare("SELECT * FROM ai_settings WHERE id = 1").get();
  if (!row) {
    db.prepare("INSERT OR IGNORE INTO ai_settings (id, enabled) VALUES (1, 0)").run();
    row = db.prepare("SELECT * FROM ai_settings WHERE id = 1").get();
  }
  return row;
}

function hydrateJob(row) {
  if (!row) return null;
  return {
    ...row,
    input: parseJson(row.input_json, {}),
    sources: parseJson(row.sources_json, [])
  };
}

function getJob(jobId) {
  return hydrateJob(db.prepare("SELECT * FROM ai_jobs WHERE id = ?").get(jobId));
}

// Hydrate the full project bundle a flow may need (project + client name, intake,
// rooms, products, moodboards). Returns null when the project does not exist.
function loadProjectBundle(projectId) {
  if (!projectId) return null;
  const project = db.prepare(`
    SELECT p.*, c.name AS client_name
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.id = ?
  `).get(projectId);
  if (!project) return null;
  const intake = db.prepare("SELECT * FROM intake WHERE project_id = ?").get(projectId) || null;
  const rooms = db.prepare("SELECT * FROM rooms WHERE project_id = ? ORDER BY sort_order, name").all(projectId);
  const products = db.prepare(`
    SELECT pp.*, p.name, p.brand, p.supplier, p.category, p.price, p.description, p.designer, p.webshop_url,
      r.name AS room_name
    FROM project_products pp
    JOIN products p ON p.id = pp.product_id
    LEFT JOIN rooms r ON r.id = pp.room_id
    WHERE pp.project_id = ?
    ORDER BY pp.sort_order, p.category, p.name
  `).all(projectId);
  const moodboards = db.prepare("SELECT * FROM moodboards WHERE project_id = ? ORDER BY created_at").all(projectId);
  return { project, intake, rooms, products, moodboards };
}

function fmtEuro(value) {
  const n = Number(value) || 0;
  return `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Build a Dutch prompt + sources list for each flow. Returns { system, prompt, sources }.
// `toneKey` selects a tone-of-voice preset (see TONE_PRESETS). The tone
// instruction is appended to `system` only — never to `prompt` or `sources` —
// so retrieval semantics are unchanged. The default preset (`standaard`)
// appends nothing, keeping `system` byte-identical to the pre-change baseline.
function buildContext(flow, bundle, input, toneKey = "standaard") {
  const sources = [];
  const lines = [];
  const userInput = (input && typeof input === "object" ? input.text || input.vraag || input.notes : input) || "";

  const project = bundle?.project;
  if (project) {
    sources.push({ label: `Project: ${project.title}`, ref: project.id });
    lines.push(`Project: ${project.title}`);
    if (project.client_name) lines.push(`Klant: ${project.client_name}`);
    if (project.style) lines.push(`Stijl: ${project.style}`);
    if (project.brief) lines.push(`Briefing: ${project.brief}`);
    if (project.budget_total) lines.push(`Totaalbudget: ${fmtEuro(project.budget_total)}`);
  }

  if (flow === "intake_analysis") {
    const intake = bundle?.intake;
    lines.push("", "Intakegegevens:");
    if (intake) {
      sources.push({ label: "Intake", ref: project ? project.id : "" });
      const fields = [
        ["Samenstelling huishouden", intake.household],
        ["Wensen", intake.wishes],
        ["Gebruik ruimtes", intake.room_use],
        ["Stijlvoorkeuren", intake.style_preferences],
        ["Kleurvoorkeuren", intake.color_preferences],
        ["Budgetindicatie", intake.budget_indication],
        ["Bestaand meubilair", intake.existing_furniture],
        ["Beperkingen", intake.constraints],
        ["Vrije notities", intake.free_notes]
      ];
      for (const [label, value] of fields) {
        if (value) lines.push(`- ${label}: ${value}`);
      }
    } else {
      lines.push("- (geen intake ingevuld)");
    }
    lines.push("", "Vat de intake samen, benoem aandachtspunten, risico's en concrete vervolgvragen.");
  } else if (flow === "proposal_writing") {
    const intake = bundle?.intake;
    lines.push("", "Beschikbare projectcontext voor het voorstel:");
    if (intake && intake.ai_summary) lines.push(`- Intakesamenvatting: ${intake.ai_summary}`);
    if (bundle?.rooms?.length) {
      sources.push({ label: `Ruimtes (${bundle.rooms.length})`, ref: project ? project.id : "" });
      lines.push(`- Ruimtes: ${bundle.rooms.map((r) => r.name).join(", ")}`);
    }
    if (bundle?.products?.length) {
      sources.push({ label: `Producten (${bundle.products.length})`, ref: project ? project.id : "" });
      lines.push(`- Geselecteerde producten: ${bundle.products.map((p) => p.name).join(", ")}`);
    }
    lines.push("", "Schrijf een warm, redactioneel interieurvoorstel in het Nederlands.");
  } else if (flow === "product_research") {
    lines.push("", "Reeds geselecteerde producten:");
    if (bundle?.products?.length) {
      for (const p of bundle.products) {
        sources.push({ label: `Product: ${p.name}`, ref: p.product_id });
        lines.push(`- ${p.name}${p.brand ? ` (${p.brand})` : ""}${p.category ? ` — ${p.category}` : ""}${p.price ? ` — ${fmtEuro(p.price)}` : ""}`);
      }
    } else {
      lines.push("- (nog geen producten geselecteerd)");
    }
    lines.push("", "Doe productonderzoek: stel passende producten en alternatieven voor met onderbouwing.");
  } else if (flow === "moodboard_analysis") {
    lines.push("", "Moodboards:");
    if (bundle?.moodboards?.length) {
      for (const m of bundle.moodboards) {
        sources.push({ label: `Moodboard: ${m.title}`, ref: m.id });
        const colors = parseJson(m.colors_json, []);
        const materials = parseJson(m.materials_json, []);
        lines.push(`- ${m.title}${m.description ? `: ${m.description}` : ""}`);
        if (colors.length) lines.push(`  Kleuren: ${colors.join(", ")}`);
        if (materials.length) lines.push(`  Materialen: ${materials.join(", ")}`);
      }
    } else {
      lines.push("- (geen moodboards aanwezig)");
    }
    lines.push("", "Analyseer de moodboards: beschrijf de sfeer, samenhang en stijlrichting.");
  } else if (flow === "knowledge_retrieval") {
    const nodes = db.prepare("SELECT * FROM knowledge_nodes ORDER BY created_at DESC LIMIT 25").all();
    lines.push("", "Kennisbank (relevante knooppunten):");
    if (nodes.length) {
      for (const n of nodes) {
        sources.push({ label: `${n.type}: ${n.label}`, ref: n.id });
        lines.push(`- [${n.type}] ${n.label}`);
      }
    } else {
      lines.push("- (kennisbank is leeg)");
    }
    lines.push("", "Beantwoord de vraag op basis van de kennisbank en de projectcontext.");
  }

  if (userInput) {
    lines.push("", `Vraag/opdracht van de gebruiker: ${userInput}`);
  }

  let system = [
    "Je bent de AI-assistent van Nova Studio, een tool voor interieuradvies.",
    "Antwoord altijd in helder, professioneel Nederlands.",
    `Huidige flow: ${flow}.`
  ].join(" ");

  const preset = TONE_PRESETS[toneKey];
  if (toneKey !== "standaard" && preset && preset.instruction) {
    system += `\n\nToon: ${preset.instruction}`;
  }

  return { system, prompt: lines.join("\n"), sources };
}

// For proposal_writing: append a missing-content checklist + a quality score.
function proposalReview(bundle, baseText) {
  const checks = [
    ["intro", Boolean(bundle?.intake?.ai_summary || bundle?.project?.brief)],
    ["rooms", Boolean(bundle?.rooms?.length)],
    ["products", Boolean(bundle?.products?.length)],
    ["budget", Boolean(bundle?.project?.budget_total)]
  ];
  const missing = checks.filter(([, present]) => !present).map(([field]) => field);
  const present = checks.filter(([, p]) => p).length;
  const score = Math.round((present / checks.length) * 100);

  const checklist = [
    "",
    "## Ontbrekende content checklist",
    missing.length
      ? missing.map((f) => `- [ ] ${f}`).join("\n")
      : "- Alle verwachte velden zijn aanwezig.",
    "",
    `## Kwaliteitsscore: ${score}/100`,
    `(gebaseerd op ${present} van de ${checks.length} verwachte contextvelden)`
  ].join("\n");

  return { text: `${baseText}\n${checklist}`, score, missing };
}

// Core: build context, call the provider, persist a job, return the hydrated row.
async function runFlow({ flow, projectId, input, tone }) {
  const bundle = loadProjectBundle(projectId);
  const settings = getSettings();
  const toneKey = resolveTone(tone);
  const { system, prompt, sources } = buildContext(flow, bundle, input, toneKey);

  const result = await runCompletion({ flow, system, prompt, model: settings.model || DEFAULT_MODEL });
  let output = result.text;

  if (flow === "proposal_writing") {
    output = proposalReview(bundle, output).text;
  }

  const jobId = id("aijob");
  // Store NULL for the default preset to keep row shape backward-compatible.
  const persistedTone = toneKey === "standaard" ? null : toneKey;
  db.prepare(`
    INSERT INTO ai_jobs
      (id, project_id, flow, status, review_status, input_json, output_text, sources_json, tokens_in, tokens_out, cost, tone)
    VALUES
      (@id, @project_id, @flow, 'draft', 'pending', @input_json, @output_text, @sources_json, @tokens_in, @tokens_out, @cost, @tone)
  `).run({
    id: jobId,
    project_id: projectId || null,
    flow,
    input_json: JSON.stringify(input ?? {}),
    output_text: output,
    sources_json: JSON.stringify(sources),
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    cost: result.cost,
    tone: persistedTone
  });

  record("ai_job", jobId, "run", { flow, provider: result.provider, tone: toneKey });
  return getJob(jobId);
}

// Small async wrapper so rejected promises reach the Express error handler.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

router.get("/settings", (_req, res) => {
  res.json(getSettings());
});

router.put("/settings", validateBody(settingsSchema, { partial: true }), (req, res) => {
  getSettings(); // ensure the singleton exists
  const { provider, model, enabled, privacy_mode } = req.body || {};
  const set = [];
  const params = {};
  if (provider !== undefined) { set.push("provider = @provider"); params.provider = String(provider); }
  if (model !== undefined) { set.push("model = @model"); params.model = String(model); }
  if (enabled !== undefined) { set.push("enabled = @enabled"); params.enabled = enabled ? 1 : 0; }
  if (privacy_mode !== undefined) { set.push("privacy_mode = @privacy_mode"); params.privacy_mode = String(privacy_mode); }
  set.push("updated_at = CURRENT_TIMESTAMP");
  db.prepare(`UPDATE ai_settings SET ${set.join(", ")} WHERE id = 1`).run(params);
  res.json(getSettings());
});

// ---------------------------------------------------------------------------
// Prompt templates (versioned)
// ---------------------------------------------------------------------------

router.get("/prompts", (req, res) => {
  const key = req.query.key || "";
  const rows = db.prepare(`
    SELECT * FROM prompt_templates
    WHERE (@key = '' OR key = @key)
    ORDER BY key, version DESC
  `).all({ key });
  res.json(rows);
});

router.post("/prompts", validateBody(promptSchema), (req, res) => {
  const { key, name, system_prompt = "", user_prompt = "", is_active = 1 } = req.body || {};
  if (!key || !name) return res.status(400).json({ error: "key en name zijn verplicht" });
  const maxRow = db.prepare("SELECT MAX(version) AS maxv FROM prompt_templates WHERE key = ?").get(key);
  const version = (maxRow?.maxv || 0) + 1;
  const promptId = id("prompt");
  db.prepare(`
    INSERT INTO prompt_templates (id, key, version, name, system_prompt, user_prompt, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(promptId, key, version, name, system_prompt, user_prompt, is_active ? 1 : 0);
  record("prompt_template", promptId, "create", { key, version });
  res.status(201).json(db.prepare("SELECT * FROM prompt_templates WHERE id = ?").get(promptId));
});

router.put("/prompts/:id", validateBody(promptUpdateSchema, { partial: true }), (req, res) => {
  const existing = db.prepare("SELECT * FROM prompt_templates WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Prompttemplate niet gevonden" });
  const fields = ["key", "name", "system_prompt", "user_prompt", "version", "is_active"];
  const set = [];
  const params = { id: req.params.id };
  for (const field of fields) {
    if (field in (req.body || {})) {
      set.push(`${field} = @${field}`);
      params[field] = field === "is_active" ? (req.body[field] ? 1 : 0) : req.body[field];
    }
  }
  if (set.length) {
    db.prepare(`UPDATE prompt_templates SET ${set.join(", ")} WHERE id = @id`).run(params);
  }
  res.json(db.prepare("SELECT * FROM prompt_templates WHERE id = ?").get(req.params.id));
});

router.delete("/prompts/:id", (req, res) => {
  const existing = db.prepare("SELECT id FROM prompt_templates WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Prompttemplate niet gevonden" });
  db.prepare("DELETE FROM prompt_templates WHERE id = ?").run(req.params.id);
  record("prompt_template", req.params.id, "delete");
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

router.get("/jobs", (req, res) => {
  const project_id = req.query.project_id || "";
  const flow = req.query.flow || "";
  const rows = db.prepare(`
    SELECT * FROM ai_jobs
    WHERE (@project_id = '' OR project_id = @project_id)
      AND (@flow = '' OR flow = @flow)
    ORDER BY created_at DESC, rowid DESC
  `).all({ project_id, flow });
  res.json(rows.map(hydrateJob));
});

router.get("/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "AI-job niet gevonden" });
  res.json(job);
});

router.delete("/jobs/:id", (req, res) => {
  const existing = db.prepare("SELECT id FROM ai_jobs WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "AI-job niet gevonden" });
  db.prepare("DELETE FROM ai_jobs WHERE id = ?").run(req.params.id);
  record("ai_job", req.params.id, "delete");
  res.status(204).end();
});

router.put("/jobs/:id/review", validateBody(reviewSchema), (req, res) => {
  const existing = db.prepare("SELECT id FROM ai_jobs WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "AI-job niet gevonden" });
  const review_status = (req.body || {}).review_status;
  if (!REVIEW_STATES.includes(review_status)) {
    return res.status(400).json({ error: "review_status moet approved, rejected of pending zijn" });
  }
  db.prepare("UPDATE ai_jobs SET review_status = ? WHERE id = ?").run(review_status, req.params.id);
  record("ai_job", req.params.id, "review", { review_status });
  res.json(getJob(req.params.id));
});

// ---------------------------------------------------------------------------
// Run / regenerate
// ---------------------------------------------------------------------------

router.get("/tone-presets", (_req, res) => {
  res.json({ presets: listTonePresets() });
});

router.post("/run", validateBody(runSchema), wrap(async (req, res) => {
  const { flow, project_id, input, tone } = req.body || {};
  if (!FLOWS.includes(flow)) {
    return res.status(400).json({ error: `Onbekende flow. Kies uit: ${FLOWS.join(", ")}` });
  }
  if (project_id) {
    const exists = db.prepare("SELECT id FROM projects WHERE id = ?").get(project_id);
    if (!exists) return res.status(404).json({ error: "Project niet gevonden" });
  }
  const job = await runFlow({ flow, projectId: project_id || null, input, tone });
  res.status(201).json(job);
}));

router.post("/jobs/:id/regenerate", validateBody(regenerateSchema, { partial: true }), wrap(async (req, res) => {
  const source = db.prepare("SELECT * FROM ai_jobs WHERE id = ?").get(req.params.id);
  if (!source) return res.status(404).json({ error: "AI-job niet gevonden" });
  const input = parseJson(source.input_json, {});
  // Reuse the source job's stored tone unless the caller supplies a new one.
  const bodyTone = (req.body || {}).tone;
  const tone = typeof bodyTone === "string" && bodyTone !== "" ? bodyTone : (source.tone || undefined);
  const job = await runFlow({ flow: source.flow, projectId: source.project_id, input, tone });
  res.status(201).json(job);
}));

module.exports = router;
module.exports.TONE_PRESETS = TONE_PRESETS;
module.exports.resolveTone = resolveTone;
module.exports.listTonePresets = listTonePresets;
module.exports.buildContext = buildContext;
