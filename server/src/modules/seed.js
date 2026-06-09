const { db } = require("../db/database");
const { id } = require("./utils");

/* ============================================================
   Nova Studio — opt-in sample project.
   Mirrors the design hand-off data (Herenhuis aan de Keizersgracht)
   so the editorial views render fully populated from real rows.
   Idempotent: returns the existing sample if it was already seeded.
   ============================================================ */

const SAMPLE_TITLE = "Herenhuis aan de Keizersgracht";

const PALETTE = [
  { name: "Kalkwit", hex: "#EFE9DE", note: "Wanden — hoofdtint", use: "Romige basis, neemt daglicht zacht op." },
  { name: "Travertijn", hex: "#D8C7AE", note: "Vloer & steen", use: "Geaard, tactiel, verbindend." },
  { name: "Klei", hex: "#A86F4C", note: "Accent", use: "Warmte in textiel en keramiek." },
  { name: "Olijfschaduw", hex: "#6E7358", note: "Secundair accent", use: "Gedempt groen voor diepte." },
  { name: "Rookbruin", hex: "#5B4A3B", note: "Hout & leer", use: "Eik en cognacleer, donkere ankers." },
  { name: "Inkt", hex: "#2A251F", note: "Tekst & lijn", use: "Contrast zonder hard zwart." }
];

const MATERIALS = [
  { name: "Travertijn — gezoet", spec: "Romeins, ongevuld", application: "Vloer begane grond, badkamer" },
  { name: "Europees eik — geolied", spec: "Rustiek, naturel", application: "Visgraatvloer, maatwerk" },
  { name: "Belgisch linnen", spec: "Stonewashed, naturel", application: "Gordijnen, bankbekleding" },
  { name: "Gepolijst pleisterwerk", spec: "Tadelakt, kalkwit", application: "Badkamerwanden" },
  { name: "Geborsteld brons", spec: "Levend, onbehandeld", application: "Beslag, armaturen" },
  { name: "Cognac anilineleer", spec: "Volnerf, plantaardig", application: "Fauteuils, accenten" }
];

const ROOMS = [
  { key: "woonkamer", name: "Woonkamer", floor_level: "Bel-etage", concept: "Representatief en geborgen — de plek voor ontvangst én ontspanning." },
  { key: "keuken", name: "Keuken & eetkamer", floor_level: "Souterrain", concept: "Het hart van het huis. Eten, koken en samenkomen rond de tafel." },
  { key: "slaapkamer", name: "Master bedroom", floor_level: "Eerste verdieping", concept: "Een rustige, gedimde retraite met zicht op de gracht." }
];

