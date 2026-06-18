# Nova Studio Architecture

## Applicatiearchitectuur

Frontend: React 19 met Vite. De app leeft onder `web/src`, met `App.jsx` als shell. **Hash-routing** (`#/<view>`, `#/project/<id>/<tab>`, en de publieke `#/portal/<token>`) verzorgt deep links en browser-history. Een **⌘K / Ctrl+K command palette** springt tussen views, projecttabs en projecten. Schermen zijn domeingericht: `ProjectsIndex`, `ProjectOverview`, `Intake`, `Moodboard`, `ColorMaterial`, `FloorPlan`, `Shopping`, `Proposal`, `Presentation`, `Library`, `Clients`, `Suppliers`, `MaterialLibraryScreen`, `DesignLibraryScreen`, `Budget`, `PlanningScreen`, `KnowledgeScreen`, `AiPanel`, `PortalView`, `Login` en `Stijlgids`. Data gaat via `web/src/lib/api.js`, een dunne fetch-wrapper. Styling staat in `web/src/styles/app.css` met warme editorial tokens.

Backend: Node.js met Express 5. `server/src/index.js` start migraties, hangt een **niet-blokkerende sessie-middleware** ervoor (single-user lokale modus blijft werken), serveert statische uploads en exports, serveert de Vite-build uit `dist`, en mount domeinrouters onder `/api`. Een globale error-handler aan het eind vertaalt fouten naar één voorspelbaar JSON-envelope (zie *Cross-cutting: validatie & foutafhandeling*).

Database: SQLite via `better-sqlite3`. `server/src/db/database.js` gebruikt `NOVA_DATA_DIR` of `./data`, zet WAL aan en forceert foreign keys. `server/src/db/schema.js` bevat idempotente migraties met `CREATE TABLE IF NOT EXISTS` en additieve `ALTER TABLE`-kolommen, een `schema_migrations`-register en een seed van een default studio + AI-settingsrij. Het schema telt **48 tabellen**.

Storage: uploads worden lokaal opgeslagen in `server/uploads` of `NOVA_UPLOAD_DIR`. Bestandsnamen krijgen een gegenereerde ID. Exports worden lokaal opgeslagen in `data/exports` of `NOVA_EXPORT_DIR`. De `media`-tabel houdt metadata bij per upload (mime, alt-tekst, tags, domein/ref) met orphan-detectie en -opruiming.

PDF-engine: PDFKit genereert server-side A4-PDF's in `server/src/modules/proposals.js`. De PDF bundelt project, klant, intake, ruimtes, floorplans, moodboards en productselecties met een editorial cover, per-sectie rendering per audience en appendices wanneer data bestaat. Dezelfde module biedt ook een **Projectoverdracht-PDF** (`POST /api/proposals/:projectId/handover-pdf`) als bundelend close-out artefact: cover (project + klant) → ruimtes → materialen → geselecteerde producten (zonder inkoopprijs/marge) → index van `project_documents`. Hergebruikt `projectBundle`, `writeSection`, `renderRooms`, `renderTable` en `warn`/`fieldOrWarn`; de bestandsnaam (`<slug>-overdracht-YYYY-MM-DD.pdf`) en cover gebruiken Europe/Amsterdam-datum en de PDF wordt geserveerd via `/exports`.

AI-adapter: `server/src/modules/aiProvider.js` is de providerlaag voor AI-flows. Met `ANTHROPIC_API_KEY` gezet **en** AI ingeschakeld roept hij de Anthropic Messages API aan (Claude); zonder key of bij een mislukte call valt hij terug op een eerlijk, deterministisch lokaal concept dat duidelijk als zodanig is gelabeld. Er wordt nooit stil een modelcall gefaket.

Render-adapter: `server/src/modules/render.js` heeft een pluggable provider-registry. De meegeleverde `placeholder`-provider schrijft een gelabelde SVG zodat de pipeline zichtbaar end-to-end gewired is zonder een echte renderer te faken; een echte beeld-/3D-provider plugt in via dezelfde functie-interface.

