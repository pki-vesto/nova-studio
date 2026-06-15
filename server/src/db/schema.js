const { db } = require("./database");

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function addColumn(table, column, definition) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      preferences_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS client_contacts (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS client_addresses (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'Projectadres',
      street TEXT DEFAULT '',
      postal_code TEXT DEFAULT '',
      city TEXT DEFAULT '',
      country TEXT DEFAULT 'Nederland',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      is_template INTEGER NOT NULL DEFAULT 0,
      template_name TEXT DEFAULT '',
      address TEXT DEFAULT '',
      brief TEXT DEFAULT '',
      budget_total REAL DEFAULT 0,
      archived_at TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS intake (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      household TEXT DEFAULT '',
      wishes TEXT DEFAULT '',
      room_use TEXT DEFAULT '',
      style_preferences TEXT DEFAULT '',
      color_preferences TEXT DEFAULT '',
      budget_indication TEXT DEFAULT '',
      existing_furniture TEXT DEFAULT '',
      constraints TEXT DEFAULT '',
      free_notes TEXT DEFAULT '',
      ai_summary TEXT DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      parent_room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      room_type TEXT DEFAULT '',
      floor_level TEXT DEFAULT '',
      dimensions TEXT DEFAULT '',
      orientation TEXT DEFAULT '',
      daylight TEXT DEFAULT '',
      color_notes TEXT DEFAULT '',
      designer_notes TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS floorplans (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      floor_level TEXT DEFAULT '',
      file_path TEXT DEFAULT '',
      file_name TEXT DEFAULT '',
      north_angle INTEGER DEFAULT 0,
      drawing_json TEXT NOT NULL DEFAULT '{"walls":[],"doors":[],"windows":[],"labels":[]}',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS moodboards (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      colors_json TEXT NOT NULL DEFAULT '[]',
      materials_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS moodboard_assets (
      id TEXT PRIMARY KEY,
      moodboard_id TEXT NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      caption TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT DEFAULT '',
      supplier TEXT DEFAULT '',
      category TEXT DEFAULT '',
      collection TEXT DEFAULT '',
      sku TEXT DEFAULT '',
      dimensions TEXT DEFAULT '',
      lead_time TEXT DEFAULT '',
      alternative_to_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      image_path TEXT DEFAULT '',
      price REAL DEFAULT 0,
      webshop_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'candidate',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_products (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      designer_note TEXT DEFAULT '',
      fit_reason TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_price_history (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      purchase_price REAL,
      sale_price REAL,
      price REAL,
      margin REAL,
      changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      note TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      intro_text TEXT DEFAULT '',
      style_direction TEXT DEFAULT '',
      color_advice TEXT DEFAULT '',
      closing_text TEXT DEFAULT '',
      generated_pdf_path TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      spec TEXT DEFAULT '',
      application TEXT DEFAULT '',
      image_path TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  addColumn("clients", "company", "TEXT DEFAULT ''");
  addColumn("clients", "preferences_json", "TEXT NOT NULL DEFAULT '{}'");
  addColumn("clients", "updated_at", "TEXT NOT NULL DEFAULT ''");
  db.prepare("UPDATE clients SET updated_at = created_at WHERE updated_at = ''").run();
  addColumn("projects", "is_template", "INTEGER NOT NULL DEFAULT 0");
  addColumn("projects", "template_name", "TEXT DEFAULT ''");
  addColumn("projects", "archived_at", "TEXT DEFAULT ''");
  addColumn("rooms", "parent_room_id", "TEXT REFERENCES rooms(id) ON DELETE SET NULL");
  addColumn("rooms", "floor_level", "TEXT DEFAULT ''");
  addColumn("floorplans", "floor_level", "TEXT DEFAULT ''");
  addColumn("products", "collection", "TEXT DEFAULT ''");
  addColumn("products", "sku", "TEXT DEFAULT ''");
  addColumn("products", "dimensions", "TEXT DEFAULT ''");
  addColumn("products", "lead_time", "TEXT DEFAULT ''");
  addColumn("products", "alternative_to_id", "TEXT REFERENCES products(id) ON DELETE SET NULL");
  addColumn("products", "designer", "TEXT DEFAULT ''");

  // Editorial proposal fields — let the warm, magazine-style views render real data.
  addColumn("projects", "location", "TEXT DEFAULT ''");
  addColumn("projects", "project_type", "TEXT DEFAULT ''");
  addColumn("projects", "surface", "TEXT DEFAULT ''");
  addColumn("projects", "style", "TEXT DEFAULT ''");
  addColumn("projects", "lead", "TEXT DEFAULT ''");
  addColumn("projects", "delivery", "TEXT DEFAULT ''");
  addColumn("projects", "vision", "TEXT DEFAULT ''");
  addColumn("projects", "summary", "TEXT DEFAULT ''");
  addColumn("projects", "goals_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("projects", "principles_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("projects", "palette_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("projects", "budget_lines_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("projects", "hero_image_path", "TEXT DEFAULT ''");

  addColumn("rooms", "concept", "TEXT DEFAULT ''");
  addColumn("rooms", "image_path", "TEXT DEFAULT ''");

  addColumn("project_products", "is_feature", "INTEGER NOT NULL DEFAULT 0");

  // ---------------------------------------------------------------------------
  // Platform expansion (Foundation → Future Systems). All idempotent.
  // ---------------------------------------------------------------------------
  db.exec(`
    -- Schema governance: registered, versioned migration steps.
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Multi-user / studio model (single-user stays the default).
    CREATE TABLE IF NOT EXISTS studios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Nova Studio',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      studio_id TEXT REFERENCES studios(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT DEFAULT '',
      password_salt TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      studio_id TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL DEFAULT ''
    );

    -- Suppliers as a normalised domain.
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      website TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      category TEXT DEFAULT '',
      conditions TEXT DEFAULT '',
      reliability_notes TEXT DEFAULT '',
      rating INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_contacts (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS supplier_lead_times (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lead_days INTEGER DEFAULT 0,
      notes TEXT DEFAULT ''
    );

    -- Global Color Library.
    CREATE TABLE IF NOT EXISTS color_library (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hex TEXT DEFAULT '#cccccc',
      brand TEXT DEFAULT '',
      code TEXT DEFAULT '',
      finish TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS room_colors (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      color_id TEXT REFERENCES color_library(id) ON DELETE SET NULL,
      hex TEXT DEFAULT '#cccccc',
      name TEXT DEFAULT '',
      application TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Global Material Library.
    CREATE TABLE IF NOT EXISTS material_library (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      brand TEXT DEFAULT '',
      code TEXT DEFAULT '',
      spec TEXT DEFAULT '',
      maintenance TEXT DEFAULT '',
      sustainability_score INTEGER DEFAULT 0,
      image_path TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Design Library: reusable concepts, room templates, product/material sets, snippets.
    CREATE TABLE IF NOT EXISTS design_library (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'concept',
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      body TEXT DEFAULT '',
      data_json TEXT NOT NULL DEFAULT '{}',
      tags TEXT DEFAULT '',
      image_path TEXT DEFAULT '',
      source_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Proposal sections (configurable, ordered, toggleable, client/internal).
    CREATE TABLE IF NOT EXISTS proposal_sections (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'text',
      title TEXT NOT NULL DEFAULT '',
      body TEXT DEFAULT '',
      audience TEXT NOT NULL DEFAULT 'client',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS proposal_comments (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
      section_id TEXT REFERENCES proposal_sections(id) ON DELETE CASCADE,
      author TEXT DEFAULT 'designer',
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Budget scenarios and per-room budgets.
    CREATE TABLE IF NOT EXISTS budget_scenarios (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Basis',
      lines_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS room_budgets (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      amount REAL DEFAULT 0,
      notes TEXT DEFAULT ''
    );

    -- Product favorites (lightweight, single-user friendly).
    CREATE TABLE IF NOT EXISTS product_favorites (
      product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Moodboard client feedback.
    CREATE TABLE IF NOT EXISTS moodboard_feedback (
      id TEXT PRIMARY KEY,
      moodboard_id TEXT NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
      author TEXT DEFAULT 'klant',
      sentiment TEXT DEFAULT 'neutral',
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Media metadata: one row per upload, reusable across domains.
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      file_name TEXT DEFAULT '',
      mime_type TEXT DEFAULT '',
      alt_text TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      domain TEXT DEFAULT '',
      ref_id TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Floorplan vector objects (walls/furniture/annotations on layers).
    CREATE TABLE IF NOT EXISTS floorplan_objects (
      id TEXT PRIMARY KEY,
      floorplan_id TEXT NOT NULL REFERENCES floorplans(id) ON DELETE CASCADE,
      layer TEXT NOT NULL DEFAULT 'walls',
      kind TEXT NOT NULL DEFAULT 'wall',
      geometry_json TEXT NOT NULL DEFAULT '{}',
      label TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );

    -- Knowledge graph.
    CREATE TABLE IF NOT EXISTS knowledge_nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      ref_id TEXT DEFAULT '',
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS knowledge_edges (
      id TEXT PRIMARY KEY,
      from_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      to_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      relation TEXT NOT NULL DEFAULT 'related',
      weight REAL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS knowledge_sources (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      label TEXT DEFAULT '',
      url TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- AI platform: settings, prompt templates (versioned), jobs with review status.
    CREATE TABLE IF NOT EXISTS ai_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      provider TEXT NOT NULL DEFAULT 'anthropic',
      model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
      enabled INTEGER NOT NULL DEFAULT 0,
      privacy_mode TEXT NOT NULL DEFAULT 'local-first',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      system_prompt TEXT DEFAULT '',
      user_prompt TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      flow TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      review_status TEXT NOT NULL DEFAULT 'pending',
      input_json TEXT NOT NULL DEFAULT '{}',
      output_text TEXT DEFAULT '',
      sources_json TEXT NOT NULL DEFAULT '[]',
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Project planning: tasks and milestones.
    CREATE TABLE IF NOT EXISTS project_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      due_date TEXT DEFAULT '',
      linked_proposal_status TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_milestones (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      target_date TEXT DEFAULT '',
      done INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS project_documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'contract',
      title TEXT NOT NULL,
      file_path TEXT DEFAULT '',
      file_name TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Client portal: magic-link access + per-section/item feedback + activity log.
    CREATE TABLE IF NOT EXISTS portal_access (
      token TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      proposal_id TEXT REFERENCES proposals(id) ON DELETE SET NULL,
      label TEXT DEFAULT '',
      expires_at TEXT DEFAULT '',
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS portal_feedback (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL REFERENCES portal_access(token) ON DELETE CASCADE,
      target_type TEXT NOT NULL DEFAULT 'section',
      target_id TEXT DEFAULT '',
      decision TEXT DEFAULT '',
      body TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS portal_activity (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL REFERENCES portal_access(token) ON DELETE CASCADE,
      action TEXT NOT NULL,
      detail TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'portal',
      subject TEXT DEFAULT '',
      body TEXT DEFAULT '',
      sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Audit log / change history.
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT '',
      entity TEXT NOT NULL,
      entity_id TEXT DEFAULT '',
      action TEXT NOT NULL,
      detail TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Render pipeline (job registry + outputs; adapter is pluggable).
    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
      provider TEXT NOT NULL DEFAULT 'placeholder',
      status TEXT NOT NULL DEFAULT 'queued',
      input_json TEXT NOT NULL DEFAULT '{}',
      output_path TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Existing-table extensions for the expansion.
  addColumn("proposals", "version", "INTEGER NOT NULL DEFAULT 1");
  addColumn("proposals", "status", "TEXT NOT NULL DEFAULT 'concept'");
  addColumn("proposals", "summary", "TEXT DEFAULT ''");
  addColumn("proposals", "accepted_at", "TEXT DEFAULT ''");

  addColumn("products", "supplier_id", "TEXT REFERENCES suppliers(id) ON DELETE SET NULL");
  addColumn("products", "parent_product_id", "TEXT REFERENCES products(id) ON DELETE SET NULL");
  addColumn("products", "purchase_price", "REAL DEFAULT 0");
  addColumn("products", "sale_price", "REAL DEFAULT 0");
  addColumn("products", "margin", "REAL DEFAULT 0");
  addColumn("products", "vat_rate", "REAL DEFAULT 21");
  addColumn("products", "availability_status", "TEXT DEFAULT 'unknown'");
  addColumn("products", "price_date", "TEXT DEFAULT ''");

  addColumn("project_products", "item_status", "TEXT NOT NULL DEFAULT 'proposed'");
  addColumn("project_products", "client_comment", "TEXT DEFAULT ''");
  addColumn("project_products", "is_alternative", "INTEGER NOT NULL DEFAULT 0");

  addColumn("materials", "supplier_id", "TEXT REFERENCES suppliers(id) ON DELETE SET NULL");
  addColumn("materials", "library_id", "TEXT REFERENCES material_library(id) ON DELETE SET NULL");
  addColumn("materials", "brand", "TEXT DEFAULT ''");
  addColumn("materials", "code", "TEXT DEFAULT ''");
  addColumn("materials", "maintenance", "TEXT DEFAULT ''");
  addColumn("materials", "sustainability_score", "INTEGER DEFAULT 0");
  addColumn("materials", "sample_status", "TEXT DEFAULT 'none'");

  addColumn("moodboards", "variant_of_id", "TEXT REFERENCES moodboards(id) ON DELETE SET NULL");
  addColumn("moodboards", "variant_label", "TEXT DEFAULT ''");
  addColumn("moodboards", "layout_json", "TEXT NOT NULL DEFAULT '{}'");
  addColumn("moodboard_assets", "source_url", "TEXT DEFAULT ''");
  addColumn("moodboard_assets", "tags", "TEXT DEFAULT ''");
  addColumn("moodboard_assets", "sort_order", "INTEGER DEFAULT 0");

  addColumn("floorplans", "scale_ratio", "REAL DEFAULT 0");
  addColumn("floorplans", "scale_unit", "TEXT DEFAULT 'cm'");
  addColumn("floorplans", "version", "INTEGER NOT NULL DEFAULT 1");
  addColumn("floorplans", "thumb_path", "TEXT DEFAULT ''");

  addColumn("intake", "scope_estimate", "TEXT DEFAULT ''");
  addColumn("intake", "risks_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("intake", "followups_json", "TEXT NOT NULL DEFAULT '[]'");

  addColumn("notifications", "read_at", "TEXT DEFAULT ''");
  addColumn("notifications", "ref_type", "TEXT DEFAULT ''");
  addColumn("notifications", "ref_id", "TEXT DEFAULT ''");

  addColumn("projects", "studio_id", "TEXT REFERENCES studios(id) ON DELETE SET NULL");
  addColumn("projects", "owner_id", "TEXT REFERENCES users(id) ON DELETE SET NULL");
  addColumn("clients", "studio_id", "TEXT REFERENCES studios(id) ON DELETE SET NULL");
  addColumn("clients", "owner_id", "TEXT REFERENCES users(id) ON DELETE SET NULL");
  addColumn("projects", "deleted_at", "TEXT DEFAULT ''");
  addColumn("projects", "row_version", "INTEGER NOT NULL DEFAULT 1");

  // Seed a single-user studio + owner so single-user installs keep working.
  const studioCount = db.prepare("SELECT COUNT(*) AS n FROM studios").get().n;
  if (studioCount === 0) {
    db.prepare("INSERT INTO studios (id, name) VALUES ('studio_default', 'Nova Studio')").run();
  }
  // Default AI settings row (disabled until a provider is configured).
  db.prepare("INSERT OR IGNORE INTO ai_settings (id, enabled) VALUES (1, 0)").run();

  // Register this expansion step.
  db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)").run("2026-06-09-platform-expansion");
}

module.exports = { migrate };
