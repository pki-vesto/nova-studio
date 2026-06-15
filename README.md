# Nova Studio

Nova Studio is een lokale, self-hosted werktool voor een interieurontwerper. De eerste versie is een verticale slice van intake tot voorstel: projecten, klanten, ruimtes, eenvoudige plattegronden, moodboards, productbibliotheek, shoppinglijst en PDF-export.

## Editorial redesign (Claude Design hand-off)

De frontend is herontworpen van een zakelijke CRUD-applicatie naar een **premium, editorial ontwerpomgeving** — warm & natuurlijk (Cormorant Garamond + Manrope, klei/travertijn-palet), met veel witruimte. Alles is gewired op de bestaande Express/SQLite-API; de tool blijft volledig functioneel.

Werkruimte per project: **Overzicht · Moodboard · Kleur & materiaal · Plattegrond · Shoppinglijst · Voorstel**, plus een **fullscreen presentatiemodus** (pijltjestoetsen + dots), een bladerbaar **Voorstel**-document (print/PDF), de **Productbibliotheek**, **Klanten** en een **Stijlgids**. Beheren gebeurt in-place via editorial edit-drawers. Een **Tweaks**-paneel (knop in de werkbalk) regelt accentkleur, papiertint, witruimte en de standaard shopping-layout (opgeslagen in localStorage).

Beeld dat nog ontbreekt valt terug op nette, gelabelde placeholders — upload echte foto's (hero, ruimte-sfeerbeelden, materialen, producten, moodboard-assets) en ze verschijnen automatisch.

### Voorbeeldproject

```bash
npm run seed   # laadt "Herenhuis aan de Keizersgracht" (idempotent)
```

Of klik **Laad voorbeeldproject** op een leeg projectenoverzicht. De editorial velden zijn data-driven; het schema is uitgebreid met o.a. `projects.vision/summary/goals_json/principles_json/palette_json/budget_lines_json/hero_image_path`, `rooms.concept/image_path`, `products.designer`, `project_products.is_feature` en een `materials`-tabel (additieve, idempotente migraties).

## Platform

Sinds de platform-expansie (2026-06-09) is Nova Studio uitgegroeid van een verticale slice tot een breder interieurstudio-platform. Nieuwe capability-gebieden:

- **Suppliers** — leveranciers als eigen domein met contactpersonen en levertijdhistorie.
- **Color Library & Material Library** — globale, herbruikbare kleuren en materialen, plus per-ruimte kleurtoepassingen en projectkoppeling met onderhoud/duurzaamheid/sample-status.
- **Design Library** — herbruikbare concepten, room-templates, product-/materiaalsets en proposal-snippets.
- **Knowledge graph** — knopen/relaties/bronnen met zoeken, padweergave en promotie vanuit project/proposal/product/moodboard.
- **Budget** — scenario's, kamerbudgetten en een overzicht met marge en btw.
- **Planning** — taken, mijlpalen, documenten en een gecombineerde timeline.
- **Proposals 2.0** — configureerbare secties, versies, statusflow, comments, client/internal audience, PDF-theming en exportgeschiedenis.
- **AI-platform** — provider-adapter, settings, versie-prompts, jobs met reviewstatus en kostenschatting (zie AI hieronder).
- **Auth** — optionele gebruikers, studio's, memberships en sessies.
- **Client portal** — magic-link, read-only voorstel met feedback en activiteit-log.
- **Media** — metadata per upload met orphan-cleanup.
- **Render** — pluggable job-pipeline (placeholder-provider).
- **Audit log** — change-history over alle domeinen.

API-routegroepen (gemount in `server/src/index.js`): `/api/suppliers`, `/api/colors`, `/api/material-library`, `/api/design-library`, `/api/knowledge`, `/api/budget`, `/api/media`, `/api/render`, `/api/planning`, `/api/ai`, `/api/auth`, `/api/portal`, `/api/audit` (naast de bestaande `/api/projects`, `/api/clients`, `/api/intake`, `/api/rooms`, `/api/floorplans`, `/api/moodboards`, `/api/products`, `/api/proposals`, `/api/materials`, `/api/uploads`).

De frontend (`web/src/App.jsx`) heeft **hash-routing met deep links**, een **⌘K command palette**, een **optionele login-gate** en een publieke route `#/portal/<token>`.

Eerlijke status: zie `docs/CURRENT_STATE.md` en `docs/PRODUCT_BACKLOG.md` voor wat Completed / Partial / Scaffolded is.

## Stack

- React/Vite frontend
- Node/Express API
- SQLite via `better-sqlite3`
- Lokale uploads in `server/uploads`
- Server-side PDF-export via PDFKit
- Docker-ready, zonder cloud-afhankelijkheid

## Lokaal draaien

