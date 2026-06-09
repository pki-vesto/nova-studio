# Nova Studio Architecture

## Applicatiearchitectuur

Frontend: React 19 met Vite. De app leeft onder `web/src`, met `App.jsx` als shell. Schermen zijn domeingericht: `ProjectsIndex`, `ProjectOverview`, `Moodboard`, `ColorMaterial`, `FloorPlan`, `Shopping`, `Proposal`, `Presentation`, `Library`, `Clients` en `Stijlgids`. Data gaat via `web/src/lib/api.js`, een dunne fetch-wrapper. Styling staat in `web/src/styles/app.css` met warme editorial tokens.

Backend: Node.js met Express 5. `server/src/index.js` start migraties, serveert statische uploads en exports, serveert de Vite-build uit `dist`, en mount domeinrouters onder `/api`.

Database: SQLite via `better-sqlite3`. `server/src/db/database.js` gebruikt `NOVA_DATA_DIR` of `./data`, zet WAL aan en forceert foreign keys. `server/src/db/schema.js` bevat idempotente migraties met `CREATE TABLE IF NOT EXISTS` en additieve `ALTER TABLE`-kolommen.

Storage: uploads worden lokaal opgeslagen in `server/uploads` of `NOVA_UPLOAD_DIR`. Bestandsnamen krijgen een gegenereerde ID. Exports worden lokaal opgeslagen in `data/exports` of `NOVA_EXPORT_DIR`.

PDF-engine: PDFKit genereert server-side A4-PDF's in `server/src/modules/proposals.js`. De PDF bundelt project, klant, intake, ruimtes, floorplans, moodboards en productselecties.

Deployment: Docker buildt frontend en backend in één image. `docker-compose.yml` draait een Tailscale sidecar en de app in hetzelfde netwerk. Data en uploads worden gemount als volumes. Healthcheck gebruikt `/api/health`. Lokale development gebruikt `npm run dev` met Vite en nodemon.

## Domeinarchitectuur

### Core

Verantwoordelijkheden: app lifecycle, globale data loading, navigatie, projectcontext, error state, tweaks en static serving.

Datamodellen: geen eigen tabel; gebruikt alle hoofdentiteiten.

Services: `App.jsx`, `api.js`, `Tweaks.jsx`, `primitives.jsx`, Express app bootstrap.

API's: `GET /api/health`.

### Clients

Verantwoordelijkheden: klanten, contactpersonen, adressen, gekoppelde projecten.

Datamodellen: `clients`, `client_contacts`, `client_addresses`.

Services: `server/src/modules/clients.js`, `web/src/screens/Clients.jsx`.

API's: `GET/POST /api/clients`, `GET/PUT/DELETE /api/clients/:id`, `POST /api/clients/:id/contacts`, `PUT/DELETE /api/clients/contacts/:contactId`, `POST /api/clients/:id/addresses`, `DELETE /api/clients/addresses/:addressId`.

### Projects

Verantwoordelijkheden: projectdossier, status, klantkoppeling, editorial metadata, budgetregels, palet, hero image, archiveren, herstellen, dupliceren, sample seed.

Datamodellen: `projects`, plus gehydrateerde child-data uit rooms, intake, products en materials.

Services: `server/src/modules/projects.js`, `server/src/modules/seed.js`, `web/src/screens/ProjectsIndex.jsx`, `web/src/screens/ProjectOverview.jsx`.

API's: `GET/POST /api/projects`, `GET/PUT /api/projects/:id`, `POST /api/projects/:id/hero`, `POST /api/projects/:id/archive`, `POST /api/projects/:id/restore`, `POST /api/projects/:id/duplicate`, `POST /api/projects/seed-sample`.

### Intake

Verantwoordelijkheden: projectintake opslaan en bijwerken.

Datamodellen: `intake`.

Services: `server/src/modules/intake.js`; geen eigen frontendtab in de huidige app, intakegegevens worden via project/proposalcontext gebruikt.

API's: `PUT /api/intake/:projectId`.

### Rooms

Verantwoordelijkheden: ruimtes creëren, wijzigen, verwijderen en afbeeldingen uploaden.

Datamodellen: `rooms`.

Services: `server/src/modules/rooms.js`, roombeheer in `web/src/screens/FloorPlan.jsx`.

API's: `POST /api/rooms`, `PUT /api/rooms/:id`, `DELETE /api/rooms/:id`, `POST /api/rooms/:id/image`.

### Floorplans

Verantwoordelijkheden: plattegrondrecords, uploads en eenvoudige tekening-JSON beheren.

Datamodellen: `floorplans`.

Services: `server/src/modules/floorplans.js`, `web/src/screens/FloorPlan.jsx`.

API's: `GET /api/floorplans/project/:projectId`, `POST /api/floorplans`, `PUT /api/floorplans/:id`, `DELETE /api/floorplans/:id`.

### Moodboards

Verantwoordelijkheden: moodboards en assetuploads.

Datamodellen: `moodboards`, `moodboard_assets`.

Services: `server/src/modules/moodboards.js`, `web/src/screens/Moodboard.jsx`.

API's: `GET /api/moodboards/project/:projectId`, `POST /api/moodboards`, `PUT /api/moodboards/:id`, `DELETE /api/moodboards/:id`, `POST /api/moodboards/:id/assets`, `DELETE /api/moodboards/assets/:assetId`.

### Color Library

