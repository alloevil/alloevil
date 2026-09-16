#!/usr/bin/env node
// Stages the published surface of this repository into dist/, then refuses to finish if any page
// points at something that is not in it.
//
// Why a build step instead of serving the repository root: the root also holds the workflows, the
// snapshots, the card generator, the README and the wrangler config. Pointing the asset directory
// at the whole repository means every one of those is one ignore-pattern away from being published,
// and `wrangler dev` watches the directory it serves — with the root as that directory it reloads
// on its own state files and never answers a request. Staging fixes both: what is copied below is
// the published surface, and it is the only thing wrangler sees.
//
// Run: npm run build   (Cloudflare Workers Builds runs exactly this before `npx wrangler deploy`)

import { cp, mkdir, readFile, rm, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

// Everything the site serves, relative to the repository root. Pages and their data are listed
// individually so that adding a top-level file to the repository is never the same thing as
// publishing it.
const PUBLISHED = [
  "index.html",
  "404.html",
  "styles.css",
  "script.js",
  "claims.json",
  "robots.txt",
  "sitemap.xml",
  "assets/site",
  "projects",
  "blog",
];

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(abs, base)));
    else out.push(relative(base, abs));
  }
  return out;
}

async function exists(path) {
  try {
    const info = await stat(path);
    return info.isFile() ? "file" : info.isDirectory() ? "dir" : false;
  } catch {
    return false;
  }
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

for (const entry of PUBLISHED) {
  const from = join(ROOT, entry);
  if (!(await exists(from))) {
    console.error(`build: ${entry} is listed as published but does not exist`);
    process.exit(1);
  }
  await cp(from, join(DIST, entry), { recursive: true });
}

// Every root-relative reference a staged page makes has to resolve inside dist/. A missing one is a
// broken link in production, so it fails the build (and therefore the deploy) instead of shipping.
const problems = [];
const pages = (await walk(DIST)).filter((f) => f.endsWith(".html")).sort();

// The address the site answers on lives in site.json. The source pages carry canonical, og:url and
// og:image as root-relative paths - correct for local previews and for any origin - and the build
// writes them absolute, because the crawlers and chat clients that read these tags do not run
// script.js. One edit to site.json moves all of them, robots.txt and sitemap.xml included.
const site = JSON.parse(await readFile(join(ROOT, "site.json"), "utf8"));
if (!/^https:\/\/[^/]+$/.test(site.origin)) {
  console.error(`build: site.json origin "${site.origin}" is not a bare https origin`);
  process.exit(1);
}

const absolute = (html) =>
  html
    .replace(/(<link rel="canonical" href=")(\/[^"]*)/g, (_, open, path) => open + site.origin + path)
    .replace(/(<meta property="og:url" content=")(\/[^"]*)/g, (_, open, path) => open + site.origin + path)
    .replace(/(<meta property="og:image" content=")(\/[^"]*)/g, (_, open, path) => open + site.origin + path);

let stamped = 0;
for (const page of pages) {
  const file = join(DIST, page);
  const source = await readFile(file, "utf8");
  const deployed = absolute(source);
  if (deployed !== source) {
    await writeFile(file, deployed);
    stamped++;
  }
}

for (const page of pages) {
  const html = await readFile(join(DIST, page), "utf8");
  const refs = [...html.matchAll(/\b(?:href|src|srcset)="([^"]+)"/g)].map((m) => m[1]);
  for (const raw of refs) {
    const ref = raw.trim().split(",")[0].trim().split(/\s+/)[0];
    if (!ref.startsWith("/") || ref.startsWith("//")) continue;
    const path = ref.split("#")[0].split("?")[0];
    if (!path || path === "/") continue;
    const target = join(DIST, path);
    const kind = await exists(target);
    const index = kind === "dir" ? await exists(join(target, "index.html")) : kind;
    if (!kind || !index) problems.push(`${page} → ${ref}`);
  }
}

if (problems.length) {
  console.error(`build: ${problems.length} reference(s) point outside the staged site:`);
  problems.forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}

const files = await walk(DIST);
const byExt = files.reduce((acc, f) => {
  const ext = posix.extname(f) || "(none)";
  acc[ext] = (acc[ext] || 0) + 1;
  return acc;
}, {});

console.log(`build: staged ${files.length} files into dist/ — ${pages.length} pages, ${Object.entries(byExt).sort().map(([e, n]) => `${n}${e}`).join(", ")}`);
console.log(`build: ${pages.length} pages checked, 0 broken root-relative references`);
console.log(`build: ${stamped} pages stamped with the deployed origin ${site.origin} (canonical, og:url, og:image)`);
