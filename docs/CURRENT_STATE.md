# Nova Studio Current State

Laatst bijgewerkt: 2026-06-10 (na RBAC-/ownership-enforcement).

Bronnen: code-inspectie van `/home/peter/nova-studio` — SQLite-schema (`server/src/db/schema.js`), Express-routes (`server/src/index.js` + `server/src/modules/*`), frontendschermen (`web/src/screens/*`, `web/src/App.jsx`), Docker-config en `npm test` (util- en API-integratietests).

Leeswijzer per domein: **Werkt** = functioneel en gewired, **Getest** = automatische dekking, **Live staat** = wat er nu draait/in de DB staat. Eerlijkheid voorop: backend-only of gescaffold werk wordt expliciet als zodanig benoemd.

## Gebouwde Functionaliteit

### Core / App-shell

Werkt: React/Vite app-shell met sidebar, topbar, globale zoekinput, projecttabs en error banner. **Hash-routing** (`#/<view>`, `#/project/<id>/<tab>`) met deep links en browser-history. **⌘K / Ctrl+K command palette** om tussen views, projecttabs en projecten te springen. **Optionele login-gate** (alleen actief zodra er gebruikers bestaan). Publieke standalone route `#/portal/<token>` zonder app-shell of auth. Tweaks-paneel in localStorage. Express static serving, `/api/health`.

Validatie & foutafhandeling: inputvalidatie is **gecentraliseerd** in `server/src/modules/validate.js` (`validateBody`/`validateForm`-middleware op zod-basis) en toegepast op de write-endpoints van vrijwel alle modules. Gevalideerde waarden worden gecoërceerd en teruggemerged op `req.body`, terwijl onbekende velden en de PUT-diff-checks intact blijven; schema's vermijden `.default()` zodat handler-fallbacks blijven werken. Elke API-fout deelt één envelope `{ error, details? }`. De globale error-handler in `server/src/index.js` mapt `ZodError` → 400 met `details`, multer `LIMIT_FILE_SIZE` → 413 en respecteert `err.status`.

Getest: `npm test` draait util-, API-integratie-, validatie-, auth-/RBAC-, authorization-, back-up-, flow- én notificatietests. Totaal **46 tests**. De authorization-tests dekken 401 zonder sessie, 403 voor member-writes, cross-owner project/client access, list filtering en forbidden-auditlogging. De flow-tests (`flows.test.js`) dekken budget marge/btw-berekening, de portaal-goedkeuringsflow (incl. client-safe lekbescherming), soft-delete, optimistic concurrency (409), product-pricing/CSV en de AI lokale-fallback. `npm run build` is de release-build-check.

**Notificaties**: portaalreacties (klant keurt product goed/af of laat een opmerking achter) maken nu een in-app notificatie (`notifications`-tabel, `notify()`-helper) die de ontwerper ziet via een **bel met ongelezen-teller in de topbar** + paneel (`App.jsx`). Optioneel e-mailkanaal via een pluggable `mailer.js`: verstuurt alleen wanneer `NOVA_SMTP_URL` is gezet én `nodemailer` is geïnstalleerd, anders blijft de notificatie netjes in-app (geen geforceerde dependency, geen stille fake-send).

Live staat: Docker/Tailscale-config met app-service op poort 4000 en loopback smoke endpoint op 127.0.0.1:4100. Runtime-status niet geverifieerd in deze run.

### Clients (incl. contacts/addresses UI)

Werkt: klantenlijst met filter, klant aanmaken/bewerken/detail, projectcount + laatste project. Contact- en adres-API's (`client_contacts`, `client_addresses`) plus UI in het Klanten-scherm om contactpersonen en adressen te beheren. Zodra gebruikers bestaan worden klanten gestampt met `studio_id`/`owner_id`; lijsten en detailroutes filteren op ownershipscope en contact-/adresmutaties volgen de parent-klant.

Getest: API-test "client aanmaken".

Live staat: lokale DB bevat 1 client.

### Projects (soft-delete, optimistic concurrency, volledige duplicatie)

Werkt: projectlijst met statusfilter en templatefilter, aanmaken met bestaande/nieuwe klant, detail, metadata bewerken, hero-upload, archiveren/herstellen. Zodra gebruikers bestaan worden projecten gestampt met `studio_id`/`owner_id`; lijsten/detailroutes filteren op ownershipscope en project-scoped childroutes worden via centrale authorization gecontroleerd. **Soft-delete** (`deleted_at`, met `/undelete`) — lijst filtert verwijderde projecten weg. **Optimistic concurrency** via `row_version` (409 bij conflict, backward-compatible als er geen versie wordt meegestuurd). **Volledige duplicatie**: kopieert nu project, intake, rooms (met id-remap), materials, moodboards + assets en productselecties. Sample-project endpoint (`/seed-sample`).

