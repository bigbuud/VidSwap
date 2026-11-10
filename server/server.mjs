// VidSwap server - geen dependencies, alleen Node.js
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8080);
const VIDEO_DIR = path.resolve(process.env.VIDEO_DIR || "/videos");
// TRASH_DIR / FAV_DIR mogen absoluut zijn of relatief ten opzichte van VIDEO_DIR
const resolveDir = (v, fallback) => path.resolve(VIDEO_DIR, v || fallback);
const TRASH_DIR = resolveDir(process.env.TRASH_DIR, "_prullenbak");
const FAV_DIR = resolveDir(process.env.FAV_DIR, "_favorieten");
const KEEP_DIR = resolveDir(process.env.KEEP_DIR, "_behouden");
const STATE_FILE = process.env.STATE_FILE || path.join(VIDEO_DIR, ".vidswap-kept.json");
const EXT = new Set([".mp4", ".webm", ".mov", ".m4v", ".mkv", ".ogv"]);
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const STATIC = { ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".js": "text/javascript; charset=utf-8", ".html": "text/html; charset=utf-8" };
const MIME = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mkv": "video/x-matroska", ".ogv": "video/ogg" };

await fsp.mkdir(TRASH_DIR, { recursive: true });
await fsp.mkdir(FAV_DIR, { recursive: true });
await fsp.mkdir(KEEP_DIR, { recursive: true });

// Migratie: statusbestand uit de tijd dat de app nog VideoSwipe heette
const OLD_STATE = path.join(VIDEO_DIR, ".videoswipe-kept.json");
if (!process.env.STATE_FILE && !fs.existsSync(STATE_FILE) && fs.existsSync(OLD_STATE)) await fsp.rename(OLD_STATE, STATE_FILE);

// Migratie: vroeger werd "behouden" alleen in een JSON-lijst onthouden. Die bestanden gaan nu eenmalig naar KEEP_DIR.
if (fs.existsSync(STATE_FILE)) {
  let moved = 0;
  try {
    for (const rel of JSON.parse(await fsp.readFile(STATE_FILE, "utf8"))) {
      try { const full = safe(rel); if (fs.existsSync(full)) { await move(full, KEEP_DIR); moved++; } } catch (e) { console.warn("Migratie overgeslagen:", rel, e.message); }
    }
    await fsp.rename(STATE_FILE, STATE_FILE + ".migrated");
    console.log(`Migratie: ${moved} behouden video('s) verplaatst naar ${KEEP_DIR}`);
  } catch (e) { console.warn("Migratie van", STATE_FILE, "mislukt:", e.message); }
}

const excluded = [TRASH_DIR, FAV_DIR, KEEP_DIR];
async function scan(dir, out = []) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.name.startsWith(".") || e.name.startsWith("@")) continue; // o.a. @eaDir van Synology
    if (e.isDirectory()) { if (!excluded.includes(full)) await scan(full, out); }
    else if (EXT.has(path.extname(e.name).toLowerCase())) out.push(path.relative(VIDEO_DIR, full));
  }
  return out;
}

function safe(rel) {
  const full = path.resolve(VIDEO_DIR, rel);
  if (!full.startsWith(VIDEO_DIR + path.sep)) throw new Error("ongeldig pad");
  return full;
}

async function move(src, destDir) {
  let dest = path.join(destDir, path.basename(src));
  if (fs.existsSync(dest)) { const p = path.parse(dest); dest = path.join(destDir, `${p.name}-${Date.now()}${p.ext}`); }
  try { await fsp.rename(src, dest); }
  catch (e) { if (e.code !== "EXDEV") throw e; await fsp.copyFile(src, dest); await fsp.unlink(src); }
}

const fail = (status, message) => Object.assign(new Error(message), { status });

// Nieuwe bestandsnaam (zonder extensie) valideren; de extensie van het origineel blijft behouden
async function rename(full, newName) {
  const ext = path.extname(full);
  let name = String(newName ?? "").trim();
  if (name.toLowerCase().endsWith(ext.toLowerCase())) name = name.slice(0, -ext.length).trim();
  if (!name) throw fail(400, "Naam mag niet leeg zijn");
  if (name.length > 200) throw fail(400, "Naam is te lang");
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name)) throw fail(400, 'Naam mag geen \\ / : * ? " < > | bevatten');
  if (name.startsWith(".") || name.startsWith("@")) throw fail(400, "Naam mag niet met . of @ beginnen");
  const dest = path.join(path.dirname(full), name + ext);
  if (dest === full) return full;
  if (fs.existsSync(dest)) throw fail(409, "Er bestaat al een bestand met die naam");
  await fsp.rename(full, dest);
  return dest;
}

const json = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch { r({}); } }); });

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/videos") {
      const list = await scan(VIDEO_DIR);
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
      return json(res, 200, list);
    }
    if (url.pathname === "/api/action" && req.method === "POST") {
      const { file, action, newName } = await readBody(req);
      const full = safe(file);
      if (!fs.existsSync(full)) throw fail(404, "Bestand bestaat niet (meer)");
      if (action === "rename") {
        const dest = await rename(full, newName);
        return json(res, 200, { ok: true, file: path.relative(VIDEO_DIR, dest) });
      }
      if (action === "trash") await move(full, TRASH_DIR);
      else if (action === "favorite") await move(full, FAV_DIR);
      else if (action === "keep") await move(full, KEEP_DIR);
      else throw fail(400, "Onbekende actie");
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/video") {
      const full = safe(url.searchParams.get("f") || "");
      const { size } = await fsp.stat(full);
      const type = MIME[path.extname(full).toLowerCase()] || "application/octet-stream";
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
      if (m && (m[1] || m[2])) {
        // "bytes=-500" = laatste 500 bytes; einde wordt afgekapt op bestandsgrootte
        const start = m[1] ? Number(m[1]) : Math.max(size - Number(m[2]), 0);
        const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        if (start > end || start >= size) { res.writeHead(416, { "content-range": `bytes */${size}` }); return res.end(); }
        res.writeHead(206, { "content-type": type, "accept-ranges": "bytes", "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${size}` });
        return fs.createReadStream(full, { start, end }).pipe(res);
      }
      res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": size });
      return fs.createReadStream(full).pipe(res);
    }
    if (url.pathname === "/healthz") return json(res, 200, { ok: true });
    // Statische bestanden uit public/ (logo, icons, manifest); alles anders = de app zelf
    const asset = path.join(PUBLIC, path.normalize(decodeURIComponent(url.pathname)));
    const ext = path.extname(asset).toLowerCase();
    if (url.pathname !== "/" && asset.startsWith(PUBLIC + path.sep) && STATIC[ext] && fs.existsSync(asset)) {
      res.writeHead(200, { "content-type": STATIC[ext], "cache-control": ext === ".js" ? "no-cache" : "public, max-age=86400" });
      return fs.createReadStream(asset).pipe(res);
    }
    const html = await fsp.readFile(path.join(PUBLIC, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (e) {
    json(res, e.status || (e.code === "ENOENT" ? 404 : 500), { error: String(e.message || e) });
  }
}).listen(PORT, () => console.log(`VidSwap op poort ${PORT}\n  video's:      ${VIDEO_DIR}\n  prullenbak:  ${TRASH_DIR}\n  favorieten:  ${FAV_DIR}\n  behouden:    ${KEEP_DIR}`));