Deployment: Docker buildt frontend en backend in één image. `docker-compose.yml` draait een Tailscale sidecar en de app in hetzelfde netwerk. Data en uploads worden gemount als volumes. Healthcheck gebruikt `/api/health`. Geen hot reload — herdeploy met `docker compose up -d --build`. Lokale development gebruikt `npm run dev` met Vite en nodemon.

## Cross-cutting: validatie & foutafhandeling

Sinds deze iteratie is inputvalidatie en de API-foutvorm gecentraliseerd in `server/src/modules/validate.js`. De module exporteert `{ z, validateBody, validateForm, errorBody, zodDetails, isZodError }`.

Foutcontract: elke API-fout heeft exact dezelfde vorm — `{ error: string, details?: [{ path, message }] }`. `errorBody(message, details)` is de enige bron van waarheid voor die vorm; `details` wordt alleen meegestuurd als de array niet leeg is. `zodDetails(err)` plat een `ZodError` naar leesbare `{ path, message }`-regels (lege path wordt `(root)`).

Validatie-middleware:
- `validateBody(schema, { partial })` valideert `req.body` van JSON-routes met zod. Bij succes worden de **gecoërceerde** waarden teruggemerged op `req.body` (`Object.assign`), zodat de handler type-correcte input leest terwijl velden buiten het schema én de PUT-`field in req.body`-diff-checks intact blijven. Bij falen: `400` met de standaard envelope.
- `validateForm(schema, { partial })` doet hetzelfde voor multipart/form-data-routes (multer). Body-waarden komen binnen als strings; deze worden gevalideerd/gecoërceerd en teruggemerged, terwijl `req.file` en extra velden overleven.
- `{ partial: true }` schakelt naar `schema.partial()` voor PUT/PATCH-routes die een subset van velden accepteren.

Conventie: schema's vermijden `.default()`. Daardoor blijven weggelaten optionele keys afwezig in `req.body`, zodat handler-fallbacks en de PUT-diff-logica (alleen meegestuurde velden bijwerken) hun werk kunnen doen.

Globale error-handler (`server/src/index.js`): mapt een `ZodError` naar `400` met `details`, multer `LIMIT_FILE_SIZE` naar `413` ("Bestand is te groot"), respecteert een expliciete `err.status` en valt anders terug op `500`. De API-404 (`/api`) gebruikt dezelfde envelope.

Queryfilter-conventie: `server/src/modules/filtering.js` levert gedeelde helpers voor tekstfilters (`textFilter`), LIKE-filters (`likeFilter`) en booleans (`flagFilter`). Project-, client- en productlijsten gebruiken deze normalisatie; productlijsten ondersteunen server-side `q`, `category`, `status`, `supplier_id` en `favorites=1`.

Dekking: validatie is toegepast op de write-endpoints van vrijwel alle modules (products, proposals, suppliers, budget, planning, clients [contacts/addresses], colorLibrary, materialLibrary, designLibrary, materials, rooms, intake, knowledge, ai, portal, render, media, moodboards, floorplans). De twee uitzonderingen — `projects` en `auth` — gebruiken eigen inline zod-schema's met `safeParse`, maar leveren via de globale handler en hun eigen 400-responses hetzelfde foutcontract. Tests staan in `server/src/modules/validate.test.js`.

## Domeinarchitectuur

### Core / App-shell

Verantwoordelijkheden: app lifecycle, globale data loading, hash-routing, command palette, optionele login-gate, projectcontext, error state, tweaks, static serving en de cross-cutting validatie-/foutlaag.

Datamodellen: geen eigen tabel; gebruikt alle hoofdentiteiten. `schema_migrations` registreert migratiestappen.

Services: `App.jsx`, `api.js`, `Tweaks.jsx`, `primitives.jsx`, Express app bootstrap, `validate.js`, `audit.js`, `backup.js`.