Getest: API-test "project aanmaken met nieuwe klant en in lijst zichtbaar".

Live staat: lokale DB bevat 1 project.

### Intake (scope/risks/followups + UI-tab)

Werkt: intake upsert per project via API. Nieuwe velden `scope_estimate`, `risks_json`, `followups_json` naast de bestaande intakevelden en `ai_summary`. Volwaardige **Intake-projecttab** (`Intake.jsx`) toont en bewerkt alle velden, inclusief scope-inschatting, risico's en vervolgvragen.

Getest: intake-row wordt mee-gehydrateerd in de project-API-test.

Live staat: lokale DB bevat 1 intake.

### Rooms

Werkt: ruimtes aanmaken/bewerken/verwijderen, room-images uploaden, hiërarchische parent-room, concept- en sfeerbeeldvelden, sortering. Beheerd vanuit het Plattegrond-/ColorMaterial-scherm.

Getest: geen domeinspecifieke test.

Live staat: 0 rooms in lokale DB.

### Floorplans (schaal/objecten/lagen/versies)

Werkt: floorplan aanmaken met upload of SVG-tekening, bewerken na aanmaak, verwijderen. **Schaal** (`scale_ratio`/`scale_unit`), **vector-objecten** op **lagen** (`floorplan_objects`: walls/meubels/annotaties, CRUD per object), **product/materiaal-koppeling** per object (`product_id`/`material_id`, FK met ON DELETE SET NULL; gekoppelde naam wordt geresolveerd in de objects-GET), **versiebeheer** (`/:id/new-version` kloont de plattegrond + objecten incl. koppelingen), thumbnail-veld.

Getest: geen.

Live staat: 0 floorplans.

### Moodboards (edit/tags/varianten/feedback/promote)

Werkt: moodboards aanmaken/bewerken/verwijderen, assets uploaden met **caption/bron-URL/tags/sortering**, **varianten** (`/:id/variant` met `variant_of_id`/`variant_label`/`layout_json`), **klantfeedback** (`moodboard_feedback`, sentiment + body), **promote naar Design Library** (`/:id/promote`). Editorial moodboardgrid in `Moodboard.jsx`.

Getest: geen.

Live staat: 0 moodboards.

### Color Library (globale tabel + per-room toepassingen)

Werkt: **globale `color_library`** (naam, hex, merk, code, finish) met CRUD-UI in `ColorMaterial.jsx`. **Per-ruimte toepassingen** (`room_colors`: koppeling aan bibliotheekkleur of vrije hex, met `application`). Projectpalet (`projects.palette_json`) blijft naast de bibliotheek bestaan.

Getest: geen.

Live staat: globale tabel aanwezig, nog leeg.

### Material Library (globaal + projectlink + onderhoud/duurzaamheid/sample)

Werkt: **globale `material_library`** (categorie, merk, code, spec, onderhoud, duurzaamheidsscore, beeld) met CRUD-UI in `MaterialLibraryScreen.jsx`. Projectmaterialen kunnen **uit de bibliotheek worden overgenomen** (`materials/from-library`) en dragen nu `supplier_id`, `library_id`, `brand`, `code`, `maintenance`, `sustainability_score` en `sample_status`. Tonen in ColorMaterial, Proposal en Presentation. **Cross-project sample-overzicht**: `GET /api/materials/sample-overview` groepeert projectmaterialen op `sample_status` over alle niet-soft-deleted projecten (incl. project_title + supplier_name); de Materiaalbibliotheek heeft een tab **Sample-status** die de groepen toont met aantallen en deep links (`#/project/<id>/material`) terug naar het projectmateriaaltabblad.

Getest: geen.

Live staat: globale tabel aanwezig, 0 projectmaterials.

### Products (pricing/marge/btw/varianten/favorieten/CSV/beschikbaarheid)