Verantwoordelijkheden: nu projectpalet als JSON op `projects`; geen globale bibliotheek.

Datamodellen: `projects.palette_json`.

Services: `web/src/screens/ColorMaterial.jsx`, `server/src/modules/projects.js`.

API's: `PUT /api/projects/:id` met `palette`.

### Material Library

Verantwoordelijkheden: projectmaterialen met afbeelding.

Datamodellen: `materials`.

Services: `server/src/modules/materials.js`, `web/src/screens/ColorMaterial.jsx`.

API's: `GET /api/materials/project/:projectId`, `POST /api/materials`, `PUT /api/materials/:id`, `DELETE /api/materials/:id`.

### Products

Verantwoordelijkheden: productbibliotheek, productuploads, productselectie per project, shoppinglijst en budgettotaal.

Datamodellen: `products`, `project_products`.

Services: `server/src/modules/products.js`, `web/src/screens/Library.jsx`, `web/src/screens/Shopping.jsx`, `web/src/lib/budget.js`.

API's: `GET/POST /api/products`, `PUT/DELETE /api/products/:id`, `POST /api/products/select`, `PUT /api/products/selection/:id`, `DELETE /api/products/selection/:id`, `GET /api/products/shopping-list/:projectId`.

### Suppliers

Verantwoordelijkheden: nog geen aparte service; leverancier staat als tekst op `products.supplier`.

Datamodellen: geen eigen tabel.

Services: productmodule.

API's: geen eigen API.

### Design Library

Verantwoordelijkheden: projecttemplates en duplicatie zijn de huidige basis; geen aparte bibliotheektabel.

Datamodellen: `projects.is_template`, `projects.template_name`.

Services: projectmodule.

API's: projectlijst met `templates=1`, duplicatie via `/api/projects/:id/duplicate`.

### Proposals

Verantwoordelijkheden: voorstel aanmaken, ophalen en PDF exporteren.

Datamodellen: `proposals`.

Services: `server/src/modules/proposals.js`, `web/src/screens/Proposal.jsx`, `BudgetBlock.jsx`.

API's: `POST /api/proposals`, `GET /api/proposals/project/:projectId`, `POST /api/proposals/:id/export-pdf`.

### Presentation Engine

Verantwoordelijkheden: fullscreen presentatie uit projectcontext.

Datamodellen: gebruikt geen eigen tabel.

Services: `web/src/screens/Presentation.jsx`.

API's: geen eigen API; gebruikt geladen project-, moodboard- en shoppingdata.

### AI Services

Verantwoordelijkheden: nog niet geïmplementeerd als service. Alleen `intake.ai_summary` bestaat als opslagveld.

Datamodellen: `intake.ai_summary`.

Services: geen provider, geen queue, geen prompt registry.

API's: geen AI API's.

## Datamodeloverzicht

- `clients`: klantmasterdata met voorkeuren-JSON en notities.
- `client_contacts`: meerdere contactpersonen per klant.
- `client_addresses`: meerdere adressen per klant.
- `projects`: centraal project met status, klantkoppeling, templatevelden, budget, editorial metadata, palet-JSON en hero image.
- `intake`: één intake per project.
- `rooms`: ruimtes per project, optionele parent-roomrelatie.
- `floorplans`: plattegronden per project, optionele roomkoppeling en `drawing_json`.
- `moodboards`: moodboards per project, optionele roomkoppeling.
- `moodboard_assets`: uploads per moodboard.
- `materials`: projectgebonden materialen.
- `products`: globale productbibliotheek.
- `project_products`: selectie van producten binnen project en optioneel ruimte.
- `proposals`: voorstelteksten en gegenereerd PDF-pad per project.

Relaties: Client heeft Projects. Project heeft Intake, Rooms, Floorplans, Moodboards, Materials, Project Products en Proposals. Moodboard heeft Assets. Product heeft Project Product selections. Room kan Floorplans, Moodboards en Project Products contextualiseren. Products kunnen naar een alternatief product verwijzen.

## Integratiearchitectuur

AI-laag: nog niet gekoppeld. De architectuur moet een adapterlaag krijgen met providerconfiguratie, promptversies, projectcontext-builder, retrieval-bronnen, human approval en logging.

PDF-generatie: server-side via PDFKit. Export schrijft naar lokale exportmap en serveert via `/exports`.

Presentatie-engine: client-side React fullscreen overlay met toetsenbordnavigatie en pagina's uit geladen context.

Mediaopslag: lokaal filesystem met Express static serving. `uploadUrl` en `fileUrl` normaliseren bestandsreferenties naar `/uploads/<basename>`.

## Toekomstige Architectuur

Multi-user: vereist `users`, `studios`, lidmaatschappen, rollen, ownership op alle hoofdtabellen, sessions/auth, auditlog en optimistic concurrency.

Klantportalen: vereist portal-users of magic links, read-only proposal views, feedback/comment tables, approval status, public-safe media URLs en privacyfilters.

Leveranciersintegraties: vereist `suppliers`, `supplier_contacts`, `supplier_products`, prijs- en beschikbaarheidssnapshots, importjobs en rate-limited connectors.

AI-services: vereist `ai_jobs`, `ai_outputs`, `prompt_templates`, `knowledge_chunks`, vector/retrieval-index en expliciete reviewstatus.

Render engines: vereist room/floorplan geometry, material/product placement metadata, asset normalization, job queue en render output storage.
