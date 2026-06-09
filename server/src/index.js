const express = require("express");
const cors = require("cors");
const path = require("path");
const { migrate } = require("./db/schema");
const { dbPath } = require("./db/database");
const projects = require("./modules/projects");
const clients = require("./modules/clients");
const intake = require("./modules/intake");
const rooms = require("./modules/rooms");
const floorplans = require("./modules/floorplans");
const moodboards = require("./modules/moodboards");
const products = require("./modules/products");
const proposals = require("./modules/proposals");
const materials = require("./modules/materials");
const uploads = require("./modules/uploads");
const suppliers = require("./modules/suppliers");
const colorLibrary = require("./modules/colorLibrary");
const materialLibrary = require("./modules/materialLibrary");
const designLibrary = require("./modules/designLibrary");
const knowledge = require("./modules/knowledge");
const budget = require("./modules/budget");
const media = require("./modules/media");
const render = require("./modules/render");
const planning = require("./modules/planning");
const ai = require("./modules/ai");
const auth = require("./modules/auth");
const portal = require("./modules/portal");
const audit = require("./modules/audit");
const { errorBody, zodDetails, isZodError } = require("./modules/validate");

migrate();

const app = express();
const port = Number(process.env.PORT || 4000);
const exportDir = process.env.NOVA_EXPORT_DIR || path.join(process.cwd(), "data", "exports");

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(uploads.uploadDir));
app.use("/exports", express.static(exportDir));
app.use(express.static(path.join(process.cwd(), "dist")));

// Optional, non-blocking session auth (single-user local mode keeps working).
app.use(auth.sessionMiddleware);
// Attribute audit entries to the acting user for the duration of the request.
app.use((req, _res, next) => audit.runWithUser(req.user && req.user.id, next));
// Enforce auth once users exist; open in single-user mode. Whitelists health,
// the auth endpoints, and the public client-portal view.
app.use("/api", auth.apiGate);

app.get("/api/health", (_req, res) => res.json({ ok: true, dbPath }));
app.use("/api/auth", auth.router);
app.use("/api/clients", clients);
app.use("/api/projects", projects);
app.use("/api/intake", intake);
app.use("/api/rooms", rooms);
app.use("/api/floorplans", floorplans);
app.use("/api/moodboards", moodboards);
app.use("/api/products", products);
app.use("/api/proposals", proposals);
app.use("/api/materials", materials);
app.use("/api/suppliers", suppliers);
app.use("/api/colors", colorLibrary);
app.use("/api/material-library", materialLibrary);
app.use("/api/design-library", designLibrary);
app.use("/api/knowledge", knowledge);
app.use("/api/budget", budget);
app.use("/api/media", media.router);
app.use("/api/render", render);
app.use("/api/planning", planning);
app.use("/api/ai", ai);
app.use("/api/portal", portal);
app.use("/api/audit", audit.router);
app.use("/api/uploads", uploads.router);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API-route niet gevonden" });
});

app.use((_req, res, next) => {
  const indexPath = path.join(process.cwd(), "dist", "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

app.use((err, _req, res, _next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json(errorBody("Bestand is te groot (max. 25 MB)"));
  }
  if (isZodError(err)) {
    return res.status(400).json(errorBody("Validatiefout", zodDetails(err)));
  }
  const status = Number(err && err.status) || 500;
  res.status(status).json(errorBody(err && err.message ? err.message : "Serverfout"));
});

app.listen(port, () => {
  console.log(`Nova Studio API draait op http://localhost:${port}`);
});