const PRODUCTS = [
  { room: "woonkamer", name: "Develius modulaire bank", brand: "&Tradition", designer: "Edward van Vliet", price: 4890, supplier: "Studio Lijn, Amsterdam", category: "Meubilair", motivation: "Lage, royale zit in naturel linnen. Modulair zodat de zithoek meebeweegt met het gezin.", feature: true },
  { room: "woonkamer", name: "Insula salontafel", brand: "&Tradition", designer: "Norm Architects", price: 1240, supplier: "Studio Lijn, Amsterdam", category: "Meubilair", motivation: "Travertijnen blad dat het materiaalverhaal van de vloer doortrekt." },
  { room: "woonkamer", name: "Little Petra fauteuil", brand: "&Tradition", designer: "Viggo Boesen", price: 2100, supplier: "Vij5, Eindhoven", category: "Meubilair", motivation: "Omhullende schapenvacht-fauteuil — tactiel contrapunt bij de strakke bank." },
  { room: "woonkamer", name: "Flowerpot VP3 vloerlamp", brand: "&Tradition", designer: "Verner Panton", price: 430, supplier: "Lumière, Amsterdam", category: "Verlichting", motivation: "Zacht indirect licht in mat klei — warmte voor de avond." },
  { room: "woonkamer", name: "Handgeknoopt wollen tapijt", brand: "Atelier Tisca", designer: "Maatwerk", price: 1850, supplier: "Tisca, op maat", category: "Textiel", motivation: "Ongeverfde wol in zand- en kleitinten; ankert de zithoek en dempt akoestiek." },

  { room: "keuken", name: "Søborg eettafel — eik", brand: "Fredericia", designer: "Børge Mogensen", price: 2980, supplier: "Vij5, Eindhoven", category: "Meubilair", motivation: "Massief geolied eiken tafel die met de jaren mooier wordt — voor twaalf gasten.", feature: true },
  { room: "keuken", name: "CH24 Wishbone stoel", brand: "Carl Hansen & Søn", designer: "Hans J. Wegner", price: 690, qty: 8, supplier: "Carl Hansen, Amsterdam", category: "Meubilair", motivation: "Een tijdloze klassieker in zeepbehandeld eiken met naturel papierkoord." },
  { room: "keuken", name: "PH 5 hanglamp", brand: "Louis Poulsen", designer: "Poul Henningsen", price: 560, supplier: "Lumière, Amsterdam", category: "Verlichting", motivation: "Verblindingsvrij licht recht boven de tafel — een rustige, witte stilte." },
  { room: "keuken", name: "Handgevormde keramiek serviesset", brand: "Atelier Ceramics", designer: "Op bestelling", price: 840, supplier: "Keramiek Studio, Utrecht", category: "Decoratie", motivation: "Aardse glazuren in klei en zand; brengt het palet tot op tafel." },

  { room: "slaapkamer", name: "Linnen bedframe op maat", brand: "Nova Atelier", designer: "In-house", price: 2300, supplier: "Eigen atelier", category: "Meubilair", motivation: "Zacht omkleed hoofdbord in stonewashed linnen — de kamer als cocon.", feature: true },
  { room: "slaapkamer", name: "Travertijn nachtkastje", brand: "Ferm Living", designer: "Studio Ferm", price: 640, qty: 2, supplier: "Ferm Living, online", category: "Meubilair", motivation: "Massieve travertijnblokken — sculpturaal en stil naast het bed." },
  { room: "slaapkamer", name: "Milana wandlamp", brand: "Santa & Cole", designer: "Antoni Arola", price: 430, qty: 2, supplier: "Lumière, Amsterdam", category: "Verlichting", motivation: "Gericht leeslicht in geborsteld brons; vrij nachtkastje, warme gloed." },
  { room: "slaapkamer", name: "Linnen dekbedovertrek & plaid", brand: "Society Limonta", designer: "", price: 520, supplier: "Society, Milaan", category: "Textiel", motivation: "Gewassen linnen in oudwit met een plaid in olijfschaduw als accent." }
];

const PROJECT = {
  title: SAMPLE_TITLE,
  status: "proposal",
  location: "Amsterdam — Grachtengordel",
  project_type: "Volledige renovatie · 3 verdiepingen",
  surface: "240 m²",
  style: "Warm minimalisme",
  lead: "Eline Vermeer",
  delivery: "Voorjaar 2026",
  address: "Keizersgracht, Amsterdam",
  vision: "Een monumentaal grachtenpand dat zijn 17e-eeuwse ziel behoudt, maar opnieuw gaat ademen. We brengen warmte, rust en tactiliteit terug — natuurlijke materialen, zacht licht en een palet dat aanvoelt als thuiskomen.",
  summary: "De familie wenst een woning die zowel representatief als geborgen is. Geen koele perfectie, maar een huis met karakter: travertijn dat veroudert, eikenhout dat patineert, linnen dat ademt. Tijdloos boven trendgevoelig.",
  goals: [
    "Behoud en herstel van monumentale details — stucplafonds, schouwen, paneeldeuren.",
    "Een doorlopend, rustig materiaal- en kleurpalet over alle verdiepingen.",
    "Maximaal daglicht; gelaagde, warme avondverlichting.",
    "Maatwerk berging zodat het huis visueel rustig blijft."
  ],
  principles: [
    { k: "Stijlrichting", v: "Warm minimalisme" },
    { k: "Sleutelwoorden", v: "Rust · tactiel · tijdloos" },
    { k: "Materialen", v: "Travertijn, eik, linnen, brons" },
    { k: "Sfeer", v: "Geborgen, licht, geaard" }
  ],
  budget_lines: [
    { cat: "Styling & realisatie", amount: 6500 },
    { cat: "Ontwerp & begeleiding", amount: 9800 }
  ]
};

