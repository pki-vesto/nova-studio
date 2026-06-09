# Nova Studio Design System

## Richting

Nova Studio moet eruit zien als een premium interieurplatform: warm, tactiel, editorial en rustig. Het mag niet aanvoelen als een generieke bedrijfsapplicatie. De huidige frontend volgt dit al met een magazine-achtige layout, veel witruimte, dunne lijnen, bijna vierkante kaarten en serif-displaytypografie.

## Kleuren

Huidige tokens in `web/src/styles/app.css`:

- Paper: `#F2EDE4`
- Paper 2: `#EBE3D6`
- Surface: `#FBF8F2`
- Surface 2: `#F6F0E6`
- Surface Ink: `#211D18`
- Ink: `#2A251F`
- Ink 2: `#574E44`
- Muted: `#978C7C`
- Muted 2: `#B3A896`
- Line: `#E2D8C8`
- Line 2: `#D4C8B4`
- Clay: `#A86F4C`
- Clay Soft: `#C9A487`
- Clay Wash: `#EFE3D6`
- Sage: `#6E7358`

Gebruik kleur spaarzaam. Clay is de primaire accentkleur; sage is ondersteunend. Vermijd harde corporate blues, zware gradients en decoratieve effecten die niets met interieurmateriaal te maken hebben.

## Typografie

Display: `Cormorant Garamond`, fallback Georgia/Times. Toepassing: grote projecttitels, ledes, proposalpagina's en editorial headings.

Sans: `Manrope`, fallback system UI. Toepassing: navigatie, labels, formulieren, tabellen, buttons en bodytekst.

Richtlijnen:

- Displaytekst mag ruim en redactioneel zijn.
- Bodytekst blijft leesbaar rond 15-16px met ruime line-height.
- Eyebrows en kickers gebruiken uppercase met letterspacing.
- Geen negatieve letterspacing op normale UI-labels.

## Spacing

Huidige schaal:

- `--s1: 4px`
- `--s2: 8px`
- `--s3: 12px`
- `--s4: 16px`
- `--s5: 24px`
- `--s6: 32px`
- `--s7: 48px`
- `--s8: 64px`
- `--s9: 96px`
- `--s10: 128px`

Gebruik ruime pagina-indeling, maar houd operationele controls compact. De Tweaks-density kan witruimte aanpassen; componenten moeten stabiel blijven bij compact, regular en comfy.

## Grids

Gebruik constrained content met `--content-max: 1180px` en een vaste sidebarbreedte `--nav-w: 248px`. Editorial grids mogen asymmetrisch zijn op presentatie- en proposalpagina's. Bibliotheken en lijsten moeten scanbaar blijven.

## Componenten

Buttons: klein, scherp, typografisch rustig. Primary is ink op surface; clay alleen voor belangrijke flow-acties.

Tags: uppercase, pill, dunne rand. Gebruik statuskleur alleen waar status betekenis heeft.

Primitives: `Ph`, `Kicker`, `Tag`, `StatusDot`, `SectionHead`, `Figure`, `EditButton` zijn de huidige basis.

Icons: lucide-react wordt gebruikt via lokale icon mapping. Icon-only controls moeten herkenbaar zijn of tekstlabel hebben.

## Kaarten

Cards gebruiken `--surface`, `--line` en radius `4px`. Gebruik kaarten voor herhaalde items en framed tools, niet voor elke pagina-sectie. Beeldkaarten moeten echte uploads tonen wanneer beschikbaar; striped placeholders zijn tijdelijke fallback.

## Formulieren

Formulieren leven meestal in `EditDrawer`. Inputs moeten rustig, breed en duidelijk gelabeld zijn. Formulieren horen bij een zichtbare outputpagina: eerst kijken/presenteren, dan inline bewerken.

## Modals en Drawers

`EditDrawer` is de standaard bewerklaag. Escape sluit de drawer. De drawer gebruikt een scrim en behoudt context van de pagina erachter. Gebruik drawers voor domeinbewerkingen; modals alleen voor korte bevestigingen of gevaarlijke acties.

## Tabellen

Tabellen moeten spaarzaam worden gebruikt. Voor product- of budgetdata zijn compacte rijen toegestaan, maar de primaire ervaring blijft editorial. Bedragen gebruiken tabular numerals en duidelijke totalen.

## Presentaties

Presentaties zijn fullscreen, visueel rustig en klantklaar. Ze gebruiken projectdata, echte beelden, materiaal- en productselecties. Navigatie via toetsenbord en dots is gebouwd. Toekomstige slides moeten niet aanvoelen als dashboardkaarten maar als ontworpen presentatiepagina's.

## Print en PDF

Browserprint bestaat voor het proposaldocument. Server-side PDF bestaat via PDFKit, maar moet visueel dichter naar het design system. Print/PDF mag nooit afhankelijk zijn van verborgen UI-controls.
