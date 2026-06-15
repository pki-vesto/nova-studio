const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { id } = require("./utils");

const uploadDir = process.env.NOVA_UPLOAD_DIR || path.join(process.cwd(), "server", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${id("file")}${ext}`);
  }
});

function isSafeOriginalName(name) {
  if (!name || typeof name !== "string") return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(name)) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  return path.basename(name) === name;
}

function fileFilter(_req, file, cb) {
  if (isSafeOriginalName(file.originalname)) return cb(null, true);
  const err = new Error("Ongeldige bestandsnaam");
  err.status = 400;
  return cb(err);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 25 * 1024 * 1024 } });
const router = express.Router();

// Best-effort removal of an uploaded file. Confined to uploadDir via basename
// so a stored path can never delete anything outside the uploads folder.
function removeUpload(filePath) {
  if (!filePath) return;
  try {
    fs.rmSync(path.join(uploadDir, path.basename(filePath)), { force: true });
  } catch {
    /* best-effort cleanup */
  }
}

function rejectClientTarget(req, res, next) {
  const forbiddenFields = ["url", "upload_url", "file_path", "path", "target", "destination"];
  const supplied = forbiddenFields.find((field) => req.body && req.body[field] !== undefined);
  if (!supplied) return next();
  removeUpload(req.file && req.file.path);
  return res.status(400).json({ error: "Ongeldige uploadbestemming" });
}

router.post("/", upload.single("file"), rejectClientTarget, (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Geen bestand ontvangen" });
  res.status(201).json({
    file_path: req.file.path,
    file_name: req.file.originalname,
    url: `/uploads/${path.basename(req.file.path)}`
  });
});

module.exports = { upload, router, uploadDir, removeUpload };
