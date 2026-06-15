import { spawnSync } from "node:child_process";

const result = spawnSync("pdftoppm", ["-v"], { encoding: "utf8" });

if (result.error && result.error.code === "ENOENT") {
  console.error("Missing PDF renderer: install Poppler so `pdftoppm` is available on PATH.");
  console.error("Debian/Ubuntu: apt-get install poppler-utils");
  console.error("macOS: brew install poppler");
  process.exit(1);
}

if (result.status !== 0 && !String(result.stderr || result.stdout || "").includes("pdftoppm")) {
  console.error("PDF renderer check failed: `pdftoppm -v` did not complete successfully.");
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(result.status || 1);
}

console.log("PDF renderer available: pdftoppm");