API's: `GET /api/health`. **Back-up** (`backup.js`, owner/admin-gated): `POST /api/backup` (snapshot), `GET /api/backup` (lijst), `GET /api/backup/download[/:filename]` (download), `DELETE /api/backup/:filename`. Consistente online-snapshots via better-sqlite3 `.backup()` naar `./data/backups/` met retentie `NOVA_BACKUP_KEEP`; ook als `npm run backup` (cron). Zie `BACKUP_RUNBOOK.md`.

### Auth

Verantwoordelijkheden: optionele multi-user/studio-laag. Registratie, login, logout, sessietokens (30 dagen), gebruikersbeheer (CRUD) en rollen (owner/admin/member). Lokale scrypt-wachtwoordhashing via Node-crypto, geen externe provider.

Afdwinging: `sessionMiddleware` (niet-blokkerend) hangt `req.user` aan. Daarna draait een **API-gate** (`auth.apiGate`, gemount op `/api`) die een geldige sessie eist zodra er één of meer gebruikers bestaan; in single-user modus (0 gebruikers) blijft alles open. De gate whitelist `/api/health`, `/api/auth/*` en de publieke `/api/portal/view/*`. **RBAC**: `requireRole("owner","admin")` op de gebruikersbeheer-routes; overige domeinroutes vereisen (zodra auth aan staat) een geldige sessie maar nog geen specifieke rol. Acteur-attributie loopt via `AsyncLocalStorage` (`audit.runWithUser`) zodat audit-entries een `user_id` krijgen.

Datamodellen: `studios`, `users`, `memberships`, `sessions`.

Services: `server/src/modules/auth.js` (`router` + `sessionMiddleware` + `apiGate`/`requireAuth`/`requireRole`), `web/src/App.jsx` (login-gate), `web/src/screens/Login.jsx`.

API's: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, plus gebruikersbeheer onder `/api/auth/users`. Validatie via inline zod-schema's (register/login/createUser/updateUser).

### Clients

Verantwoordelijkheden: klanten, contactpersonen, adressen, gekoppelde projecten.

Datamodellen: `clients`, `client_contacts`, `client_addresses`.

Services: `server/src/modules/clients.js`, `web/src/screens/Clients.jsx`.

API's: `GET/POST /api/clients`, `GET/PUT/DELETE /api/clients/:id`, `POST /api/clients/:id/contacts`, `PUT/DELETE /api/clients/contacts/:contactId`, `POST /api/clients/:id/addresses`, `DELETE /api/clients/addresses/:addressId`. Contact-/adres-writes valideren via `validateBody`.

### Projects

Verantwoordelijkheden: projectdossier, status, klantkoppeling, editorial metadata, budgetregels, palet, hero image, archiveren, herstellen, **soft-delete** (`deleted_at` + `/undelete`), **optimistic concurrency** (`row_version`, 409 bij conflict), **volledige duplicatie** (project + intake + rooms met id-remap + materials + moodboards/assets + selecties) en sample seed.

Datamodellen: `projects` (incl. `studio_id`/`owner_id`/`deleted_at`/`row_version`, editorial velden, `goals_json`/`principles_json`/`palette_json`/`budget_lines_json`, `is_template`/`template_name`), plus gehydrateerde child-data.

Services: `server/src/modules/projects.js`, `server/src/modules/seed.js`, `web/src/screens/ProjectsIndex.jsx`, `web/src/screens/ProjectOverview.jsx`.

API's: `GET/POST /api/projects`, `GET/PUT /api/projects/:id`, `POST /api/projects/:id/hero`, `POST /api/projects/:id/archive`, `POST /api/projects/:id/restore`, `POST /api/projects/:id/undelete`, `POST /api/projects/:id/duplicate`, `POST /api/projects/seed-sample`. Validatie via eigen inline zod-schema.

### Intake

Verantwoordelijkheden: projectintake opslaan en bijwerken, inclusief scope-inschatting, risico's en vervolgvragen.

