#!/usr/bin/env node
/**
 * Safe Academy 360 site builder. Zero dependencies.
 *
 *   node scripts/build.mjs            build src/ into dist/
 *   node scripts/build.mjs --watch    rebuild when src/ or data/ change
 *   node scripts/build.mjs --serve    serve dist/ on http://localhost:4173
 *   node scripts/build.mjs --check    build, then exit non zero on any warning
 *
 * Pages live in src/pages as content-only HTML with a leading front matter
 * comment. Partials live in src/partials and are pulled in with {{> name}}.
 * Variables render with {{name}} (escaped) or {{{name}}} (raw). Blocks render
 * with {{#if name}}...{{/if}}. Clean URLs: src/pages/pricing.html becomes
 * dist/pricing/index.html.
 */
import fs from "node:fs/promises";
import { existsSync, watch } from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const DATA = path.join(ROOT, "data");
const SITE = {
  name: "Safe Academy 360",
  url: "https://safeacademy360.com",
  operator: "Roll Payments LLC",
  email: "support@rollpay.co",
  phone: "(800) 409 0555",
  year: String(new Date().getFullYear()),
  // Google Search Console HTML tag token, if verifying by meta tag rather than DNS. Set GSC_VERIFICATION in the Vercel project.
  verification: process.env.GSC_VERIFICATION || "",
};
// Last commit date of a source file, for sitemap lastmod. Falls back to today for uncommitted files.
function lastMod(file) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", file], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (out) return out;
  } catch {}
  return new Date().toISOString().slice(0, 10);
}
const ALL_CSS = ["tokens.css", "base.css", "layout.css", "components.css", "pages.css"];
const args = new Set(process.argv.slice(2));

// ---------- tiny template engine ----------
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function loadPartials() {
  const dir = path.join(SRC, "partials");
  const out = {};
  for (const f of await fs.readdir(dir)) {
    if (f.endsWith(".html")) out[f.replace(/\.html$/, "")] = await fs.readFile(path.join(dir, f), "utf8");
  }
  return out;
}

function render(tpl, ctx, partials, depth = 0) {
  if (depth > 12) throw new Error("Partial recursion too deep");
  // blocks first, so partials inside a false block are never expanded
  tpl = tpl.replace(/\{\{#if (\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_, k, a, b = "") =>
    ctx[k] ? render(a, ctx, partials, depth + 1) : render(b, ctx, partials, depth + 1),
  );
  tpl = tpl.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) => {
    if (!(name in partials)) throw new Error(`Unknown partial: ${name}`);
    return render(partials[name], ctx, partials, depth + 1);
  });
  tpl = tpl.replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => (ctx[k] == null ? "" : String(ctx[k])));
  tpl = tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (ctx[k] == null ? "" : escapeHtml(ctx[k])));
  return tpl;
}

