# Nova Studio Roadmap

## Foundation

Doel: de documentatie, datakern en professionele single-user basis stabiel maken.

Afhankelijkheden: huidige Express/SQLite-app, bestaande schema's, huidige React-shell, `/docs` kennisbasis.

Succescriteria:

- Documenten in `/docs` zijn actueel en worden bij elke iteratie bijgewerkt.
- Hoofdflows hebben API-tests.
- Proposal update/delete, betere validatie en basis schema governance zijn aanwezig.
- Intake heeft een eigen volwaardige projecttab.
- Huidige local-first deployment blijft werken.

## Professional Workflow

Doel: de interieurontwerper kan een compleet project professioneel uitvoeren van intake tot voorstel en presentatie.

Afhankelijkheden: Foundation, stabiele projectdata, productselecties, moodboards, materialen en voorstelmodel.

Succescriteria:

- Proposal Engine ondersteunt secties, versies, status en professionele PDF's.
- Presentation Engine is configureerbaar en klantklaar.
- Shoppinglijst ondersteunt marges, btw, scenario's en kamerbudgetten.
- Klantfeedback en akkoordflow zijn ontworpen of eerste versie gebouwd.
- Geen klantgerichte workflow eindigt in een placeholder.

## Design Intelligence

Doel: ontwerpkeuzes worden rijker, herbruikbaar en beter onderbouwd.

Afhankelijkheden: Professional Workflow, globale libraries, betere product- en materiaalmodellen.

Succescriteria:

- Color Library en Material Library bestaan als globale kennisbronnen.
- Moodboards hebben tagging, layouts en analysevelden.
- Floorplans ondersteunen schaal, maatvoering en annotaties.
- Product Intelligence vergelijkt alternatieven en bewaakt prijs/beschikbaarheid.
- Design Library bevat templates, concepten en bewezen combinaties.

## Knowledge Platform

Doel: Nova Studio wordt slimmer na ieder project.

Afhankelijkheden: Design Intelligence, genormaliseerde domeinen, projecthistorie en consistente tagging.

Succescriteria:

- Knowledge Graph modelleert relaties tussen klanten, projecten, ruimtes, kleuren, materialen, producten, leveranciers en voorstellen.
- Projectlessen kunnen worden teruggevonden en hergebruikt.
- Zoek en filtering werken over domeinrelaties, niet alleen losse tabellen.
- Ontwerpbeslissingen krijgen rationale, context en outcome.

## AI Platform

Doel: AI ondersteunt analyse, research, schrijfwerk en retrieval zonder de ontwerper te vervangen.

Afhankelijkheden: Knowledge Platform, reviewflows, provider-adapter en privacybeleid.

Succescriteria:

- Intake Analyse genereert gecontroleerde samenvattingen en risico's.
- Product Research verrijkt producten en alternatieven.
- Proposal Writing maakt concepttekst per sectie met designer approval.
- Moodboard Analysis labelt beelden, kleuren en materialen.
- Knowledge Retrieval beantwoordt vragen met projectcontext en bronverwijzingen.

## Future Systems

Doel: Nova Studio uitbreiden naar multi-user, klantportalen, leveranciersintegraties en render engines.

Afhankelijkheden: AI Platform, auth/studio-model, genormaliseerde leveranciers en veilige media-access.

Succescriteria:

- Multi-user studios met rollen en auditlog.
- Klantportaal met feedback, akkoord en gedeelde presentaties.
- Leveranciersintegraties voor catalogi, prijzen en beschikbaarheid.
- Render/CAD/3D-pipeline kan werken vanuit floorplan-, material- en productdata.
- Self-hosted blijft een primaire deploymentoptie.
