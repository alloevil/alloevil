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
// Quadratic curves through segment midpoints: dagre's polyline points become control
// points, so the curve stays inside the polyline's hull — smooth corners, no overshoot.
function smoothPath(pts, X, Y) {
  if (pts.length < 3) return pts.map((p, j) => `${j ? 'L' : 'M'}${X(p.x)} ${Y(p.y)}`).join(' ');
  let d = `M${X(pts[0].x)} ${Y(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q${X(pts[i].x)} ${Y(pts[i].y)} ${X(mx)} ${Y(my)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${X(last.x)} ${Y(last.y)}`;
  return d;
}

function archmapCard() {
  // Tabby (Eugeny/tabby, ~60k★): 16 workspace packages, a clear hub in tabby-core.
  const html = readFileSync(path.join(cbDir, 'docs', 'tabby-arch.html'), 'utf8');
  const m = html.match(/const DATA = (\{.*?\});\n/s);
  if (!m) throw new Error('DATA not found in tabby-arch.html');
  const data = JSON.parse(m[1]);
  // The committed layout is 2330×618 (built for a wide browser). Re-run dagre on the same
  // module graph with a left-to-right rank direction so it fits a card; edges/nodes are unchanged.
  const dagre = createRequire(import.meta.url)(path.join(cbDir, 'node_modules', '@dagrejs', 'dagre'));
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 14, ranksep: 46, marginx: 8, marginy: 8 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const mod of data.modules) g.setNode(mod.name, { width: Math.max(70, mod.name.replace(/^tabby-/, '').length * 6.6 + 18), height: 30 });
  for (const e of data.modEdges) if (e.src !== e.dst) g.setEdge(e.src, e.dst);
  dagre.layout(g);
  const gd = g.graph();
  const L = {
    width: gd.width, height: gd.height,
    nodes: g.nodes().map((id) => { const n = g.node(id); return { id, x: n.x - n.width / 2, y: n.y - n.height / 2, w: n.width, h: n.height }; }),
    edges: data.modEdges.filter((e) => e.src !== e.dst).map((e) => ({ src: e.src, dst: e.dst, points: g.edge(e.src, e.dst)?.points ?? [] })),
  };
  const cyclic = new Set(data.modEdges.filter((e) => e.cyclic).map((e) => `${e.src}→${e.dst}`));
  const weight = new Map(data.modEdges.map((e) => [`${e.src}→${e.dst}`, e.w]));
  const files = new Map(data.modules.map((mod) => [mod.name, mod.files]));
  const fanIn = new Map();
  for (const e of data.modEdges) fanIn.set(e.dst, (fanIn.get(e.dst) || 0) + e.w);
  const maxFan = Math.max(1, ...fanIn.values());
  const maxW = Math.max(1, ...weight.values());

  const W = 560, H = 440, top = 48, pad = 18;
  const sx = (W - 2 * pad) / L.width, sy = (H - top - pad - 16) / L.height, s = Math.min(sx, sy);
  const ox = pad + ((W - 2 * pad) - L.width * s) / 2, oy = top + ((H - top - pad) - L.height * s) / 2;
  const X = (x) => (ox + x * s).toFixed(1), Y = (y) => (oy + y * s).toFixed(1);

  // Edge colour = destination's fan-in (blue → purple as it becomes a hub); cycles red.
  const hubColor = (t) => `hsl(${(215 - 60 * t).toFixed(0)} 85% ${(66 - 8 * t).toFixed(0)}%)`;

  let edges = '';
  const sorted = [...L.edges].sort((a, b) => (cyclic.has(`${a.src}→${a.dst}`) ? 1 : 0) - (cyclic.has(`${b.src}→${b.dst}`) ? 1 : 0));
  sorted.forEach((e, i) => {
    const key = `${e.src}→${e.dst}`;
    const cyc = cyclic.has(key);
    const w = weight.get(key) || 1;
    const sw = (0.9 + 2.2 * Math.sqrt(w / maxW)).toFixed(1);
    const color = cyc ? C.red : hubColor((fanIn.get(e.dst) || 0) / maxFan);
    edges += `<path d="${smoothPath(e.points, X, Y)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-opacity="${cyc ? 0.95 : 0.7}" stroke-linecap="round" ${cyc ? 'stroke-dasharray="6 5"' : ''} class="edge${cyc ? ' cyc' : ''}" style="animation-delay:${(i * 0.07).toFixed(2)}s"/>`;
  });

  let nodes = '';
  for (const n of L.nodes) {
    const label = n.id.replace(/^tabby-/, '');
    const sub = `${files.get(n.id) ?? '?'} files${fanIn.get(n.id) ? ` · ${fanIn.get(n.id)} in` : ''}`;
    const t = (fanIn.get(n.id) || 0) / maxFan;
    const stroke = hubColor(t);
    const fw = Math.max(n.w * s, label.length * 6.2 + 14, sub.length * 4.9 + 14);
    const fh = Math.max(n.h * s, 30);
    const cx = ox + (n.x + n.w / 2) * s, cy = oy + (n.y + n.h / 2) * s;
    nodes += `<g class="node">
<rect x="${(cx - fw / 2).toFixed(1)}" y="${(cy - fh / 2).toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" rx="6" fill="url(#nodeGrad)" stroke="${stroke}" stroke-width="${(1 + 1.2 * t).toFixed(1)}" ${t > 0.6 ? 'filter="url(#glow)"' : ''}/>
<text x="${cx.toFixed(1)}" y="${(cy - 2.5).toFixed(1)}" text-anchor="middle" font-size="9.8" font-weight="600">${esc(label)}</text>
<text x="${cx.toFixed(1)}" y="${(cy + 9).toFixed(1)}" text-anchor="middle" font-size="7.8" class="muted">${esc(sub)}</text></g>`;
  }
  const hasCycle = L.edges.some((e) => cyclic.has(`${e.src}→${e.dst}`));
  const legend = `<g font-size="10" class="muted">
<text x="16" y="${H - 9}">Eugeny/tabby (60k★) · ${L.nodes.length} packages · ${L.edges.length} import edges · width = imports · glow = hub</text>
${hasCycle ? `<line x1="${W - 64}" y1="${H - 12}" x2="${W - 48}" y2="${H - 12}" stroke="${C.red}" stroke-dasharray="6 5" stroke-width="2"/><text x="${W - 43}" y="${H - 9}">cycle</text>` : ''}</g>`;
  const defs = `<defs>
<linearGradient id="nodeGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2230"/><stop offset="1" stop-color="${C.bg}"/></linearGradient>
<filter id="glow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`;
  const css = `.edge { animation: draw 1.8s ease-out both; } .edge.cyc { animation: fade 1.4s ease-out both; } @keyframes draw { from { stroke-dasharray: 1200; stroke-dashoffset: 1200; } to { stroke-dasharray: 1200; stroke-dashoffset: 0; } } @keyframes fade { from { opacity: 0 } to { opacity: 1 } } .node { animation: fade 0.7s ease-out both; }`;
  return frame(W, H, 'codeblast · Tabby architecture', `from tsc, not a model · ${data.generated.slice(0, 10)}`, defs + edges + nodes + legend, css);
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
