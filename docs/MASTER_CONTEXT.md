# Nova Studio Master Context

Dit document is de primaire bron van waarheid voor Nova Studio. Nieuwe ontwikkelsessies starten hier en werken daarna `CURRENT_STATE.md`, `ARCHITECTURE.md`, `PRODUCT_BACKLOG.md` en `ROADMAP.md` bij wanneer de feitelijke productstaat verandert.

## Productvisie

Nova Studio is het digitale besturingssysteem van een professionele interieurontwerper. Het product bundelt klantkennis, projectdossiers, ontwerpkeuzes, moodboards, plattegronden, materiaalkeuzes, productselecties, voorstellen en presentaties in een rustige, premium werkomgeving.

De visie is dat een interieurontwerper niet hoeft te schakelen tussen losse notities, spreadsheets, Pinterest-borden, productlinks, PDF-tools en presentatiebestanden. Nova Studio moet de volledige professionele ontwerpflow dragen: van eerste intake tot klantpresentatie, van productresearch tot offerte, van losse inspiratie tot opgebouwde studio-kennis.

De missie is om ontwerpkwaliteit, commerciële slagkracht en kennisopbouw te combineren. Nova Studio moet het creatieve oordeel van de ontwerper versterken, de administratieve last verlagen en elk project bruikbaar maken als bron voor toekomstige projecten.

De noordster is: een interieurontwerper kan vanuit één projectdossier een overtuigend, inhoudelijk onderbouwd en visueel premium ontwerpvoorstel presenteren, exporteren en doorontwikkelen zonder contextverlies.

De doelgroep bestaat primair uit zelfstandige en kleine professionele interieurstudio's die high-touch klantwerk leveren. Zij hebben behoefte aan visuele kwaliteit, projectoverzicht, herbruikbare kennis, productcontrole, materiaalconsistentie en voorstelkwaliteit. Nova Studio is geen generieke CRM en geen CAD-pakket; het is een ontwerpstudio-OS.

Ontwerpprincipes:

- Premium editorial first: het product voelt als een interieurmagazine en studioatelier, niet als een zakelijke backoffice.
- Workflow first: elke module moet bijdragen aan een complete professionele klantflow.
- Context first: beslissingen, materialen, producten en klantvoorkeuren blijven aan elkaar gekoppeld.
- Designer in control: AI, berekeningen en suggesties ondersteunen; de ontwerper beslist.
- Reuse by default: succesvolle producten, materialen, kleuren, leveranciers en argumentaties worden herbruikbare kennis.
- Local and durable: het product moet self-hosted kunnen draaien en data lokaal kunnen bewaren.
- No dead ends: schermen mogen geen eindpunt zijn zonder volgende actie in de projectflow.

Succescriteria:

- Een project kan van intake tot voorstel en presentatie volledig in Nova Studio worden opgebouwd.
- Een voorstel bevat echte projectdata, echte beelden, productselecties, budgetregels en ontwerpargumentatie.
- Een presentatie kan live aan een klant worden getoond zonder externe slide-tool.
- Een ontwerper kan sneller terugvinden waarom een keuze is gemaakt.
- Product-, materiaal-, kleur- en leverancierkennis groeit na ieder project.
- Nieuwe AI-agents kunnen aan de codebase werken zonder productcontext te verliezen.
- Documentatie blijft gelijkwaardig aan code als bron voor productrichting.

## Productdomeinen

### Core

Doel: de applicatieshell, navigatie, globale zoekervaring, projectcontext, statusmodel, instellingen en self-hosted basis dragen.

Verantwoordelijkheden: app-navigatie, projectselectie, dataloading, foutmelding, healthcheck, thema-tweaks, localStorage-instellingen en basisdeployment. Core bewaakt dat alle domeinen binnen dezelfde premium studio-ervaring vallen.

Relaties: Core laadt Clients, Projects, Products, Floorplans, Moodboards, Proposals en Shopping-data. Core levert context aan alle React-schermen.

Toekomstige uitbreidingen: authenticatie, rollen, studio-instellingen, auditlog, globale command palette, notificaties, taken, versiegeschiedenis, import/export en multi-user presence.

### Clients

Doel: klantdossiers beheren als bron voor projecten en toekomstige klantportalen.

Verantwoordelijkheden: klantgegevens, bedrijf, contactdata, adressen, voorkeuren, notities, gekoppelde projecten en primaire contactpersonen.

Relaties: Projects verwijzen naar Clients; Intake verrijkt klantkennis; Knowledge Graph koppelt voorkeuren aan ruimtes, materialen, producten en ontwerpbeslissingen.

Toekomstige uitbreidingen: klantportaal, goedkeuringen, klantfeedback, meerdere stakeholders per project, communicatiehistorie, privacy-instellingen en herhaalprojecten.

### Projects

Doel: het centrale ontwerp- en verkoopdossier.