Datamodellen: `intake` (incl. `ai_summary`, `scope_estimate`, `risks_json`, `followups_json`).

Services: `server/src/modules/intake.js`, `web/src/screens/Intake.jsx` (volwaardige projecttab).

API's: `PUT /api/intake/:projectId` (gevalideerd via `validateBody`).

### Rooms

Verantwoordelijkheden: ruimtes creëren, wijzigen, verwijderen, afbeeldingen uploaden, hiërarchische parent-room, concept-/sfeerbeeldvelden, sortering.

Datamodellen: `rooms` (incl. `parent_room_id`, `floor_level`, `concept`, `image_path`).

Services: `server/src/modules/rooms.js`, roombeheer in `web/src/screens/FloorPlan.jsx` en `ColorMaterial.jsx`.

API's: `POST /api/rooms`, `PUT /api/rooms/:id`, `DELETE /api/rooms/:id`, `POST /api/rooms/:id/image`. Writes gevalideerd via `validateBody`/`validateForm`.

### Floorplans

Verantwoordelijkheden: plattegrondrecords, uploads, eenvoudige tekening-JSON, **schaal** (`scale_ratio`/`scale_unit`), **vector-objecten op lagen** (`floorplan_objects`: walls/meubels/annotaties, CRUD per object), **product/materiaal-koppeling per object** (`floorplan_objects.product_id` / `material_id` met FK ON DELETE SET NULL; de objects-GET joint `products`/`materials` voor `product_name`/`material_name`), **versiebeheer** (`/new-version` kloont plattegrond + objecten incl. koppelingen) en thumbnails.

PDF-thumbnail rendering gebruikt Poppler via `pdftoppm` (`server/src/modules/pdfThumbnails.js`). De Docker-runtime installeert `poppler-utils`; andere deployments moeten `pdftoppm` op `PATH` leveren. `npm run check:pdf-renderer` faalt expliciet wanneer de dependency ontbreekt. Uploads blijven betrouwbaar doordat de app bij renderfouten een gelabelde SVG-fallback thumbnail schrijft.

Datamodellen: `floorplans`, `floorplan_objects`.

Services: `server/src/modules/floorplans.js`, `web/src/screens/FloorPlan.jsx`.

API's: `GET /api/floorplans/project/:projectId`, `POST /api/floorplans`, `PUT /api/floorplans/:id`, `DELETE /api/floorplans/:id`, `POST /api/floorplans/:id/new-version`, plus object-CRUD onder de floorplan. Writes gevalideerd.

### Moodboards

Verantwoordelijkheden: moodboards en assetuploads (caption/bron-URL/tags/sortering), **varianten** (`variant_of_id`/`variant_label`/`layout_json`), **klantfeedback** (`moodboard_feedback`, sentiment + body) en **promote naar Design Library**.

Datamodellen: `moodboards`, `moodboard_assets`, `moodboard_feedback`.

Services: `server/src/modules/moodboards.js`, `web/src/screens/Moodboard.jsx`.

API's: `GET /api/moodboards/project/:projectId`, `POST /api/moodboards`, `PUT /api/moodboards/:id`, `DELETE /api/moodboards/:id`, `POST /api/moodboards/:id/assets`, `DELETE /api/moodboards/assets/:assetId`, `POST /api/moodboards/:id/variant`, feedback- en `/:id/promote`-endpoints. Writes gevalideerd.

### Suppliers

Verantwoordelijkheden: genormaliseerd leveranciersdomein met CRUD, contactpersonen en levertijdhistorie, plus condities/betrouwbaarheid/rating. Producten en materialen koppelen via `supplier_id`. Het oude vrije `products.supplier`-tekstveld blijft voor backward-compat.

Datamodellen: `suppliers`, `supplier_contacts`, `supplier_lead_times`.

Services: `server/src/modules/suppliers.js`, `web/src/screens/Suppliers.jsx`.

