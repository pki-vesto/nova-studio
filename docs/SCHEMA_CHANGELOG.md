# Nova Studio Schema Changelog

Dit document beschrijft de SQLite-database van Nova Studio (`better-sqlite3`, WAL-mode, foreign keys aan). Migraties draaien bij iedere serverstart via `migrate()` in `server/src/db/schema.js`. Alle stappen zijn **idempotent**: tabellen via `CREATE TABLE IF NOT EXISTS`, kolommen via een `addColumn()`-guard die eerst `PRAGMA table_info` controleert. Een nieuwe `schema_migrations`-tabel registreert genummerde migratiestappen.

## V1 — Foundation (oorspronkelijke tabellen)

- `clients` — klanten (naam, bedrijf, contact, `preferences_json`, notities).
- `client_contacts` — contactpersonen per klant (rol, e-mail, telefoon, primair).
- `client_addresses` — adressen per klant (label, straat, postcode, plaats, land).
- `projects` — projectdossier (klant, titel, status, template-vlag, adres, briefing, budget, archivering) plus editorial velden die later additief zijn toegevoegd: `location`, `project_type`, `surface`, `style`, `lead`, `delivery`, `vision`, `summary`, `goals_json`, `principles_json`, `palette_json`, `budget_lines_json`, `hero_image_path`.
- `intake` — intakevelden per project (1-op-1), incl. `ai_summary`.
- `rooms` — ruimtes (hiërarchisch via `parent_room_id`, type, verdieping, afmeting, oriëntatie, daglicht, `concept`, `image_path`, sortering).
- `floorplans` — plattegronden (upload of `drawing_json`, verdieping, noordhoek).
- `moodboards` — moodboards (kleuren/materialen als JSON-arrays).
- `moodboard_assets` — beeld-assets per moodboard (caption).
- `products` — productbibliotheek (merk, leverancier-tekst, categorie, collectie, sku, afmeting, levertijd, alternatief, prijs, beeld, `designer`).
- `project_products` — productselectie per project/ruimte (quantity, designer-note, fit-reason, `is_feature`).
- `proposals` — voorstellen (intro/stijl/kleur/afsluiting, gegenereerd PDF-pad).
- `materials` — projectmaterialen (spec, toepassing, beeld, sortering).

## 2026-06-09 — Platform-expansie

Geregistreerd in `schema_migrations` als **`2026-06-09-platform-expansion`**.

### Nieuwe tabellen

**Schema governance**
- `schema_migrations` — genummerde, geregistreerde migratiestappen (`name`, `applied_at`).

**Auth / multi-user (single-user blijft default)**
- `studios` — studio's/organisaties (geseed met `studio_default`).
- `users` — gebruikers (studio, naam, e-mail uniek, `password_hash`/`password_salt` via scrypt, rol).
- `memberships` — koppeling gebruiker ↔ studio met rol.
- `sessions` — sessietokens (token, user, vervaldatum).

**Suppliers**
- `suppliers` — leveranciers (website, contact, categorie, condities, betrouwbaarheid, rating).
- `supplier_contacts` — contactpersonen per leverancier.
- `supplier_lead_times` — levertijdhistorie per leverancier.

**Color Library**
- `color_library` — globale kleuren (hex, merk, code, finish).
- `room_colors` — kleurtoepassingen per ruimte (koppeling aan bibliotheekkleur of vrije hex + toepassing).

**Material Library**
- `material_library` — globale materialen (categorie, merk, code, spec, onderhoud, duurzaamheidsscore, beeld).

**Design Library**
- `design_library` — herbruikbare concepten/room-templates/product-/materiaalsets/snippets (`kind`, `data_json`, tags, beeld, herkomst-project).

**Proposals (uitbreiding)**
- `proposal_sections` — configureerbare, geordende, aan/uit-baar te zetten secties met `audience` (client/internal).
- `proposal_comments` — opmerkingen per voorstel/sectie.

**Budget**
- `budget_scenarios` — budgetscenario's per project (`lines_json`, één actief).
- `room_budgets` — budget per ruimte.