Werkt: productbibliotheek met CRUD + image upload, categorie-/zoekfilter. **Inkoop-/verkoopprijs, marge, btw-percentage, beschikbaarheidsstatus, prijsdatum**. **Varianten** (`parent_product_id`, `/:id/variants`). **Favorieten** (`product_favorites`, toggle). **Vergelijken** (`/compare`). **CSV-import en -export** (`/import-csv`, `/export.csv`, plus shoppinglijst-CSV per project). Supplier-koppeling via `supplier_id`. Productselectie per project met quantity, designer-note, fit-reason, feature-markering, **itemstatus** (voorgesteld/akkoord/afgewezen), klantopmerking en alternatief-markering. Shoppinglijst + budgettotaal.

Getest: API-test "productselectie en shoppinglijst totaal".

Live staat: 0 products / 0 project_products.

### Suppliers (eigen domein)

Werkt: genormaliseerd **`suppliers`**-domein met CRUD, **contactpersonen** (`supplier_contacts`) en **levertijdhistorie** (`supplier_lead_times`), plus condities/betrouwbaarheid/rating. UI in `Suppliers.jsx`. Producten en materialen koppelen via `supplier_id`. Het oude vrije `products.supplier`-tekstveld blijft bestaan voor backward-compat.

Getest: geen.

Live staat: 0 suppliers.

### Design Library

Werkt: **`design_library`** voor herbruikbare concepten, room-templates, product-/materiaalsets en proposal-snippets (`kind`, `data_json`, `tags`, beeld, herkomst-project). CRUD + image upload, **promote** vanuit moodboard. UI in `DesignLibraryScreen.jsx`. Projecttemplates (`is_template`/`template_name`) blijven los hiervan bestaan.

Getest: geen.

Live staat: leeg.

### Proposals (secties/versies/status/comments/audience/appendices/PDF-theming/exportgeschiedenis)

Werkt: proposal CRUD. **Configureerbare secties** (`proposal_sections`: kind, titel, body, audience client/internal, aan/uit, volgorde + reorder-endpoint; standaard secties worden geseed bij aanmaak). **Versies** (`/:id/new-version` kloont scalars + secties, `version`-veld). **Statusflow** (`/:id/status`: concept → verzonden → geaccepteerd, zet `accepted_at`). **Comments per sectie** (`proposal_comments`). **PDF-theming**: editorial cover + per-sectie rendering per audience, met expliciete workflow-waarschuwingen i.p.v. fillertekst en **appendices** wanneer data bestaat. **Exportgeschiedenis** (`/:id/exports`) en klantvriendelijke bestandsnaam met versie/audience.

Getest: API-tests "voorstel aanmaken, secties geseed en PDF-export" en "proposal status flow zet accepted_at".

Live staat: 0 proposals.

### Presentation (configureerbare pagina's, presenter notes, klantmodus)

Werkt: fullscreen presentatie met pagina's uit projectdata, moodboard-assets, materiaal-/productpagina's, budgetblok, keyboard-navigatie, dots, auto-hide chrome. Configureerbare paginavolgorde, presenter notes en een klantmodus zonder edit-chrome in `Presentation.jsx`.

Getest: geen frontendtest.

Live staat: geen aparte persistentie.

### Budget (scenario's/kamerbudgetten/marge/btw)

Werkt: **budgetscenario's** (`budget_scenarios`: lijnen, activeren, één actief per project), **kamerbudgetten** (`room_budgets`, upsert per ruimte), en een **overzicht** (`/overview/project/:pid`) dat besteed bedrag, inkoop-totaal, **marge** en **btw** berekent op basis van effectieve prijs (verkoop > catalogus) en per ruimte. UI in `Budget.jsx`.

Getest: indirect via productselectie-test; overview niet apart getest.

Live staat: geen scenario's.

### Planning (taken/milestones/documenten/timeline)

Werkt: **taken** per project/ruimte (`project_tasks`, status, due-date, koppeling aan voorstelstatus), **milestones** (`project_milestones`, target-datum, done), **documenten** (`project_documents`, upload van contracten e.d.) en een **timeline**-endpoint dat taken + milestones samenvoegt. UI in `PlanningScreen.jsx`.

Getest: geen.

Live staat: leeg.

### Knowledge graph

Werkt: **`knowledge_nodes` / `knowledge_edges` / `knowledge_sources`** met CRUD, **zoeken** (`/search`), **graph**-endpoint, **pad-viewer** (`/path` tussen twee knopen) en **promote** vanuit project/proposal/product/moodboard. UI in `KnowledgeScreen.jsx`.

Getest: geen.

Live staat: leeg.

### AI-platform (adapter/settings/prompts/jobs/flows/review/kosten)

