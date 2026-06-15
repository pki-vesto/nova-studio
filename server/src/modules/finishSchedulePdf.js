// Finish schedule ("Afwerkstaat") bundle + A4 PDF renderer for issue #22 /
// PRODUCT_BACKLOG items 238–239. Keeps the room-scoped specification logic out
// of the rooms router so the PDF surface is grep-able as its own module
// alongside proposals.js / floorplans.js, and so the writeSection / renderTable
// helpers can be reused without dragging in the proposal-export-only code.
const fs = require("fs");
const PDFDocument = require("pdfkit");
const { db } = require("../db/database");

function slug(value) {
  return String(value || "afwerkstaat")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "afwerkstaat";
}

function finishScheduleBundle(roomId) {
  const room = db.prepare(`
    SELECT r.*, p.title AS project_title, p.address AS project_address, p.location AS project_location
    FROM rooms r
    JOIN projects p ON p.id = r.project_id
    WHERE r.id = ?
  `).get(roomId);
  if (!room) return null;
  const colors = db.prepare(`
    SELECT rc.*,
      COALESCE(NULLIF(rc.name, ''), cl.name, '') AS resolved_name,
      COALESCE(NULLIF(NULLIF(rc.hex, ''), '#cccccc'), cl.hex, rc.hex, '') AS resolved_hex,
      cl.name AS library_name,
      cl.hex AS library_hex,
      cl.brand AS library_brand,
      cl.code AS library_code,
      cl.finish AS library_finish
    FROM room_colors rc
    LEFT JOIN color_library cl ON cl.id = rc.color_id
    WHERE rc.room_id = ?
    ORDER BY rc.created_at, rc.name
  `).all(roomId);
  // Contractor-facing sheet: select specification columns only, never purchase
  // price / margin / sale price. Keeps internal numbers off the printed output.
  const materials = db.prepare(`
    SELECT id, project_id, name, spec, application, brand, code, maintenance, sustainability_score, sample_status, supplier_id, library_id
    FROM materials
    WHERE project_id = ?
    ORDER BY sort_order, name
  `).all(room.project_id);
  return {
    room,
    project: {
      id: room.project_id,
      title: room.project_title || "",
      address: room.project_address || "",
      location: room.project_location || ""
    },
    notes: {
      designer_notes: room.designer_notes || "",
      color_notes: room.color_notes || "",
      concept: room.concept || ""
    },
    colors,
    materials
  };
}

function writeSection(doc, title) {
  doc.moveDown(1.1).font("Helvetica-Bold").fontSize(15).fillColor("#2d2926").text(title);
  doc.moveTo(54, doc.y + 6).lineTo(558, doc.y + 6).strokeColor("#d8cec2").stroke();
  doc.moveDown(0.8).font("Helvetica").fontSize(10).fillColor("#2d2926");
}

function renderTable(doc, columns, rows, emptyText) {
  if (!rows.length) {
    doc.font("Helvetica").fontSize(10).fillColor("#6f655c").text(emptyText);
    return;
  }
  const startX = 54;
  const drawHeader = () => {
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#6f655c");
    columns.forEach((col) => {
      doc.text(col.label, x, doc.y, { width: col.width, lineBreak: false });
      x += col.width;
    });
    doc.moveDown(0.3);
    doc.moveTo(startX, doc.y).lineTo(558, doc.y).strokeColor("#d8cec2").stroke();
    doc.moveDown(0.2);
  };
  drawHeader();
  doc.font("Helvetica").fontSize(9).fillColor("#2d2926");
  rows.forEach((cells) => {
    if (doc.y > 760) {
      doc.addPage();
      drawHeader();
      doc.font("Helvetica").fontSize(9).fillColor("#2d2926");
    }
    const rowY = doc.y;
    let x = startX;
    columns.forEach((col, index) => {
      doc.text(String(cells[index] || ""), x, rowY, { width: col.width, lineBreak: false });
      x += col.width;
    });
    doc.y = rowY + 18;
  });
}

function renderFinishSchedulePdf(bundle, outputPath) {
  return new Promise((resolve, reject) => {
    const title = `Afwerkstaat - ${bundle.room.name}`;
    const doc = new PDFDocument({ size: "A4", margin: 54, compress: false, info: { Title: title } });
    const stream = fs.createWriteStream(outputPath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.pipe(stream);

    doc.font("Helvetica-Bold").fontSize(28).fillColor("#2d2926").text("Afwerkstaat", 54, 72);
    doc.font("Helvetica").fontSize(12).fillColor("#6f655c")
      .text([bundle.project.title, bundle.room.name].filter(Boolean).join(" | "), 54, 112);
    doc.fontSize(10).fillColor("#a47755")
      .text([bundle.room.floor_level, bundle.room.room_type, bundle.room.dimensions].filter(Boolean).join(" | "), 54, 134);

    writeSection(doc, "Kleuren");
    renderTable(doc, [
      { label: "Toepassing", width: 134 },
      { label: "Naam", width: 160 },
      { label: "Hex/code", width: 104 },
      { label: "Finish", width: 106 }
    ], bundle.colors.map((color) => [
      color.application || "",
      color.resolved_name || color.library_name || "",
      [color.resolved_hex || color.library_hex || "", color.library_code || ""].filter(Boolean).join(" / "),
      color.library_finish || ""
    ]), "Geen kleuren vastgelegd.");

    writeSection(doc, "Materialen");
    renderTable(doc, [
      { label: "Materiaal", width: 144 },
      { label: "Specificatie", width: 154 },
      { label: "Toepassing", width: 116 },
      { label: "Onderhoud", width: 90 }
    ], bundle.materials.map((material) => [
      [material.name, material.brand, material.code].filter(Boolean).join(" - "),
      material.spec || "",
      material.application || "",
      material.maintenance || ""
    ]), "Geen materialen vastgelegd.");

    writeSection(doc, "Notities");
    const notes = [
      ["Concept", bundle.notes.concept],
      ["Kleurnotities", bundle.notes.color_notes],
      ["Ontwerpnotities", bundle.notes.designer_notes]
    ].filter(([, value]) => value && String(value).trim());
    if (!notes.length) {
      doc.font("Helvetica").fontSize(10).fillColor("#6f655c").text("Geen notities vastgelegd.");
    } else {
      notes.forEach(([label, value]) => {
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#2d2926").text(`${label}: `, { continued: true })
          .font("Helvetica").text(value, { lineGap: 4 });
      });
    }

    doc.end();
  });
}

function finishScheduleFileName(bundle) {
  return `${slug(bundle.project.title)}-${slug(bundle.room.name)}-afwerkstaat.pdf`;
}

module.exports = {
  finishScheduleBundle,
  renderFinishSchedulePdf,
  finishScheduleFileName,
  slug
};