**Products / moodboards (nieuwe relaties)**
- `product_favorites` — favorieten (lichtgewicht, single-user).
- `moodboard_feedback` — klantfeedback op moodboards (sentiment + body).

**Media**
- `media` — één rij per upload, herbruikbaar tussen domeinen (mime, alt-tekst, tags, `domain`, `ref_id`).

**Floorplans (vector)**
- `floorplan_objects` — vector-objecten op lagen (walls/meubels/annotaties, `geometry_json`, label, sortering).

**Knowledge graph**
- `knowledge_nodes` — knooppunten (type, label, ref, `data_json`).
- `knowledge_edges` — relaties tussen knopen (relation, weight).
- `knowledge_sources` — bronverwijzingen per knoop.

**AI-platform**
- `ai_settings` — singleton (id=1): provider, model, enabled, privacy-mode. Geseed met `enabled = 0`.
- `prompt_templates` — versie-gebaseerde prompt-templates (key + version).
- `ai_jobs` — AI-jobs (flow, status, `review_status`, input/output, sources, tokens in/uit, kosten).

**Planning**
- `project_tasks` — taken per project/ruimte (status, due-date, koppeling aan voorstelstatus).
- `project_milestones` — mijlpalen (target-datum, done).
- `project_documents` — documenten per project (kind, bestand).

**Client portal**
- `portal_access` — magic-link tokens per project (optioneel aan een proposal, verloop, intrekken).
- `portal_feedback` — feedback per sectie/product/voorstel (decision + body).
- `portal_activity` — activiteit-log per token (views + feedback-events).
- `notifications` — notificatie-queue (kind, subject, body, `sent`). **Scaffold**: rijen worden gequeued met `sent = 0`; er wordt niets verzonden.

**Audit**
- `audit_log` — change-history (user, entity, entity_id, action, detail).

**Render**
- `render_jobs` — render-pipeline registry (provider, status, input, output-pad). Adapter is pluggable; alleen `placeholder`-provider geïmplementeerd.

### Kolommen toegevoegd aan bestaande tabellen

- **`proposals`**: `version`, `status`, `summary`, `accepted_at`.
- **`products`**: `supplier_id`, `parent_product_id`, `purchase_price`, `sale_price`, `margin`, `vat_rate`, `availability_status`, `price_date`.
- **`project_products`**: `item_status`, `client_comment`, `is_alternative`.
- **`materials`**: `supplier_id`, `library_id`, `brand`, `code`, `maintenance`, `sustainability_score`, `sample_status`.
- **`moodboards`**: `variant_of_id`, `variant_label`, `layout_json`.
- **`moodboard_assets`**: `source_url`, `tags`, `sort_order`.
- **`floorplans`**: `scale_ratio`, `scale_unit`, `version`, `thumb_path`.
- **`floorplan_objects`**: `product_id` (FK → `products.id`, `ON DELETE SET NULL`), `material_id` (FK → `materials.id`, `ON DELETE SET NULL`) — optionele koppeling van een geplaatst object aan een geselecteerd product en/of materiaal (toegevoegd 2026-06-15).
- **`intake`**: `scope_estimate`, `risks_json`, `followups_json`.
- **`projects`**: `studio_id`, `owner_id`, `deleted_at` (soft-delete), `row_version` (optimistic concurrency).
- **`clients`**: `studio_id`, `owner_id` voor ownership-scoping naast projectownership.

### Seed-gedrag bij migratie

- Een standaard `studio_default`-studio wordt aangemaakt als er geen studio's zijn (single-user blijft werken).
- De `ai_settings`-singleton (id=1) wordt aangemaakt met `enabled = 0` (AI uit tot een provider is geconfigureerd).

### Opmerkingen

- Migraties zijn **additief en idempotent**; herhaald draaien is veilig en de bestaande data blijft intact (`addColumn` guards, geen destructieve `DROP`/`ALTER`).
- Ownership-kolommen (`projects.studio_id`/`owner_id`, `clients.studio_id`/`owner_id`) worden afgedwongen zodra gebruikers bestaan: owner/admin mogen schrijven binnen de studio, members zijn read-only binnen hun ownershipscope.
