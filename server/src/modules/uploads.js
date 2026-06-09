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

const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });
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

router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Geen bestand ontvangen" });
  res.status(201).json({
    file_path: req.file.path,
    file_name: req.file.originalname,
    url: `/uploads/${path.basename(req.file.path)}`
  });
});

module.exports = { upload, router, uploadDir, removeUpload };
