const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");
const express = require("express");

function firefoxBin() {
  for (const bin of ["firefox", "firefox-esr"]) {
    try {
      return execFileSync("sh", ["-lc", `command -v ${bin}`], { encoding: "utf8" }).trim();
    } catch {
      /* try next */
    }
  }
  return "";
}

function firefoxCanCapture(firefox) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-firefox-probe-"));
  const shot = path.join(tmp, "probe.png");
  try {
    execFileSync(firefox, [
      "--headless",
      "--window-size", "320,200",
      "--screenshot", shot,
      "about:blank"
    ], { stdio: "pipe", timeout: 5000 });
    return fs.existsSync(shot) && fs.statSync(shot).size > 0;
  } catch {
    return false;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function parsePng(file) {
  const png = fs.readFileSync(file);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "screenshot is a PNG");

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "8-bit PNG expected");
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  assert.ok(channels, `supported PNG color type expected, got ${colorType}`);
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = [];
  let pos = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[pos];
    pos += 1;
    const raw = Buffer.from(inflated.subarray(pos, pos + stride));
    pos += stride;
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= channels ? previous[x - channels] || 0 : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else {
        assert.equal(filter, 0, `supported PNG filter expected on row ${y}`);
      }
      row[x] = (raw[x] + predictor) & 0xff;
    }
    rows.push(row);
    previous = row;
  }
  return { width, height, channels, rows };
}

function colorAt(image, x, y) {
  const index = x * image.channels;
  const row = image.rows[y];
  return `${row[index]},${row[index + 1]},${row[index + 2]}`;
}

test("desktop screenshot smoke captures nonblank app shell at 1440x900", async (t) => {
  const firefox = firefoxBin();
  if (!firefox) {
    t.skip("Firefox is not installed; desktop screenshot smoke requires a local Firefox binary");
    return;
  }
  if (!firefoxCanCapture(firefox)) {
    t.skip("Firefox is installed but cannot produce headless screenshots on this host");
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-desktop-shot-"));
  const shot = path.join(tmp, "desktop.png");
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const app = express();
  app.use(express.json());
  app.get("/api/auth/status", (_req, res) => res.json({ hasUsers: false, user: null }));
  app.get("/api/projects", (_req, res) => res.json([{
    id: "desktop-project",
    title: "Desktop Screenshot Suite",
    client_name: "Familie Visueel",
    location: "Amsterdam",
    status: "proposal",
    updated_at: "2026-06-18T09:00:00Z"
  }]));
  app.get("/api/clients", (_req, res) => res.json([{ id: "client_visual", name: "Familie Visueel" }]));
  app.get("/api/products", (_req, res) => res.json([{ id: "product_visual", name: "Linnen fauteuil", category: "Meubilair", price: 1250 }]));
  app.get("/api/notifications/count", (_req, res) => res.json({ unread: 2 }));

  const vite = await (await import("vite")).createServer({
    appType: "spa",
    logLevel: "error",
    server: { middlewareMode: true },
  });
  app.use(vite.middlewares);

  const server = app.listen(0);
  await new Promise((resolve) => (server.listening ? resolve() : server.on("listening", resolve)));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await vite.close();
  });

  const url = `http://127.0.0.1:${server.address().port}/#/projects`;
  execFileSync(firefox, [
    "--headless",
    "--window-size", "1440,900",
    "--screenshot", shot,
    url
  ], { stdio: "pipe", timeout: 30000 });

  const stat = fs.statSync(shot);
  assert.ok(stat.size > 20000, `desktop screenshot should be substantial, got ${stat.size} bytes`);

  const image = parsePng(shot);
  assert.equal(image.width, 1440);
  assert.equal(image.height, 900);

  const sampled = new Set();
  for (let y = 40; y < image.height; y += 80) {
    for (let x = 40; x < image.width; x += 80) {
      sampled.add(colorAt(image, x, y));
    }
  }
  assert.ok(sampled.size >= 10, `desktop screenshot should contain varied UI colors, got ${sampled.size}`);
  assert.notEqual(colorAt(image, 40, 40), colorAt(image, 720, 450), "sidebar and main content should differ visually");
});