Werkt: **provider-adapter** (`aiProvider.js`). Draait tegen Anthropic (Claude) **alleen als `ANTHROPIC_API_KEY` gezet is én AI aan staat**; anders een **eerlijk, deterministisch lokaal concept** dat duidelijk als zodanig gelabeld is (nooit een stille fake call). **Settings** (provider/model/enabled/privacy), **versie-gebaseerde prompt-templates**, **jobs** met `review_status` (pending/approved/rejected), vijf **flows** (intake-analyse, proposal-writing, product-research, moodboard-analyse, knowledge-retrieval) met bronvermeldingen en **token-/kostenschatting**. Proposal-writing voegt een ontbrekende-content-checklist + kwaliteitsscore toe. UI in `AiPanel.jsx`. AI is **standaard uit** (`ai_settings.enabled = 0`).

Getest: geen automatische test (vereist externe key).

Live staat: AI uitgeschakeld; geen jobs.

### Auth (users/studios/memberships/sessions — optioneel)

Werkt: **`studios` / `users` / `memberships` / `sessions`**. Lokaal scrypt-wachtwoordhashing (Node-crypto, geen externe provider), register/login/logout, sessie-token (30 dagen), gebruikersbeheer (CRUD) en rollen (owner/admin/member). **Afdwinging**: de API-gate (`auth.apiGate`, gemount op `/api`) eist een geldige sessie zodra er één of meer gebruikers bestaan; in single-user modus (0 gebruikers) blijft alles open. De gate whitelist `/api/health`, `/api/auth/*` en de publieke `/api/portal/view/*`. **RBAC/ownership**: `authorization.routeGate` dwingt owner/admin-writebeleid af op write-routes, laat members read-only werken binnen hun project-/klantownershipscope en schrijft forbidden-beslissingen naar de auditlog. Gebruikersbeheer (`POST/PUT/DELETE /users`) vereist rol `owner`/`admin` (`requireRole`) met extra owner-lockoutregels. **Brute-force-bescherming**: 5 mislukte logins per e-mail+client → 15 min lockout (429). De frontend valt bij een 401 mid-sessie (verlopen/ingetrokken token) automatisch terug op de login-gate (`api.js` ruimt de token op en seint `App.jsx`). Beheer via Settings → Gebruikers; login-gate in `App.jsx` en `Login.jsx`.

Getest: `auth.test.js` en `authorization.test.js` — open in single-user modus, 401 zonder sessie zodra een gebruiker bestaat, whitelist blijft open, geldige sessie passeert, audit-attributie, member-403 op gebruikersbeheer en domeinwrites, cross-owner project/client 403, scope-filtering voor lijsten, en login brute-force-lockout (429 na 5 mislukte pogingen).

Live staat: geen gebruikers (single-user modus → API open, geen gedragswijziging).

### Client Portal (magic-link/feedback/activity)

Werkt: **`portal_access`** magic-link tokens per project (optioneel aan een proposal gekoppeld, met intrekken/verlopen), publieke **read-only view** die alleen klant-veilige data lekt (geen inkoopprijs/marge/interne secties), **feedback** per sectie/product/voorstel (`portal_feedback`; een product-akkoord/afwijzing wordt direct teruggeschreven naar de selectie-status) en een **activity-log** (`portal_activity`). UI in `PortalView.jsx` (publiek) + designer-review via `/api/portal/access`.

Getest: geen automatische test.

Live staat: geen portal-links.

### Media (metadata + orphan cleanup)

Werkt: **`media`**-tabel (één rij per upload: pad, mime, alt-tekst, tags, domein/ref). Upload, metadata bewerken, **orphan-detectie** (`/orphans`) en **opruimen** (`/cleanup-orphans`) van bestanden zonder DB-referentie.

Getest: geen.

Live staat: leeg.

### Audit log

Werkt: **`audit_log`** met een dependency-vrije `record()`-helper die door modules na mutaties wordt aangeroepen (proposals, products, budget, AI, render, portal, auth, knowledge…). De acteur (`user_id`) wordt per request vastgelegd via `AsyncLocalStorage` (`runWithUser`), zonder `req` door elke module te hoeven rijgen. Globale feed of gefilterd per entity/entity_id voor change-history. Auditing breekt nooit de primaire write.

Getest: auth-test verifieert dat een geauthenticeerde mutatie aan de juiste gebruiker wordt toegeschreven.

Live staat: log groeit met mutaties.

### Render (placeholder-provider)