function seedSampleProject() {
  const existing = db.prepare("SELECT id FROM projects WHERE title = ? ORDER BY created_at LIMIT 1").get(SAMPLE_TITLE);
  if (existing) return existing.id;

  const clientId = id("client");
  const projectId = id("project");

  const tx = db.transaction(() => {
    db.prepare("INSERT INTO clients (id, name, email, phone, address, notes) VALUES (?, ?, ?, ?, ?, ?)").run(
      clientId,
      "Familie Van der Velde",
      "vandervelde@voorbeeld.nl",
      "+31 20 123 45 67",
      "Keizersgracht, Amsterdam",
      "Houdt van rust, natuurlijke materialen en tijdloze keuzes."
    );

    db.prepare(`
      INSERT INTO projects (id, client_id, title, status, address, location, project_type, surface, style, lead, delivery,
        vision, summary, goals_json, principles_json, palette_json, budget_lines_json, budget_total)
      VALUES (@id, @client_id, @title, @status, @address, @location, @project_type, @surface, @style, @lead, @delivery,
        @vision, @summary, @goals_json, @principles_json, @palette_json, @budget_lines_json, @budget_total)
    `).run({
      id: projectId,
      client_id: clientId,
      title: PROJECT.title,
      status: PROJECT.status,
      address: PROJECT.address,
      location: PROJECT.location,
      project_type: PROJECT.project_type,
      surface: PROJECT.surface,
      style: PROJECT.style,
      lead: PROJECT.lead,
      delivery: PROJECT.delivery,
      vision: PROJECT.vision,
      summary: PROJECT.summary,
      goals_json: JSON.stringify(PROJECT.goals),
      principles_json: JSON.stringify(PROJECT.principles),
      palette_json: JSON.stringify(PALETTE),
      budget_lines_json: JSON.stringify(PROJECT.budget_lines),
      budget_total: 0
    });

    db.prepare(`
      INSERT INTO intake (project_id, household, wishes, style_preferences, color_preferences, budget_indication, free_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      projectId,
      "Gezin met twee kinderen, ontvangt regelmatig gasten.",
      "Een huis dat representatief én geborgen aanvoelt; behoud van monumentale details.",
      "Warm minimalisme — rustig, tactiel, tijdloos.",
      "Zand, klei, travertijn, off-white; gedempt groen als accent.",
      "Ruim, kwaliteit boven kwantiteit.",
      "Tijdloos boven trendgevoelig; materialen die mooier verouderen."
    );

    const roomIds = {};
    ROOMS.forEach((room, index) => {
      const roomId = id("room");
      roomIds[room.key] = roomId;
      db.prepare(`
        INSERT INTO rooms (id, project_id, name, room_type, floor_level, concept, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(roomId, projectId, room.name, "", room.floor_level, room.concept, index);
    });

    MATERIALS.forEach((material, index) => {
      db.prepare(`
        INSERT INTO materials (id, project_id, name, spec, application, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id("material"), projectId, material.name, material.spec, material.application, index);
    });

    PRODUCTS.forEach((product, index) => {
      const productId = id("product");
      db.prepare(`
        INSERT INTO products (id, name, brand, supplier, category, designer, price, description, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'selected')
      `).run(productId, product.name, product.brand, product.supplier, product.category, product.designer || "", product.price, product.motivation);

      db.prepare(`
        INSERT INTO project_products (id, project_id, room_id, product_id, quantity, sort_order, fit_reason, is_feature)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id("selection"),
        projectId,
        roomIds[product.room],
        productId,
        product.qty || 1,
        index,
        product.motivation,
        product.feature ? 1 : 0
      );
    });

    db.prepare(`
      INSERT INTO proposals (id, project_id, title, intro_text, style_direction, color_advice, closing_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id("proposal"),
      projectId,
      "Ontwerpvoorstel — Herenhuis aan de Keizersgracht",
      PROJECT.vision,
      PROJECT.summary,
      "Een palet uit steen, aarde en linnen — over alle verdiepingen herhaald.",
      "Na akkoord stellen we de definitieve materiaalstaten en planning op, en begeleiden we het traject tot oplevering."
    );
  });
  tx();
  return projectId;
}

module.exports = { seedSampleProject, SAMPLE_TITLE };