Verantwoordelijkheden: titel, status, klantkoppeling, locatie, type, oppervlakte, stijl, lead, oplevering, budget, visie, samenvatting, doelen, ontwerpprincipes, palet, budgetregels, hero-beeld, archiveren, herstellen en dupliceren.

Relaties: Projects zijn de parent voor Intake, Rooms, Floorplans, Moodboards, Materials, Project Products en Proposals.

Toekomstige uitbreidingen: projectfasering, taken, mijlpalen, contracten, versies, scenario's, goedkeuringsstatussen, planning en templatebibliotheek.

### Intake

Doel: de eerste klantvraag structureren tot ontwerpbare informatie.

Verantwoordelijkheden: huishouden, wensen, ruimtegebruik, stijlvoorkeuren, kleurvoorkeuren, budgetindicatie, bestaande meubels, randvoorwaarden, vrije notities en AI-samenvattingveld.

Relaties: voedt Projects, Rooms, Moodboards, Proposal Writing en AI Services.

Toekomstige uitbreidingen: intakeformulieren, klantportaal-invoer, automatische analyse, conflict-detectie, scope-inschatting en intakeversies.

### Rooms

Doel: ruimtes als ontwerpbare eenheden beheren.

Verantwoordelijkheden: ruimtehiërarchie, naam, type, verdieping, afmetingen, oriëntatie, daglicht, kleuradviesnotities, designer notes, concept, afbeelding en sortering.

Relaties: Floorplans, Moodboards, Products en Materials kunnen aan Rooms worden gekoppeld.

Toekomstige uitbreidingen: ruimteprogramma's, meetstaten, zone-indeling, room-by-room budgets, technische eisen, renderkoppeling en kamer-specifieke presentatiepagina's.

### Floorplans

Doel: ruimtelijke structuur opnemen en communiceren.

Verantwoordelijkheden: upload van afbeelding/PDF, verdieping, noordhoek, eenvoudige tekening in JSON met muren, deuren, ramen, labels en notities.

Relaties: gekoppeld aan Projects en optioneel Rooms; gebruikt in Presentation Engine en Proposals.

Toekomstige uitbreidingen: schaal, maatvoering, objectplaatsing, lagen, meerdere versies, PDF/image preview, CAD-import, meetstaat, render-engine input en annotaties.

### Moodboards

Doel: stijlrichting, sfeerbeelden, kleuren en materialen visueel samenbrengen.

Verantwoordelijkheden: moodboardtitel, beschrijving, kleurarray, materiaalarray en beeldassets.

Relaties: gekoppeld aan Projects en optioneel Rooms; voedt Presentation Engine, Proposals, Color Library, Material Library en AI Moodboard Analysis.

Toekomstige uitbreidingen: layout-editor, asset-tagging, bronvermelding, beeldanalyse, moodboardvarianten, klantfeedback en herbruikbare concepttemplates.

### Color Library

Doel: kleurkeuzes projectoverstijgend beheren.

Verantwoordelijkheden: nu aanwezig als projectpalet in `projects.palette_json`; toekomstige bibliotheek beheert kleurcodes, namen, toepassingen, lichtcondities, combinaties en merkverwijzingen.

Relaties: Moodboards, Rooms, Proposals, Knowledge Graph en AI Services.

Toekomstige uitbreidingen: globale kleurentabel, verfmerken, NCS/RAL, kleurharmonie, kamerlicht-profielen en projecthistorie per kleur.

### Material Library

Doel: materiaalkeuzes vastleggen, visualiseren en hergebruiken.

Verantwoordelijkheden: nu aanwezig als projectgebonden `materials` met naam, specificatie, toepassing, afbeelding en volgorde.

Relaties: Projects, Rooms, Moodboards, Suppliers, Proposals en Knowledge Graph.

Toekomstige uitbreidingen: globale materiaalbibliotheek, leverancierskoppeling, onderhoudsinformatie, duurzaamheid, prijsbanden, monsterstatus en technische eigenschappen.

### Products

Doel: productkennis en projectselecties beheren.

Verantwoordelijkheden: naam, merk, leverancier als tekstveld, categorie, collectie, SKU, afmetingen, levertijd, designer, alternatief, afbeelding, prijs, webshoplink, beschrijving, notities, tags en status.

Relaties: Project Products koppelen Products aan Projects en Rooms; Proposals en Shoppinglijst gebruiken productdata.

Toekomstige uitbreidingen: product intelligence, prijsupdates, beschikbaarheid, varianten, alternatieven, marge, inkoopprijs, leverancier-ID, scraping/import, favorieten en performance per projecttype.

### Suppliers

Doel: leveranciers als professionele kennislaag beheren.

Verantwoordelijkheden: nu alleen impliciet als tekstveld op Products; toekomstig domein beheert contactgegevens, condities, levertijden, prijslijsten, betrouwbaarheid en productcatalogi.

Relaties: Products, Materials, Proposals, Product Intelligence en Knowledge Graph.