Werkt: **`render_jobs`**-registry met pluggable provider-adapter. De meegeleverde `placeholder`-provider schrijft een gelabelde SVG zodat de pipeline zichtbaar end-to-end gewired is **zonder een echte renderer te faken**. Job aanmaken/draaien/verwijderen via API.

Getest: geen.

Live staat: geen render-jobs.

### Back-up & herstel

Werkt: ingebouwd back-upmechanisme (`server/src/modules/backup.js`) met consistente online-snapshots via better-sqlite3 `.backup()` (WAL-safe, blokkeert de app niet). Snapshots landen in `./data/backups/` met automatische retentie (`NOVA_BACKUP_KEEP`, default 14). Bereikbaar via `npm run backup` (cron-baar), de API (`POST /api/backup`, `GET /api/backup`, `GET /api/backup/download[/:filename]`, `DELETE /api/backup/:filename` — owner/admin-gated) en de UI (*Instellingen → Back-up*). Eén `.db` per snapshot, direct herstelbaar (zie `BACKUP_RUNBOOK.md`).

Getest: `backup.test.js` — een snapshot is een geldige, openbare SQLite-kopie mét de live data; pruning behoudt alleen de nieuwste N.

Live staat: nog geen back-ups gemaakt op de live instance.

## Technische Schuld (eerlijk)

- **RBAC/ownership is nu centraal afgedwongen voor projecten en klanten plus project-scoped childroutes.** Productbibliotheek/supplier/global-library data blijft studiobreed: owner/admin mogen schrijven, members zijn read-only.
- **Login heeft brute-force-lockout** (5 mislukte pogingen per e-mail+client → 15 min lock, in-memory). Nog open voor publiek internet: CSRF en gedeelde/persistente rate-limit-store bij meerdere processen.
- **Render is een placeholder-provider** (SVG-label). Er is geen echte beeld-/3D-render; een echte provider plugt in via de adapter.
- **AI draait alleen live tegen Anthropic als `ANTHROPIC_API_KEY` is gezet** én AI is ingeschakeld; anders een eerlijk lokaal concept. Geen andere providers geïmplementeerd.
- **E-mailverzending vereist configuratie**: portaalreacties verschijnen altijd in-app (bel + paneel). E-mail wordt alleen verstuurd wanneer `NOVA_SMTP_URL` is gezet én `nodemailer` is geïnstalleerd; anders blijft het bij in-app (`sent = 0`). Bewust geen geforceerde mail-dependency.
- **Validatie is nu gecentraliseerd** via `validate.js` en toegepast op de write-endpoints van vrijwel alle modules; alle API-fouten delen het envelope `{ error, details? }`. `projects` en `auth` gebruiken nog eigen inline zod-schema's (`safeParse`) i.p.v. de gedeelde middleware, maar leveren hetzelfde foutcontract.
- **Testdekking groeit, maar mist nog frontend/e2e**: backend-kernflows zijn nu gedekt (46 tests: API, validatie, auth/RBAC, authorization, back-up, budget/portal/concurrency/CSV/AI). Nog geen React-component-/e2e-/PDF-visual-tests.
- **Geen pagination/filtering-standaard** op de lijst-endpoints (datasets zijn nog klein).

## Hoogste Prioriteiten (nu het meest waardevol)

1. **Frontend/e2e-auth checks**: de backend dekt RBAC/ownership, maar er zijn nog geen browserflows die login, member-read-only gedrag en 403-UI controleren.
2. **Echte render-provider** koppelen via de bestaande adapter (beeldgeneratie of 3D).
3. **Live AI-sleutel** configureren + de flows aanscherpen; reviewstatus in de UI verankeren.
4. **Drag-gebaseerde editors** voor moodboard-layout en floorplan-objecten (nu vooral form-based CRUD).
5. **Accessibility- en responsive-audit** (toetsenbordnavigatie, contrast, mobiel).
6. **E-mailverzending** voor portaalnotificaties (SMTP/provider) bovenop de bestaande queue.
7. **Frontend e2e-/componenttests** (de UI-laag mist nog automatische dekking; backend-flows zijn gedekt).
8. **Bredere automatische tests**: portal-feedbackflow, budgetoverzicht, AI-fallback, render-job.
9. **Geplande back-ups activeren** op de host (cron → `docker compose exec -T app npm run backup`) en een restore-test draaien (mechanisme is er; routine nog inrichten).
10. **Documentatie blijven bijwerken** bij elke productwijziging (zie README-checklist).
