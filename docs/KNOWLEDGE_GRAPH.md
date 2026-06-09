# Nova Studio Knowledge Graph

## Doel

Nova Studio wordt slimmer na ieder project. De Knowledge Graph legt relaties vast tussen klanten, projecten, ruimtes, producten, leveranciers, materialen, kleuren en ontwerpen, zodat ontwerpkeuzes terugvindbaar, herbruikbaar en beter onderbouwd worden.

## Kernprincipes

- Relaties zijn belangrijker dan losse records.
- Elke ontwerpkeuze moet context kunnen krijgen: waarom, waar, voor wie en met welk resultaat.
- Projectdata wordt na oplevering studio-kennis.
- AI gebruikt de graph als retrieval-bron, niet als vervanging van ontwerpbeslissing.

## Nodes

- Client: klant, huishouden, voorkeuren, constraints, feedback.
- Project: status, stijl, locatie, budget, type, doelen, principes.
- Room: functie, afmetingen, daglicht, oriëntatie, concept, eisen.
- Floorplan: ruimtelijke structuur, labels, annotaties, versies.
- Moodboard: stijlrichting, assets, kleuren, materialen, sfeerwoorden.
- Color: kleurwaarde, naam, toepassing, lichtconditie, merkverwijzing.
- Material: naam, specificatie, toepassing, afbeelding, onderhoud, leverancier.
- Product: merk, categorie, collectie, prijs, levertijd, designer, alternatieven.
- Supplier: contact, condities, betrouwbaarheid, catalogus, levertijdhistorie.
- Proposal: versie, secties, tekst, prijs, status, klantreactie.
- Design Concept: stijlprofiel, rationale, principes, bewezen combinaties.

## Relaties

- Client `owns` Project.
- Project `contains` Room.
- Project `has_intake` Intake.
- Project `uses_color` Color.
- Project `uses_material` Material.
- Project `selects_product` Product.
- Project `presented_as` Proposal.
- Room `uses_product` Product.
- Room `uses_material` Material.
- Room `uses_color` Color.
- Room `shown_in` Floorplan.
- Moodboard `expresses` Design Concept.
- Moodboard `contains_asset` Media Asset.
- Moodboard `suggests_color` Color.
- Moodboard `suggests_material` Material.
- Product `supplied_by` Supplier.
- Product `alternative_to` Product.
- Material `supplied_by` Supplier.
- Proposal `references` Product, Material, Color, Room and Design Concept.
- Client `approved` Proposal.
- Project `similar_to` Project.
- Design Concept `reused_in` Project.

## Van Project Naar Kennis

Na een project moeten de volgende onderdelen naar de kennislaag kunnen promoveren:

- succesvolle productsets;
- materiaalcombinaties;
- kleurpaletten;
- proposalteksten;
- intakepatronen;
- leverancierservaringen;
- budgetafwijkingen;
- klantfeedback;
- floorplanoplossingen;
- moodboardconcepten.

## Queryvoorbeelden

- Welke banken zijn eerder gebruikt in warme minimalistische woonkamers onder 6.000 euro?
- Welke materialen werkten goed in entrees met weinig daglicht?
- Welke leveranciers hadden korte levertijden voor travertijn of kalkverf?
- Welke proposalteksten leidden tot snelle akkoordmomenten?
- Welke kleuren zijn vaak gecombineerd met eiken, linnen en brons?
- Welke projecten lijken op deze intake?

## Implementatierichting

Fase 1: relationele graph in SQLite met `knowledge_nodes`, `knowledge_edges`, `source_table`, `source_id`, `relation_type`, `confidence`, `notes` en timestamps.

Fase 2: domeinspecifieke promotion flows vanuit Projects, Products, Materials, Moodboards en Proposals.

Fase 3: retrieval-index voor AI met bronverwijzingen naar graph-nodes.

Fase 4: UI voor zoeken, filteren, relatiepad bekijken en kennisitems hergebruiken in nieuwe projecten.
