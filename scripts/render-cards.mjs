#!/usr/bin/env node
// Renders the profile's three cards as SVG from real project outputs — no
// github-readme-stats-style generic widgets. Runs in .github/workflows/cards.yml
// against fresh clones of the three repos; the SVGs land on the `output` branch
// next to the contribution snake.
//
//   node scripts/render-cards.mjs <codeblast-dir> <agentxray-dir> <out-dir>
//
// 1. archmap-card.svg  — module dependency map of a real repo (sgp showcase from
//    codeblast/docs), dagre coordinates reused verbatim, cyclic edges in red,
//    edges draw themselves in with a CSS animation (GitHub allows SVG-internal CSS).
// 2. recall-card.svg   — codeblast's mutation-testing acceptance: recall ring from
//    the newest eval/mutation-*.json, precision per channel, run date.
// 3. ledger-card.svg   — AgentXRay per-turn ledger (time / tokens / cost bars) for
//    the richest demo session, using the same buildTurnLedger the UI uses.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [cbDir, axDir, outDir] = process.argv.slice(2).map((p) => p && path.resolve(p));
if (!cbDir || !axDir || !outDir) {
  console.error('usage: render-cards.mjs <codeblast-dir> <agentxray-dir> <out-dir>');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

// Palette follows GitHub dark (the profile is viewed there far more than in light).
const C = {
  bg: '#0d1117', card: '#161b22', border: '#30363d', text: '#c9d1d9', muted: '#8b949e',
  blue: '#58a6ff', green: '#3fb950', amber: '#e3b341', red: '#f85149', purple: '#bc8cff',
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const font = `font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"`;

function frame(w, h, title, subtitle, body, extraCss = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${font}>
<style>
  text { fill: ${C.text}; }
  .muted { fill: ${C.muted}; }
  .title { font-size: 14px; font-weight: 600; }
  .sub { font-size: 11px; }
  ${extraCss}
</style>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="8" fill="${C.card}" stroke="${C.border}"/>
<text x="16" y="24" class="title">${esc(title)}</text>
<text x="${w - 16}" y="24" class="sub muted" text-anchor="end">${esc(subtitle)}</text>
<line x1="16" y1="36" x2="${w - 16}" y2="36" stroke="${C.border}"/>
${body}
</svg>
`;
}

// ---------- 1. archmap card ----------
function archmapCard() {
  const html = readFileSync(path.join(cbDir, 'docs', 'sgp-arch.html'), 'utf8');
  const m = html.match(/const DATA = (\{.*?\});\n/s);
  if (!m) throw new Error('DATA not found in sgp-arch.html');
  const data = JSON.parse(m[1]);
  const L = data.layouts.__modules__;
  const cyclic = new Set(data.modEdges.filter((e) => e.cyclic).map((e) => `${e.src}→${e.dst}`));
  const weight = new Map(data.modEdges.map((e) => [`${e.src}→${e.dst}`, e.w]));
  const files = new Map(data.modules.map((mod) => [mod.name, mod.files]));

  const W = 420, H = 420, top = 48, pad = 16, foot = 22;
  const sx = (W - 2 * pad) / L.width, sy = (H - top - pad - foot) / L.height, s = Math.min(sx, sy);
  const ox = pad + ((W - 2 * pad) - L.width * s) / 2, oy = top + ((H - top - pad - foot) - L.height * s) / 2;
  const X = (x) => (ox + x * s).toFixed(1), Y = (y) => (oy + y * s).toFixed(1);

  let edges = '';
  L.edges.forEach((e, i) => {
    const key = `${e.src}→${e.dst}`;
    const d = e.points.map((p, j) => `${j ? 'L' : 'M'}${X(p.x)} ${Y(p.y)}`).join(' ');
    const cyc = cyclic.has(key);
    const w = Math.min(3, 0.8 + Math.log2(1 + (weight.get(key) || 1)) * 0.5);
    edges += `<path d="${d}" fill="none" stroke="${cyc ? C.red : C.muted}" stroke-width="${w.toFixed(1)}" ${cyc ? 'stroke-dasharray="5 4"' : ''} class="edge${cyc ? ' cyc' : ''}" style="animation-delay:${(i * 0.12).toFixed(2)}s" marker-end="url(#arr${cyc ? 'R' : 'G'})"/>`;
  });
  let nodes = '';
  for (const n of L.nodes) {
    const label = n.id;
    const fw = n.w * s, fh = n.h * s;
    // Monospace glyph ≈ 0.62em wide: shrink the label until it fits inside the box with 6px padding.
    const fs = Math.max(7, Math.min(11, (fw - 8) / (label.length * 0.66)));
    nodes += `<g class="node"><rect x="${X(n.x)}" y="${Y(n.y)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" rx="5" fill="${C.bg}" stroke="${C.blue}" stroke-opacity="0.7"/>
<text x="${(ox + (n.x + n.w / 2) * s).toFixed(1)}" y="${(oy + (n.y + n.h / 2) * s - 3).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="600">${esc(label)}</text>
<text x="${(ox + (n.x + n.w / 2) * s).toFixed(1)}" y="${(oy + (n.y + n.h / 2) * s + 10).toFixed(1)}" text-anchor="middle" font-size="8.5" class="muted">${files.get(n.id) ?? '?'} files</text></g>`;
  }
  const legend = `<g font-size="10" class="muted"><text x="16" y="${H - 9}">${L.nodes.length} modules · ${L.edges.length} edges · file:line on each</text><line x1="${W - 140}" y1="${H - 12}" x2="${W - 122}" y2="${H - 12}" stroke="${C.red}" stroke-dasharray="5 4" stroke-width="2"/><text x="${W - 116}" y="${H - 9}">circular dep.</text></g>`;
  const defs = `<defs><marker id="arrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.muted}"/></marker><marker id="arrR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.red}"/></marker></defs>`;
  // Base rules describe the finished picture; only the keyframes hide things. A renderer that
  // ignores CSS animation (raster previews, some RSS readers) therefore shows the complete map.
  const css = `.edge { animation: draw 1.6s ease-out both; } .edge.cyc { animation: fade 1.2s ease-out both; } @keyframes draw { from { stroke-dasharray: 1000; stroke-dashoffset: 1000; } to { stroke-dasharray: 1000; stroke-dashoffset: 0; } } @keyframes fade { from { opacity: 0 } to { opacity: 1 } } .node { animation: fade 0.6s ease-out both; }`;
  return frame(W, H, 'codeblast · architecture map', data.generated.slice(0, 10), defs + edges + nodes + legend, css);
}

// ---------- 2. recall card ----------
function recallCard() {
  const dir = path.join(cbDir, 'eval');
  const files = readdirSync(dir).filter((f) => /^mutation-\d{4}-\d{2}-\d{2}.*\.json$/.test(f)).sort();
  const latest = files[files.length - 1];
  const rows = JSON.parse(readFileSync(path.join(dir, latest), 'utf8')).filter((r) => 'recall_hit' in r);
  const hits = rows.filter((r) => r.recall_hit).length;
  const prec = rows.reduce((a, r) => a + r.precision, 0) / rows.length;
  const callRows = rows.filter((r) => typeof r.precision_call === 'number' && r.precision_call > 0);
  const precCall = callRows.length ? callRows.reduce((a, r) => a + r.precision_call, 0) / callRows.length : null;
  const date = latest.match(/\d{4}-\d{2}-\d{2}/)[0];
  const bench = (latest.match(/-(\w+)-n\d+/) || [])[1] || 'benchmark';

  const W = 480, H = 200, cx = 80, cy = 118, r = 46, circ = 2 * Math.PI * r;
  const recall = hits / rows.length;
  const ring = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.border}" stroke-width="10"/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.green}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - recall)).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})" class="ring"/>
<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="22" font-weight="700">${Math.round(recall * 100)}%</text>
<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="10" class="muted">recall</text>`;
  const bar = (y, label, val, color) => `<text x="150" y="${y}" font-size="11">${esc(label)}</text><rect x="150" y="${y + 6}" width="220" height="6" rx="3" fill="${C.border}"/><rect x="150" y="${y + 6}" width="${(220 * val).toFixed(1)}" height="6" rx="3" fill="${color}" class="bar"/><text x="${W - 16}" y="${y}" text-anchor="end" font-size="11" class="muted">${val.toFixed(2)}</text>`;
  const body = ring
    + `<text x="150" y="62" font-size="12" font-weight="600">${hits}/${rows.length} mutants recalled</text>`
    + `<text x="150" y="78" font-size="10" class="muted">${esc(bench)} · inject a fault → run the real tests → compare</text>`
    + bar(104, 'precision, all channels', prec, C.amber)
    + (precCall !== null ? bar(138, 'precision, call channel', precCall, C.blue) : '')
    + `<text x="150" y="${H - 14}" font-size="10" class="muted">false positives over false negatives — by design</text>`;
  const css = `.ring { stroke-dashoffset: ${circ.toFixed(1)}; animation: ring 1.4s ease-out forwards; } @keyframes ring { to { stroke-dashoffset: ${(circ * (1 - recall)).toFixed(1)}; } } .bar { transform-origin: 150px 0; animation: grow 1.2s ease-out both; } @keyframes grow { from { transform: scaleX(0) } to { transform: scaleX(1) } }`;
  return frame(W, H, 'codeblast · mutation-tested recall', `weekly · ${date}`, body, css);
}

// ---------- 3. ledger card ----------
function ledgerCard() {
  const require = createRequire(import.meta.url);
  const pure = require(path.join(axDir, 'public', 'js', 'pure.js'));
  const fx = JSON.parse(readFileSync(path.join(axDir, 'frontend', 'src', 'demo', 'fixtures.json'), 'utf8'));
  // Pick the demo session with the most assistant usage; the fixtures are single-turn,
  // so we synthesise turns from tool-call boundaries when only one user message exists.
  let best = null;
  for (const [key, det] of Object.entries(fx.details)) {
    const ledger = pure.buildTurnLedger(det.messages);
    const score = ledger.rows.length * 10 + (ledger.hasUsage ? 5 : 0) + (ledger.hasCost ? 3 : 0);
    if (!best || score > best.score) best = { key, det, ledger, score };
  }
  let rows = best.ledger.rows;
  let rowWord = 'turn';
  if (rows.length < 2) {
    // Split the single turn at each assistant message so the card still shows a distribution.
    const msgs = best.det.messages;
    // One row per assistant step: a pseudo user boundary at each assistant message, labelled
    // with what the assistant said. Tool calls/results between steps attach to the preceding one.
    const synthetic = [];
    for (const m of msgs) {
      if (m.role === 'user') continue;
      if (m.role === 'assistant') {
        synthetic.push({ role: 'user', timestamp: m.timestamp, id: m.id, content: [{ type: 'text', text: pure.getTextContent(m.content || []) || '(step)' }] });
      }
      synthetic.push(m);
    }
    rows = pure.buildTurnLedger(synthetic).rows;
    rowWord = 'step';
  }
  rows = rows.slice(0, 4);
  const W = 480, H = 200;
  const maxMs = Math.max(...rows.map((r) => r.durationMs), 1);
  const maxTok = Math.max(...rows.map((r) => r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens), 1);
  const maxCost = Math.max(...rows.map((r) => r.cost), 0);
  const hasCost = maxCost > 0;
  const colT = hasCost ? 200 : 230, colK = hasCost ? 295 : 355, colC = 390, bw = hasCost ? 75 : 90;
  let body = `<g font-size="10" class="muted"><text x="16" y="56">${rowWord}</text><text x="${colT}" y="56">time</text><text x="${colK}" y="56">tokens</text>${hasCost ? `<text x="${colC}" y="56">cost</text>` : ''}</g>`;
  rows.forEach((r, i) => {
    const y = 76 + i * 26;
    const tok = r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens;
    const maxLabel = hasCost ? 22 : 26;
    const label = (r.toolErrors ? '✕ ' : '') + r.text.slice(0, maxLabel) + (r.text.length > maxLabel ? '…' : '');
    const bar = (x, v, max, color) => `<rect x="${x}" y="${y + 3}" width="${bw}" height="5" rx="2.5" fill="${C.border}"/><rect x="${x}" y="${y + 3}" width="${((v / max) * bw).toFixed(1)}" height="5" rx="2.5" fill="${color}" class="bar" style="transform-origin:${x}px 0;animation-delay:${(i * 0.08).toFixed(2)}s"/>`;
    body += `<text x="16" y="${y}" font-size="11">${esc(label)}</text>`
      + `<text x="${colT}" y="${y}" font-size="10" class="muted">${pure.formatDurationCompact(r.durationMs)}</text>` + bar(colT, r.durationMs, maxMs, C.amber)
      + `<text x="${colK}" y="${y}" font-size="10" class="muted">${tok.toLocaleString()}</text>` + bar(colK, tok, maxTok, C.blue)
      + (hasCost ? `<text x="${colC}" y="${y}" font-size="10" class="muted">${pure.formatCost(r.cost)}</text>` + bar(colC, r.cost, maxCost, C.green) : '');
  });
  const platform = best.key.split('/')[0];
  body += `<text x="16" y="${H - 12}" font-size="10" class="muted">${esc(platform)} demo session · one row per ${rowWord} · same numbers as the dashboard</text>`;
  const css = `.bar { animation: grow 1s ease-out both; } @keyframes grow { from { transform: scaleX(0) } to { transform: scaleX(1) } }`;
  return frame(W, H, 'AgentXRay · per-turn ledger', 'where the time went', body, css);
}

const cards = { 'archmap-card.svg': archmapCard, 'recall-card.svg': recallCard, 'ledger-card.svg': ledgerCard };
for (const [name, fn] of Object.entries(cards)) {
  const svg = fn();
  writeFileSync(path.join(outDir, name), svg);
  console.log(`wrote ${name} (${(svg.length / 1024).toFixed(1)} KB)`);
}