```bash
npm install
npm run dev
```

Open daarna:

- App: http://localhost:5173
- API healthcheck: http://localhost:4000/api/health

## Tests & build

```bash
npm test        # util-tests + API-integratietests (client/project/product/proposal/PDF/statusflow)
npm run build   # release-build-check (Vite production build)
npm run check:pdf-renderer  # controleert Poppler/pdftoppm voor PDF-floorplan thumbnails
```

`npm test` draait alle `*.test.js` onder `server/src/` in-process tegen een geïsoleerde tijdelijke database — het raakt de live `./data` nooit. Draai `npm run build` als build-check voordat je een release uitrolt.

## Auth (optioneel)

Nova Studio werkt standaard als single-user lokale tool zonder login. Zodra je via **Settings → Gebruikers** een eerste gebruiker aanmaakt (die wordt `owner`), verschijnt er een login-gate. De sessie-middleware blokkeert nooit zolang er geen gebruikers bestaan, dus bestaande installs blijven werken. Wachtwoorden worden lokaal gehasht (Node-crypto scrypt); rollen (owner/admin/member) worden per route afgedwongen. Owner/admin mogen domeindata schrijven binnen hun studio; members zijn read-only en zien alleen projecten/klanten binnen hun ownershipscope.

## AI

Het AI-platform is standaard **uitgeschakeld**. Zet AI aan via de AI-instellingen en lever een Anthropic-sleutel aan via de omgevingsvariabele `ANTHROPIC_API_KEY` om de flows live door **Claude** te laten schrijven. Zonder sleutel (of bij een mislukte call) levert de adapter een **eerlijk, lokaal concept** dat duidelijk als zodanig gelabeld is — er wordt nooit stil een modelcall gefaket.

## Productie/self-hosted

PDF-plattegrondthumbnails gebruiken Poppler via het runtime-binary `pdftoppm`. De Docker-image installeert `poppler-utils`; bij een niet-Docker deployment moet `pdftoppm` op `PATH` staan. Controleer dit vóór productie met:

```bash
npm run check:pdf-renderer
```

```bash
docker compose up --build
```

Open http://localhost:4000 when running with `npm start`, or use Docker/Tailscale:

```bash
cp .env.example .env
# Vul TS_AUTHKEY in met een reusable Tailscale auth key.
docker compose up -d --build
```

Docker exposes a loopback-only smoke-test endpoint at http://127.0.0.1:4100.
Real access is via **https://nova-studio.tail9d0c71.ts.net** from devices in the tailnet.
Data blijft lokaal in `./data` en uploads in `./server/uploads`.

If the Tailscale sidecar is restarted manually, restart the app container after it:

```bash
docker compose restart app
```

## Domeinen

Kerndomeinen (V1); de uitgebreide platform-domeinen staan in **Platform** hierboven.

- `Projects`: centraal projectdossier met klant en budget (incl. soft-delete + optimistic concurrency + volledige duplicatie)
- `Intake`: gestructureerde intakevelden (incl. scope/risks/followups) plus AI-samenvattingveld
- `Rooms`: ruimtes met oriëntatie, daglicht en kleuradviesnotities
- `Floorplans`: upload van afbeelding/PDF en tekening met schaal, objecten op lagen en versies
- `Moodboards`: concepten met kleuren, materialen, beelden, varianten en feedback
- `Products`: herbruikbare bibliotheek met prijs/marge/btw/varianten/favorieten/CSV
- `Project products`: selectie per project/ruimte met prijsberekening en itemstatus
- `Proposals`: voorstel met secties/versies/status en PDF-export

## Aannames & grenzen

- **Single-user blijft de default**, maar optionele multi-user auth/studio's bestaan (login pas actief zodra er gebruikers zijn). RBAC en ownership-scoping zijn actief zodra gebruikers bestaan.
- Geen volledige CAD: de plattegrond-editor ondersteunt muren, objecten op lagen en upload van bronbestanden — geen drag-canvas of IFC/BIM.
- AI draait live tegen Claude alleen met `ANTHROPIC_API_KEY`; anders een eerlijk lokaal concept.
- Render is een placeholder-provider; e-mailnotificaties worden gequeued maar niet verzonden.
- PDF-layout is bewust server-side en gescheiden van project- en productlogica.

## Documentatie-update checklist

Werk bij **elke** productwijziging de docs bij: `docs/CURRENT_STATE.md` (Werkt/Getest/Live staat), `docs/PRODUCT_BACKLOG.md` (status Completed/Partial/Scaffolded/Not Started), `docs/SCHEMA_CHANGELOG.md` (bij DB-wijzigingen) en deze README waar het gedrag of de routes veranderen. Wees eerlijk: markeer alleen Completed wat echt functioneel is.