function parseFrontMatter(raw, file) {
  const m = raw.match(/^\s*<!--\s*([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`${file}: missing front matter comment`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
    if (mm) meta[mm[1]] = mm[2] === "true" ? true : mm[2] === "false" ? false : mm[2];
  }
  return { meta, body: raw.slice(m[0].length) };
}

// ---------- css ----------
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}
async function readCss(files) {
  let out = "";
  for (const f of files) out += (await fs.readFile(path.join(SRC, "styles", f), "utf8")) + "\n";
  return out;
}

// ---------- per page CSS pruning ----------
// Every page inlines only the rules it can use. A rule with class selectors is kept when at
// least one of its classes appears in the page's HTML or in a script that may add it.
function splitRules(css) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; } }
  }
  return out;
}
function pruneCss(css, classesInUse) {
  const keepRule = (rule) => {
    const sel = rule.slice(0, rule.indexOf("{"));
    const classes = sel.match(/\.[a-zA-Z_][\w-]*/g);
    if (!classes) return true; // element, attribute, and pseudo selectors stay
    return classes.some((c) => { const n = c.slice(1); const i = n.indexOf("-"); return classesInUse.has(n) || (i > 0 && classesInUse.has(n.slice(0, i) + "-*") && /^(is|has|verify|dir|shield|calc|form|field|hero|square|check|nav|masthead|footer|cta|price|doc|steps|qa|resource|faq|index|sequence|ledger|page|wrap|section|tape|weave|btn|link|stepper|two|not|statement|utility|brand|skip|visually|lede|muted|tnum|display|hairline|actions|estimate|honey)$/.test(n.slice(0, i))); });
  };
  return splitRules(css).map((rule) => {
    if (rule.startsWith("@media") || rule.startsWith("@supports")) {
      const open = rule.indexOf("{");
      const inner = rule.slice(open + 1, -1);
      const kept = splitRules(inner).filter(keepRule).join("");
      return kept ? rule.slice(0, open + 1) + kept + "}" : "";
    }
    if (rule.startsWith("@")) return rule; // font-face, keyframes
    return keepRule(rule) ? rule : "";
  }).join("");
}
async function scriptClasses(files) {
  const dir = path.join(SRC, "scripts");
  const set = new Set();
  for (const f of files) {
    if (!existsSync(path.join(dir, f))) continue;
    const js = await fs.readFile(path.join(dir, f), "utf8");
    for (const m of js.matchAll(/class=\\?"([^"\\]+)/g)) m[1].split(/\s+/).forEach((c) => set.add(c));
    for (const m of js.matchAll(/classList\.(?:add|toggle|remove)\("([\w-]+)"/g)) set.add(m[1]);
    for (const m of js.matchAll(/["'`](is-[\w-]+|has-[\w-]+)["'`]/g)) set.add(m[1]);
  }
  return set;
}
function htmlClasses(html) {
  const set = new Set();
  for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => set.add(c));
  return set;
}

// ---------- html post processing ----------
const stripComments = (html) => html.replace(/<!--(?!\[if)[\s\S]*?-->/g, "");
const collapseBlankLines = (html) => html.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");

// ---------- data ----------
async function loadAcademies(warnings) {
  const file = path.join(DATA, "academies.json");
  if (!existsSync(file)) return [];
  let rows;
  try { rows = JSON.parse(await fs.readFile(file, "utf8")); } catch (e) { warnings.push(`data/academies.json is not valid JSON: ${e.message}`); return []; }
  if (!Array.isArray(rows)) { warnings.push("data/academies.json must be an array"); return []; }
  const seen = new Set();
  const ok = [];
  rows.forEach((r, i) => {
    const where = `academies.json row ${i + 1}`;
    if (!/^SAI-\d{4}-\d{5}$/.test(r.certificate || "")) warnings.push(`${where}: bad certificate number "${r.certificate}"`);
    if (seen.has(r.certificate)) warnings.push(`${where}: duplicate certificate ${r.certificate}`);
    seen.add(r.certificate);
    for (const k of ["name", "city", "state", "certified", "renewalDue", "status"]) if (!r[k]) warnings.push(`${where}: missing ${k}`);
    if (!/^[A-Z]{2}$/.test(r.state || "")) warnings.push(`${where}: state must be a two letter code`);
    if (!["current", "lapsed"].includes(r.status)) warnings.push(`${where}: status must be current or lapsed`);
    for (const k of ["certified", "renewalDue"]) if (r[k] && Number.isNaN(Date.parse(r[k]))) warnings.push(`${where}: ${k} is not a date`);
    for (const k of Object.keys(r)) if (!["certificate", "name", "city", "state", "certified", "renewalDue", "status", "website", "fixture"].includes(k)) warnings.push(`${where}: unexpected field ${k}. Academy level data only.`);
    if (r.fixture && !args.has("--fixtures")) return;
    const { fixture, ...pub } = r;
    ok.push(pub);
  });
  if (rows.some((r) => r.fixture) && args.has("--fixtures")) console.log("note: fixture rows included in dist/data (dev only)");
  return ok;
}

// ---------- build ----------
async function copyDir(from, to) {
  if (!existsSync(from)) return;
  await fs.mkdir(to, { recursive: true });
  for (const e of await fs.readdir(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.name === ".DS_Store") continue;
    if (e.isDirectory()) await copyDir(a, b);
    else await fs.copyFile(a, b);
  }
}

async function build() {
  const t0 = Date.now();
  const warnings = [];
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  const partials = await loadPartials();
  const allCss = minifyCss(await readCss(ALL_CSS));
  const jsClassCache = new Map();
  const jsClassesFor = async (meta) => {
    const files = ["nav.js", ...[...String(meta.scripts || "").matchAll(/\/assets\/js\/([\w-]+\.js)/g)].map((m) => m[1])];
    const key = files.join(",");
    if (!jsClassCache.has(key)) jsClassCache.set(key, await scriptClasses(files));
    return jsClassCache.get(key);
  };

  await copyDir(path.join(SRC, "assets"), path.join(DIST, "assets"));
  await copyDir(path.join(SRC, "scripts"), path.join(DIST, "assets", "js"));
  // Directory data: validate against the schema's essentials, drop fixture rows unless --fixtures.
  const academies = await loadAcademies(warnings);
  await fs.mkdir(path.join(DIST, "data"), { recursive: true });
  await fs.writeFile(path.join(DIST, "data", "academies.json"), JSON.stringify(academies));

  // TODO(owner) markers in source are reported so OPEN_ITEMS.md can be kept in sync.
  // They never reach dist because comments are stripped.
  const todos = [];

  const pagesDir = path.join(SRC, "pages");
  const pages = [];
  for (const f of (await fs.readdir(pagesDir)).filter((f) => f.endsWith(".html")).sort()) {
    const raw = await fs.readFile(path.join(pagesDir, f), "utf8");
    for (const m of raw.matchAll(/TODO\(owner\):\s*([^\n]*?)\s*-->/g)) todos.push(`${f}: ${m[1]}`);
    const { meta, body } = parseFrontMatter(raw, f);
    const slug = f.replace(/\.html$/, "");
    const route = meta.path || (slug === "index" ? "/" : `/${slug}/`);
    const ogFile = path.join(SRC, "assets", "img", "og", `${slug}.png`);
    const ctx = {
      ...SITE,
      ...meta,
      route,
      canonical: SITE.url + route,
      layout: meta.layout || "ink",
      ogImage: existsSync(ogFile) ? `${SITE.url}/assets/img/og/${slug}.png` : "",
      criticalCss: "",
      content: body,
      isHome: route === "/",
    };
    // Render once without CSS to learn which classes the page uses, then inline the pruned sheet.
    const probe = render(partials.shell, ctx, partials);
    const inUse = new Set([...htmlClasses(probe), ...(await jsClassesFor(meta))]);
    // Scripts render state classes with dynamic suffixes; keep any class that shares a prefix with one they use.
    for (const c of [...inUse]) { const i = c.indexOf("-"); if (i > 0) inUse.add(c.slice(0, i) + "-*"); }
    ctx.criticalCss = pruneCss(allCss, inUse);
    if (route === "/") {
      ctx.jsonld = (ctx.jsonld || "") + `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: SITE.url + "/", inLanguage: "en-US",
        publisher: { "@type": "Organization", name: "Roll Payments LLC", url: "https://rollpayments.com" },
      })}</script>`;
    }
    if (route === "/directory/") {
      ctx.jsonld = (ctx.jsonld || "") + `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org", "@type": "ItemList", name: "Safe Academy 360 certified academies",
        numberOfItems: academies.length,
        itemListElement: academies.map((a, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "SportsActivityLocation", name: a.name, address: { "@type": "PostalAddress", addressLocality: a.city, addressRegion: a.state, addressCountry: "US" }, ...(a.website ? { url: a.website } : {}) } })),
      })}</script>`;
    }
    // BreadcrumbList on every interior page, from the front matter crumb or the h1 fallback.
    if (route !== "/" && !meta.noindex) {
      const crumb = meta.crumb || (meta.title || "").split("|")[0].trim();
      ctx.jsonld = (ctx.jsonld || "") + `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE.url + "/" },
          { "@type": "ListItem", position: 2, name: crumb, item: SITE.url + route },
        ],
      })}</script>`;
    }
    let html = render(partials.shell, ctx, partials);
    html = collapseBlankLines(stripComments(html));
    const outDir = route === "/" ? DIST : path.join(DIST, route.replace(/^\/|\/$/g, ""));
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "index.html"), html);
    pages.push({ file: f, route, meta, html, bytes: Buffer.byteLength(html), lastmod: lastMod(path.join("src", "pages", f)) });
  }

  // sitemap + robots
  const indexable = pages.filter((p) => !p.meta.noindex && !p.meta.draft);
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    indexable.map((p) => `  <url><loc>${SITE.url}${p.route}</loc><lastmod>${p.lastmod}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`;
  await fs.writeFile(path.join(DIST, "sitemap.xml"), sitemap);
  await fs.writeFile(
    path.join(DIST, "robots.txt"),
    `User-agent: *\nAllow: /\n${pages.filter((p) => p.meta.noindex).map((p) => `Disallow: ${p.route}`).join("\n")}\n\nSitemap: ${SITE.url}/sitemap.xml\n`,
  );

  // internal link check
  const distFile = async (p) => {
    const clean = p.split(/[?#]/)[0];
    const abs = path.join(DIST, clean);
    if (existsSync(abs)) {
      const st = await fs.stat(abs);
      if (st.isFile()) return true;
      return existsSync(path.join(abs, "index.html"));
    }
    return false;
  };
  for (const p of pages) {
    const refs = [...p.html.matchAll(/\b(?:href|src|content|data-src)="(\/[^"]*)"/g)].map((m) => m[1]);
    for (const r of new Set(refs)) {
      if (r.startsWith("//")) continue;
      if (!(await distFile(r))) warnings.push(`${p.route} links to missing ${r}`);
    }
    if (!/<h1[\s>]/.test(p.html)) warnings.push(`${p.route} has no h1`);
    if ((p.html.match(/<h1[\s>]/g) || []).length > 1) warnings.push(`${p.route} has more than one h1`);
    if (!p.meta.title) warnings.push(`${p.route} has no title`);
    if (!p.meta.description) warnings.push(`${p.route} has no description`);
    if (/\bTODO\b/.test(p.html)) warnings.push(`${p.route} ships the word TODO`);
  }

  // weight report for home: html + everything it references under /assets
  const home = pages.find((p) => p.route === "/");
  let homeWeight = home ? home.bytes : 0;
  const homeAssets = [];
  if (home) {
    const refs = new Set([
      ...[...home.html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)].map((m) => m[1]),
      ...[...home.html.matchAll(/url\("?(\/assets\/[^")]+)"?\)/g)].map((m) => m[1]),
    ]);
    for (const r of refs) {
      const abs = path.join(DIST, r.split(/[?#]/)[0]);
      if (existsSync(abs)) {
        const b = (await fs.stat(abs)).size;
        homeWeight += b;
        homeAssets.push([r, b]);
      }
    }
  }

  const kb = (n) => (n / 1024).toFixed(1) + " KB";
  console.log(`built ${pages.length} pages in ${Date.now() - t0} ms`);
  for (const p of pages) console.log(`  ${p.route.padEnd(22)} ${kb(p.bytes).padStart(9)}${p.meta.noindex ? "  noindex" : ""}`);
  if (home) {
    console.log(`home page weight ${kb(homeWeight)} (budget 350 KB)`);
    for (const [r, b] of homeAssets.sort((a, b) => b[1] - a[1])) console.log(`    ${kb(b).padStart(9)}  ${r}`);
    if (homeWeight > 350 * 1024) warnings.push(`home page weight ${kb(homeWeight)} exceeds 350 KB`);
  }
  if (todos.length) {
    console.log(`TODO(owner) markers in source (${todos.length}), keep OPEN_ITEMS.md in sync:`);
    for (const t of todos) console.log(`  - ${t}`);
  }
  if (warnings.length) {
    console.log(`warnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }
  return warnings;
}

// ---------- dev server ----------
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
  ".avif": "image/avif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain",
  ".pdf": "application/pdf", ".zip": "application/zip",
};
function serve(port = 4173) {
  http
    .createServer(async (req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let abs = path.join(DIST, p);
      try {
        if (existsSync(abs) && (await fs.stat(abs)).isDirectory()) {
          if (!p.endsWith("/")) { res.writeHead(301, { Location: p + "/" }); return res.end(); }
          abs = path.join(abs, "index.html");
        }
        const body = await fs.readFile(abs);
        res.writeHead(200, { "Content-Type": TYPES[path.extname(abs)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(body);
      } catch {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        const nf = path.join(DIST, "404.html");
        res.end(existsSync(nf) ? await fs.readFile(nf) : "Not found");
      }
    })
    .listen(port, () => console.log(`serving dist/ at http://localhost:${port}`));
}

// ---------- main ----------
const warnings = await build();
if (args.has("--check") && warnings.length) process.exit(1);
if (args.has("--watch")) {
  let t;
  for (const d of [SRC, DATA]) {
    if (!existsSync(d)) continue;
    watch(d, { recursive: true }, () => {
      clearTimeout(t);
      t = setTimeout(() => build().catch((e) => console.error(e.message)), 120);
    });
  }
  console.log("watching src/ and data/");
}
if (args.has("--serve")) serve();