API's: `GET/POST /api/suppliers`, `GET/PUT/DELETE /api/suppliers/:id`, contact- en lead-time-subroutes. Writes gevalideerd via `validateBody`.

### Color Library

Verantwoordelijkheden: **globale kleurenbibliotheek** (naam, hex, merk, code, finish) en **per-ruimte toepassingen** (koppeling aan een bibliotheekkleur of vrije hex, met `application`). Het projectpalet (`projects.palette_json`) blijft naast de bibliotheek bestaan.

Datamodellen: `color_library`, `room_colors`.

Services: `server/src/modules/colorLibrary.js`, `web/src/screens/ColorMaterial.jsx`.

API's: CRUD onder `/api/colors`, plus per-room toepassingen. Writes gevalideerd.

### Material Library

Verantwoordelijkheden: **globale materiaalbibliotheek** (categorie, merk, code, spec, onderhoud, duurzaamheidsscore, beeld). Projectmaterialen kunnen uit de bibliotheek worden overgenomen.

Datamodellen: `material_library`; projectgebonden `materials` (incl. `supplier_id`, `library_id`, `brand`, `code`, `maintenance`, `sustainability_score`, `sample_status`).

Services: `server/src/modules/materialLibrary.js`, `server/src/modules/materials.js`, `web/src/screens/MaterialLibraryScreen.jsx`, `web/src/screens/ColorMaterial.jsx`.

API's: CRUD onder `/api/material-library`; projectmaterialen onder `/api/materials` (incl. `materials/from-library`). Writes gevalideerd.

### Products

Verantwoordelijkheden: productbibliotheek met CRUD + image upload, gestandaardiseerde server-side filters (`q`, `category`, `status`, `supplier_id`, `favorites`). **Inkoop-/verkoopprijs, marge, btw, beschikbaarheidsstatus, prijsdatum**. **Varianten** (`parent_product_id`), **favorieten** (`product_favorites`), **vergelijken**, **CSV-import/-export**. Supplier-koppeling via `supplier_id`. Productselectie per project met quantity, designer-note, fit-reason, feature-markering, **itemstatus** (voorgesteld/akkoord/afgewezen), klantopmerking en alternatief-markering. Shoppinglijst + budgettotaal.

Datamodellen: `products`, `project_products`, `product_favorites`.

Services: `server/src/modules/products.js`, `web/src/screens/Library.jsx`, `web/src/screens/Shopping.jsx`, `web/src/lib/budget.js`.

API's: `GET/POST /api/products`, `PUT/DELETE /api/products/:id`, `/:id/variants`, `/compare`, `/import-csv`, `/export.csv`, `POST /api/products/select`, `PUT/DELETE /api/products/selection/:id`, `GET /api/products/shopping-list/:projectId` (+ CSV). Writes gevalideerd via `validateBody`/`validateForm`.

### Design Library

Verantwoordelijkheden: herbruikbare concepten, room-templates, product-/materiaalsets en proposal-snippets (`kind`, `data_json`, `tags`, beeld, herkomst-project), met **promote** vanuit moodboard. Projecttemplates (`is_template`/`template_name`) blijven los hiervan bestaan.

Datamodellen: `design_library`.

Services: `server/src/modules/designLibrary.js`, `web/src/screens/DesignLibraryScreen.jsx`.

API's: CRUD + image upload onder `/api/design-library`. Writes gevalideerd.

### Proposals

Verantwoordelijkheden: voorstel CRUD met **configureerbare secties** (`proposal_sections`: kind, titel, body, audience client/internal, aan/uit, volgorde + reorder; standaardsecties worden geseed), **versies** (`/new-version`), **statusflow** (concept → verzonden → geaccepteerd, zet `accepted_at`), **comments per sectie** (`proposal_comments`), **PDF-theming** per audience met appendices, **exportgeschiedenis** en een **klantveilige Projectoverdracht-PDF** (`/handover-pdf`) als gebundeld close-out artefact (ruimtes, materialen, geselecteerde producten zonder inkoopprijs/marge, en index van `project_documents`).