Toekomstige uitbreidingen: leveranciersintegraties, offerte-aanvragen, bestellijsten, trade pricing, accountmanagers en leveringshistorie.

### Design Library

Doel: herbruikbare ontwerpbeslissingen, stijlpijlers, projecttemplates en argumentaties bewaren.

Verantwoordelijkheden: nu deels aanwezig via projecttemplates, duplicatie, projectvisie, doelen, principes en seedproject.

Relaties: Projects, Moodboards, Proposals, Knowledge Graph en AI Services.

Toekomstige uitbreidingen: conceptbibliotheek, stijlprofielen, proposal snippets, room templates, productsets, materiaalsets en bewezen ontwerpcombinaties.

### Proposals

Doel: klantklare ontwerpvoorstellen maken en exporteren.

Verantwoordelijkheden: voorstelrecords, titel, intro, stijlrichting, kleuradvies, afsluiting, generated_pdf_path en server-side PDF-export.

Relaties: gebruikt Projects, Clients, Intake, Rooms, Floorplans, Moodboards en Project Products.

Toekomstige uitbreidingen: versiebeheer, sectie-editor, prijsscenario's, acceptatieflow, digitale ondertekening, PDF-thema's, offertebijlagen en klantcommentaar.

### Presentation Engine

Doel: live klantpresentaties vanuit dezelfde projectdata tonen.

Verantwoordelijkheden: fullscreen React-presentatie, pagina-opbouw uit projectdata, moodboardassets, materialen, productfeatures, budget en toetsenbordnavigatie.

Relaties: gebruikt Projects, Moodboards, Materials, Shoppinglijst en Proposal-data.

Toekomstige uitbreidingen: presenter notes, export naar PDF/deck, klantmodus, remote sharing, animatie-instellingen, versiepagina's en presentatiefeedback.

### AI Services

Doel: ontwerpwerk ondersteunen met analyse, research, schrijfwerk en kennisophaling.

Verantwoordelijkheden: nu voorbereid via `intake.ai_summary` en duidelijke domeingrenzen; er is nog geen providerintegratie.

Relaties: Intake Analyse, Product Research, Proposal Writing, Moodboard Analysis, Knowledge Retrieval en toekomstige Knowledge Graph.

Toekomstige uitbreidingen: provider-adapter, promptbibliotheek, retrieval-laag, productverrijking, voorstelassistent, inconsistentie-detectie, privacybeleid en human approval workflow.

## Architectuurprincipes

Design First: de interface moet aanvoelen als een premium interieurplatform. Data-entry gebeurt via rustige edit-drawers, terwijl de primaire schermen als presentabele studio-output ogen.

Data First: elk visueel onderdeel moet op echte projectdata kunnen draaien. Tekst, beelden, budgetten, producten en materialen moeten persistent zijn en niet alleen visuele mockups.

Knowledge First: alles wat in een project wordt geleerd, moet uiteindelijk herbruikbaar worden in de studio-kennislaag.

AI Assisted: AI helpt analyseren, structureren, schrijven en zoeken, maar vervangt de ontwerper niet.

Self Hosted First: Nova Studio moet lokaal en via eigen deployment kunnen draaien. SQLite, lokale uploads en Docker/Tailscale passen bij deze richting.

Professional First: beslissingen worden geprioriteerd op professionele workflowwaarde, voorstelkwaliteit, klantvertrouwen en duurzame doorontwikkeling.

## Prioriteiten

1. Proposal Engine: voorstelrecords, secties, budgetten, export, versies en professionele klantoutput.
2. Presentation Engine: live presentaties vanuit projectdata, inclusief beelden, materialen, producten en budget.
3. Moodboards: sterke visuele conceptvorming, assets, layouts, analyse en hergebruik.
4. Floorplans: betrouwbare ruimtelijke context, uploads, annotaties, maatvoering en presentatie.
5. Product Intelligence: producten verrijken, alternatieven vergelijken, leveranciers koppelen en shoppinglijsten professionaliseren.
6. Knowledge Management: projectkennis omzetten naar bibliotheken, templates en relaties.
7. AI Assistance: AI pas inzetten waar data en workflow scherp genoeg zijn voor gecontroleerde ondersteuning.

## Verboden Gedrag

- Niet stoppen bij MVP: de huidige verticale slice is een basis, geen eindpunt.
- Niet stoppen bij verticale slice: elk domein moet volwassen worden tot professionele workflow.
- Geen placeholders als eindresultaat: gelabelde placeholders mogen alleen tijdelijke fallback zijn tot echte data of uploads beschikbaar zijn.
- Geen onafgemaakte workflows: elke module moet duidelijke create, edit, review, export of presentatiestappen hebben.
- Geen AI-output zonder review: AI mag nooit ongecontroleerd klantklare keuzes publiceren.
- Geen losstaande schermen zonder domeinrelaties: nieuwe features moeten aansluiten op projectdata en kennisopbouw.
- Geen generieke bedrijfsapp-uitstraling: de premium interieurpositionering blijft leidend.
