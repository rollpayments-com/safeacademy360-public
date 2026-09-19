#!/usr/bin/env node
/**
 * Open Graph images, 1200x630, one per page, emblem on ink with the page's crumb or title.
 * macOS only: renders HTML with a small WebKit snapshot tool (scripts/tools/snapshot, built from snapshot.swift).
 *   node scripts/og.mjs
 * Output: src/assets/img/og/<slug>.png. Re-run whenever titles change.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = path.join(ROOT, "src", "pages");
const FONTS = path.join(ROOT, "src", "assets", "fonts");
const OUT = path.join(ROOT, "src", "assets", "img", "og");
const emblem = await fs.readFile(path.join(ROOT, "src", "partials", "emblem.html"), "utf8");
const logoPaths = (await fs.readFile(path.join(PAGES, "index.html"), "utf8")).match(/<svg class="hero-logo"[\s\S]*?<\/svg>/)[0]
  .replace(/<svg[^>]*>/, "").replace("</svg>", "").replace(/class="accent" /, "");

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const tmp = path.join(ROOT, "src", "assets", ".og-tmp");
await fs.rm(tmp, { recursive: true, force: true });
await fs.mkdir(tmp, { recursive: true });
await fs.mkdir(OUT, { recursive: true });

for (const f of (await fs.readdir(PAGES)).filter((f) => f.endsWith(".html")).sort()) {
  const raw = await fs.readFile(path.join(PAGES, f), "utf8");
  const fm = raw.match(/^\s*<!--([\s\S]*?)-->/)[1];
  const get = (k) => (fm.match(new RegExp(`^\\s*${k}\\s*:\\s*(.*)$`, "m")) || [])[1]?.trim();
  if (get("noindex")) continue;
  const slug = f.replace(/\.html$/, "");
  const isHome = slug === "index";
  const heading = isHome ? "Protect the academy from every direction." : (get("crumb") || get("title").split("|")[0].trim());
  const sub = isHome ? "Coach certification and registration screening for martial arts academies" : "Safe Academy 360";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Barlow Condensed";font-weight:700;src:url("file://${FONTS}/BarlowCondensed-700.woff2") format("woff2")}
@font-face{font-family:"Barlow Condensed";font-weight:600;src:url("file://${FONTS}/BarlowCondensed-600.woff2") format("woff2")}
html,body{margin:0;width:1200px;height:630px;background:#0A0A0B;overflow:hidden;font-family:"Barlow Condensed",sans-serif}
.card{position:relative;width:1200px;height:630px;background:#000;overflow:hidden}
.weave{position:absolute;inset:0;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.028) 0 1px,transparent 1px 7px),repeating-linear-gradient(0deg,rgba(255,255,255,.016) 0 1px,transparent 1px 3px)}
svg{position:absolute;right:80px;top:65px;width:428px;height:500px;color:#fff}
h1{position:absolute;left:80px;top:${isHome ? 150 : 200}px;width:600px;margin:0;color:#fff;font-weight:700;font-size:${isHome ? 92 : 96}px;line-height:.98;letter-spacing:-.005em}
p{position:absolute;left:80px;top:${isHome ? 435 : 340}px;width:600px;margin:0;color:#A1A1A6;font-weight:600;font-size:36px;line-height:1.2}
.url{position:absolute;left:80px;bottom:56px;color:#E8E8EA;font-weight:600;font-size:30px;letter-spacing:.02em}
.bar{position:absolute;left:0;right:0;bottom:0;height:8px;background:#DC2626}
</style></head><body><div class="card"><div class="weave"></div>
<svg viewBox="0 0 984 1151">${logoPaths}</svg>
<h1>${esc(heading)}</h1><p>${esc(sub)}</p><div class="url">safeacademy360.com</div><div class="bar"></div></div></body></html>`;
  const src = path.join(tmp, `${slug}.html`);
  await fs.writeFile(src, html);
  const out = path.join(OUT, `${slug}.png`);
  execFileSync(path.join(ROOT, "scripts", "tools", "snapshot"), [src, out, "1200", "630"], { stdio: "inherit" });
  // The snapshot comes back at the display's pixel ratio; bring it to exactly 1200 by 630.
  execFileSync("sips", ["-z", "630", "1200", out], { stdio: "ignore" });
  const bytes = (await fs.stat(out)).size;
  console.log(`${slug}.png ${(bytes / 1024).toFixed(0)} KB  "${heading}"`);
}
await fs.rm(tmp, { recursive: true, force: true });