Datamodellen: `proposals` (incl. `version`, `status`, `summary`, `accepted_at`), `proposal_sections`, `proposal_comments`.

Services: `server/src/modules/proposals.js`, `web/src/screens/Proposal.jsx`, `BudgetBlock.jsx`.

API's: `POST /api/proposals`, `GET /api/proposals/project/:projectId`, `GET/PUT /api/proposals/:id`, `POST /api/proposals/:id/export-pdf`, `POST /api/proposals/:projectId/handover-pdf`, `/:id/new-version`, `/:id/status`, `/:id/exports`, sectie- en comment-subroutes. Writes gevalideerd.

### Budget

Verantwoordelijkheden: **budgetscenario's** (lijnen, activeren, één actief per project), **kamerbudgetten** (upsert per ruimte) en een **overzicht** dat besteed bedrag, inkoop-totaal, marge en btw berekent op basis van effectieve prijs en per ruimte.

Datamodellen: `budget_scenarios`, `room_budgets`.

Services: `server/src/modules/budget.js`, `web/src/screens/Budget.jsx`.

API's: scenario- en room-budget-CRUD plus `GET /api/budget/overview/project/:pid`. Writes gevalideerd.

### Planning

Verantwoordelijkheden: **taken** per project/ruimte (status, due-date, koppeling aan voorstelstatus), **milestones** (target-datum, done), **documenten** (upload van contracten e.d.) en een **timeline**-endpoint dat taken + milestones samenvoegt.

Datamodellen: `project_tasks`, `project_milestones`, `project_documents`.

Services: `server/src/modules/planning.js`, `web/src/screens/PlanningScreen.jsx`.

API's: CRUD voor taken/milestones/documenten plus een timeline-endpoint onder `/api/planning`. Writes gevalideerd.

### Knowledge graph

Verantwoordelijkheden: kennisgraaf met **knopen**, **kanten** en **bronnen**, plus zoeken, een graph-endpoint, een pad-viewer tussen twee knopen en **promote** vanuit project/proposal/product/moodboard.

Datamodellen: `knowledge_nodes`, `knowledge_edges`, `knowledge_sources`.

Services: `server/src/modules/knowledge.js`, `web/src/screens/KnowledgeScreen.jsx`.

API's: node-/edge-CRUD, `/search`, graph-, `/path`- en promote-endpoints onder `/api/knowledge`. Writes gevalideerd.

### AI Services

Verantwoordelijkheden: AI-platform rond de provider-adapter. **Settings** (provider/model/enabled/privacy), **versie-gebaseerde prompt-templates**, **jobs** met `review_status` (pending/approved/rejected) en token-/kostenschatting, en vijf **flows** (intake-analyse, proposal-writing, product-research, moodboard-analyse, knowledge-retrieval) met bronvermeldingen. **Standaard uit** (`ai_settings.enabled = 0`). Live alleen tegen Anthropic met `ANTHROPIC_API_KEY`; anders een eerlijk lokaal concept (zie *AI-adapter*).

Datamodellen: `ai_settings`, `prompt_templates`, `ai_jobs`.

Services: `server/src/modules/ai.js`, `server/src/modules/aiProvider.js`, `web/src/screens/AiPanel.jsx`.

API's: settings-, prompt-template- en job-/flow-endpoints onder `/api/ai`. Writes gevalideerd via `validateBody`.

### Client Portal

Verantwoordelijkheden: **magic-link toegang** per project (optioneel aan een proposal gekoppeld, met intrekken/verlopen), een publieke **read-only view** die alleen klant-veilige data toont (geen inkoopprijs/marge/interne secties), **feedback** per sectie/product/voorstel (een product-akkoord/afwijzing wordt teruggeschreven naar de selectie-status) en een **activity-log**. Portaalreacties lopen via `notifications.notify()` → in-app notificatie (bel + paneel) en optioneel e-mail.

