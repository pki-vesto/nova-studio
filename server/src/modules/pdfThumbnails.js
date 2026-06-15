const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { id } = require("./utils");

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function looksLikePdf(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(5);
    fs.readSync(fd, buf, 0, 5, 0);
    fs.closeSync(fd);
    return buf.toString("utf8") === "%PDF-";
  } catch {
    return false;
  }
}

function writeFallbackThumb(uploadDir, label) {
  const thumbPath = path.join(uploadDir, `${id("thumb")}.svg`);
  const title = escapeXml(label || "PDF plattegrond");
  fs.writeFileSync(thumbPath, `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="620" viewBox="0 0 900 620" role="img" aria-label="${title}">
  <rect width="900" height="620" fill="#f6f1ea"/>
  <rect x="70" y="52" width="760" height="516" rx="18" fill="#fffdf9" stroke="#d9cbbd" stroke-width="2"/>
  <rect x="128" y="126" width="330" height="18" rx="9" fill="#c8b7a6"/>
  <rect x="128" y="170" width="520" height="12" rx="6" fill="#e3d8cc"/>
  <rect x="128" y="202" width="438" height="12" rx="6" fill="#e3d8cc"/>
  <path d="M170 402h176v-92h144v-82h196v174H170z" fill="none" stroke="#2d2926" stroke-width="10" stroke-linejoin="round"/>
  <path d="M346 310v92M490 228v174" fill="none" stroke="#a47755" stroke-width="7" stroke-linecap="round"/>
  <text x="128" y="486" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#2d2926">${title}</text>
  <text x="128" y="526" font-family="Arial, sans-serif" font-size="20" fill="#7c6b5b">PDF preview</text>
</svg>
`);
  return thumbPath;
}

function createPdfThumbnail(filePath, originalName, uploadDir) {
  if (!filePath || !/\.pdf$/i.test(originalName || filePath)) return "";

  const basePath = path.join(uploadDir, id("thumb"));
  const pngPath = `${basePath}.png`;
  if (looksLikePdf(filePath)) {
    try {
      execFileSync("pdftoppm", ["-f", "1", "-l", "1", "-singlefile", "-png", "-scale-to", "900", filePath, basePath], {
        stdio: "ignore",
        timeout: 10000
      });
      if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) return pngPath;
    } catch {
      fs.rmSync(pngPath, { force: true });
    }
  }

  return writeFallbackThumb(uploadDir, originalName || path.basename(filePath));
}

module.exports = { createPdfThumbnail, looksLikePdf };