Notificaties: `notifications.js` (`notify()`-helper + `router`) levert in-app notificaties (lijst, ongelezen-teller, mark-read) en een pluggable e-mailkanaal (`mailer.js`, env-gated `NOVA_SMTP_URL` + optioneel `nodemailer`; no-op zonder config). UI: bel met badge in de topbar + paneel (`App.jsx`). API: `GET /api/notifications`, `GET /api/notifications/count`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`.

Datamodellen: `portal_access`, `portal_feedback`, `portal_activity`, `notifications` (met `read_at`/`ref_type`/`ref_id`).

Services: `server/src/modules/portal.js`, `web/src/screens/PortalView.jsx` (publiek) + designer-review.

API's: publieke portal-routes per token plus designer-beheer onder `/api/portal`. Writes gevalideerd.

### Media

Verantwoordelijkheden: één metadata-rij per upload (pad, mime, alt-tekst, tags, domein/ref), herbruikbaar over domeinen, met **orphan-detectie** en **opruimen** van bestanden zonder DB-referentie.

Datamodellen: `media`.

Services: `server/src/modules/media.js` (`router`).

API's: upload-, metadata-, `/orphans`- en `/cleanup-orphans`-endpoints onder `/api/media`. Writes gevalideerd via `validateForm`/`validateBody`.

### Render

Verantwoordelijkheden: job-registry met pluggable provider-adapter. De `placeholder`-provider schrijft een gelabelde SVG zodat de pipeline zichtbaar gewired is; er is nog geen echte beeld-/3D-render.

Datamodellen: `render_jobs`.

Services: `server/src/modules/render.js`.

API's: job aanmaken/draaien/verwijderen onder `/api/render`. Writes gevalideerd.

### Audit

Verantwoordelijkheden: change-history. Een dependency-vrije `record()`-helper wordt door modules na mutaties aangeroepen (proposals, products, budget, AI, render, portal, auth, knowledge…). Auditing breekt nooit de primaire write.

Datamodellen: `audit_log`.

Services: `server/src/modules/audit.js` (`router` + `record`).

API's: globale feed of gefilterd per entity/entity_id onder `/api/audit`.

### Presentation Engine

Verantwoordelijkheden: fullscreen presentatie uit projectdata, moodboard-assets, materiaal-/productpagina's, budgetblok, keyboard-navigatie, configureerbare paginavolgorde, presenter notes en een klantmodus zonder edit-chrome.

Datamodellen: geen eigen tabel; gebruikt geladen project-, moodboard- en shoppingdata.

Services: `web/src/screens/Presentation.jsx`.

API's: geen eigen API.

## Datamodeloverzicht

Het schema telt 48 tabellen, gegroepeerd per domein.

Kern:
- `clients` / `client_contacts` / `client_addresses`: klantmasterdata, contactpersonen en adressen.
- `projects`: centraal project met status, klantkoppeling, templatevelden, budget, editorial metadata, palet-JSON, hero image, ownership (`studio_id`/`owner_id`), soft-delete (`deleted_at`) en `row_version`.
- `intake`: één intake per project (incl. `ai_summary`, scope/risks/followups).
- `rooms`: ruimtes per project, optionele parent-room, concept en sfeerbeeld.
- `floorplans` / `floorplan_objects`: plattegronden + vector-objecten op lagen.
- `moodboards` / `moodboard_assets` / `moodboard_feedback`: moodboards, uploads en klantfeedback.
- `materials`: projectgebonden materialen (met supplier-/library-link).
- `products` / `project_products` / `product_favorites`: productbibliotheek, projectselecties en favorieten.
- `proposals` / `proposal_sections` / `proposal_comments`: voorstellen met secties en comments.

Platform:
- `studios` / `users` / `memberships` / `sessions`: multi-user/auth.
- `suppliers` / `supplier_contacts` / `supplier_lead_times`: leveranciersdomein.
- `color_library` / `room_colors`: globale kleuren + per-ruimte toepassingen.
- `material_library`: globale materialen.
- `design_library`: herbruikbare designassets.
- `budget_scenarios` / `room_budgets`: budgetscenario's en kamerbudgetten.
- `project_tasks` / `project_milestones` / `project_documents`: planning.
- `knowledge_nodes` / `knowledge_edges` / `knowledge_sources`: kennisgraaf.
- `ai_settings` / `prompt_templates` / `ai_jobs`: AI-platform.
- `portal_access` / `portal_feedback` / `portal_activity` / `notifications`: klantportaal + queue.
- `media`: uploadmetadata.
- `render_jobs`: render-pipeline.
- `audit_log`: change-history.
- `schema_migrations`: migratie-register.

Relaties: Studio heeft Users (via Memberships) en Projects. Client heeft Projects. Project heeft Intake, Rooms, Floorplans, Moodboards, Materials, Project Products, Proposals, Budget-scenario's, Tasks/Milestones/Documents en Render-jobs. Room contextualiseert Floorplans, Moodboards, Project Products, Room Colors en Room Budgets. Moodboard heeft Assets en Feedback. Floorplan heeft Objects. Proposal heeft Sections en Comments. Color/Material Library zijn globaal en worden per project/ruimte hergebruikt. Knowledge-knopen verwijzen via `ref_id` naar bronentiteiten en zijn onderling verbonden via Edges.

## Integratiearchitectuur

AI-laag: gekoppeld via `aiProvider.js`. Anthropic (Claude) wanneer `ANTHROPIC_API_KEY` gezet is en AI aan staat; anders een deterministisch lokaal concept. Flows leveren projectcontext, bronvermeldingen en token-/kostenschattingen; jobs dragen een expliciete `review_status`.

PDF-generatie: server-side via PDFKit. Export schrijft naar lokale exportmap en serveert via `/exports`, met exportgeschiedenis per voorstel.

Presentatie-engine: client-side React fullscreen overlay met toetsenbordnavigatie en pagina's uit geladen context.

Render-pipeline: jobs in `render_jobs`, uitgevoerd door een pluggable provider; de meegeleverde `placeholder`-provider schrijft een gelabelde SVG.

Mediaopslag: lokaal filesystem met Express static serving en een `media`-metadatatabel. `uploadUrl` en `fileUrl` normaliseren bestandsreferenties naar `/uploads/<basename>`.

Klantportaal: magic-link tokens, publieke read-only views met privacyfilters, feedback die terugschrijft naar selectiestatus, en een `notifications`-queue (e-mail nog niet verstuurd).

Validatie & foutafhandeling: gecentraliseerd via `validate.js` met één `{ error, details? }`-envelope (zie de cross-cutting sectie).

## Toekomstige Architectuur

Autorisatie & data-scoping: authenticatie wordt nu afgedwongen zodra er gebruikers bestaan (`auth.apiGate`), en gebruikersbeheer is rol-gated. De volgende stap is **fijnmazige RBAC per domein** en **ownership-scoping**: `projects.studio_id`/`owner_id` benutten zodat gebruikers alleen hun eigen/studio-data zien (nu ziet elke ingelogde gebruiker alles).

Echte render-provider: de adapter is gewired; een echte beeldgeneratie- of 3D-renderer plugt in op de bestaande functie-interface (`PROVIDERS[name]`).

Live AI: meerdere providers en hardere flows; reviewstatus verankeren in de UI. Nu alleen Anthropic of een lokaal concept.

E-mailverzending: SMTP/provider bovenop de bestaande `notifications`-queue (`sent`-vlag).

Auth-hardening: login heeft een in-memory brute-force-lockout (5 pogingen → 15 min) en de frontend valt bij 401 terug op de login-gate. Voor publiek internet nog open: CSRF-bescherming en een gedeelde/persistente rate-limit-store bij meerdere processen.

Bredere tests: portal-feedbackflow, budgetoverzicht, AI-fallback, render-job; pagination/filtering-standaard op lijst-endpoints.
