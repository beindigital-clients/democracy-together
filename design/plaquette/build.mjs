#!/usr/bin/env node
// Democracy Together presentation brochure (8 A4 pages), French and English.
//
//   node design/plaquette/build.mjs
//
// For each language (plaquette.html, plaquette-en.html) writes the brochure
// in A4, as an A5 booklet, and the A5 booklet imposed on A4 sheets for office
// printing. The two HTML files are independent: there is no shared template,
// so a text edit in one language must be repeated by hand in the other.
//
// Steps: trace the rays of the logo symbol, draw the dotted globes, collect the
// Lucide icons, write them to visuels.js and the globe-*.svg files (shared,
// language-independent), then print each language's HTML to PDF and one PNG
// preview per page.
//
// Dependencies come from the repo's node_modules (d3-geo, topojson-client,
// world-atlas, lucide-react, @playwright/test). If the pinned Playwright
// browser is missing, set PLAYWRIGHT_CHROMIUM_PATH to an installed
// chrome-headless-shell.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { geoBounds, geoContains, geoDistance, geoOrthographic } from 'd3-geo';
import { feature } from 'topojson-client';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const require = createRequire(import.meta.url);
const f2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- rays ----

// Traces the symbol of the client's logo (public/brand) in the browser:
// connected components of the opaque pixels, each reduced to its 4-corner
// hull, then centred on a circle fitted to the outer corners. Output: 15 rays
// normalised to an outer radius of 100, the orange one flagged `accent`. The
// logo leaves the 12 o'clock slot empty; `ghost` is that missing ray.
async function traceRays(page) {
  const png = readFileSync(join(ROOT, 'public/brand/democracy-together-logo.png')).toString('base64');
  const raw = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const W = 380;
    const H = img.height;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, W, H).data;
    const on = (x, y) => px[(y * W + x) * 4 + 3] > 128;
    const seen = new Uint8Array(W * H);
    const comps = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!on(x, y) || seen[y * W + x]) continue;
        const pts = [];
        const stack = [[x, y]];
        let red = 0;
        seen[y * W + x] = 1;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          pts.push([cx, cy]);
          red += px[(cy * W + cx) * 4];
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < W && ny < H && on(nx, ny) && !seen[ny * W + nx]) {
              seen[ny * W + nx] = 1;
              stack.push([nx, ny]);
            }
          }
        }
        if (pts.length > 200) comps.push({ pts, accent: red / pts.length > 200 });
      }
    }
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const hull = (points) => {
      const s = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const lower = [];
      const upper = [];
      for (const q of s) {
        while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
        lower.push(q);
      }
      for (const q of s.reverse()) {
        while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
        upper.push(q);
      }
      return lower.slice(0, -1).concat(upper.slice(0, -1));
    };
    const toQuad = (h) => {
      const q = h.map((p) => [...p]);
      while (q.length > 4) {
        let best = Infinity;
        let at = 0;
        q.forEach((p, i) => {
          const area = Math.abs(cross(q[(i - 1 + q.length) % q.length], p, q[(i + 1) % q.length]));
          if (area < best) {
            best = area;
            at = i;
          }
        });
        q.splice(at, 1);
      }
      return q;
    };
    return comps.map((c) => {
      const corners = [];
      for (const [x, y] of c.pts) corners.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
      return { accent: c.accent, quad: toQuad(hull(corners)) };
    });
  }, png);

  // Kasa least-squares circle fit, on the two outer corners of every ray.
  const fit = (points) => {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
    for (const [x, y] of points) {
      const z = x * x + y * y;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
    }
    const m = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, points.length, sz]];
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 3; k++) {
        if (k === i) continue;
        const f = m[k][i] / m[i][i];
        for (let l = i; l < 4; l++) m[k][l] -= f * m[i][l];
      }
    }
    const a = m[0][3] / m[0][0];
    const b = m[1][3] / m[1][1];
    const c = m[2][3] / m[2][2];
    return { cx: a / 2, cy: b / 2, r: Math.sqrt(c + (a * a + b * b) / 4) };
  };
  const roughX = raw.flatMap((r) => r.quad).reduce((s, p) => s + p[0], 0) / (raw.length * 4);
  const roughY = raw.flatMap((r) => r.quad).reduce((s, p) => s + p[1], 0) / (raw.length * 4);
  const outer = raw.flatMap((r) =>
    [...r.quad].sort((p, q) => Math.hypot(q[0] - roughX, q[1] - roughY) - Math.hypot(p[0] - roughX, p[1] - roughY)).slice(0, 2),
  );
  const { cx, cy, r } = fit(outer);
  const rays = raw
    .map((ray) => {
      const pts = ray.quad.map(([x, y]) => [((x - cx) / r) * 100, ((y - cy) / r) * 100]);
      const mx = pts.reduce((s, p) => s + p[0], 0);
      const my = pts.reduce((s, p) => s + p[1], 0);
      return { accent: ray.accent, ang: (Math.atan2(my, mx) * 180) / Math.PI, pts };
    })
    .sort((a, b) => a.ang - b.ang);

  // The empty 12 o'clock slot: the ray just before it, turned into place.
  const before = rays.filter((ray) => ray.ang < -90).at(-1);
  const turn = ((-90 - before.ang) * Math.PI) / 180;
  const ghost = before.pts.map(([x, y]) => [
    x * Math.cos(turn) - y * Math.sin(turn),
    x * Math.sin(turn) + y * Math.cos(turn),
  ]);
  return { rays, ghost };
}

const poly = (pts) => `M${pts.map(([x, y]) => `${f2(x)} ${f2(y)}`).join('L')}Z`;

function raySymbols({ rays, ghost }) {
  // Inline style, not a fill attribute: CSS variables do not resolve in SVG attributes.
  const accent = 'style="fill:var(--ray-accent, #f58b1a);fill-opacity:1"';
  const ring = rays.map((r) => `<path d="${poly(r.pts)}"${r.accent ? ` ${accent}` : ''}/>`).join('');

  // Eroding ring (crisis page): the logo's own geometry, nothing moves. The
  // rays fade out towards the lower right, and the two weakest are gone.
  const eroding = rays
    .map((r) => {
      const a = (r.ang * Math.PI) / 180;
      const wear = Math.min(1, Math.max(0, (Math.cos(a - Math.PI / 4) - 0.1) / 0.9));
      if (wear > 0.92) return '';
      return `<path d="${poly(r.pts)}"${r.accent ? ` ${accent}` : ''} fill-opacity="${f2(1 - 0.82 * wear)}"/>`;
    })
    .join('');

  // Rising half-ring (youth): the upper rays, plus the empty slot filled.
  const rising =
    rays.filter((r) => r.ang <= 5).map((r) => `<path d="${poly(r.pts)}"/>`).join('') +
    `<path d="${poly(ghost)}"/>`;

  // One ray, pointing right, centred on its own middle (list marks).
  const base = rays.find((r) => Math.abs(r.ang) < 10);
  const mx = base.pts.reduce((s, p) => s + p[0], 0) / 4;
  const my = base.pts.reduce((s, p) => s + p[1], 0) / 4;
  const one = poly(base.pts.map(([x, y]) => [x - mx, y - my]));

  return [
    `<symbol id="anneau" viewBox="-104 -104 208 208">${ring}</symbol>`,
    `<symbol id="anneau-erode" viewBox="-104 -104 208 208">${eroding}</symbol>`,
    `<symbol id="soleil" viewBox="-104 -104 208 112">${rising}</symbol>`,
    `<symbol id="rayon" viewBox="-24 -12 48 24"><path d="${one}"/></symbol>`,
    `<symbol id="rayon-fantome" viewBox="-104 -104 208 208"><path d="${poly(ghost)}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round"/></symbol>`,
  ];
}

// --------------------------------------------------------------- icons ----

const ICONS = [
  'lightbulb', 'messages-square', 'graduation-cap', 'users-round', 'blend',
  'key-round', 'lock-open', 'user-check', 'network',
  'megaphone', 'clipboard-check', 'calendar-days', 'compass', 'hand-coins',
];

async function iconSymbols() {
  const dir = join(dirname(require.resolve('lucide-react/package.json')), 'dist', 'esm', 'icons');
  const out = [];
  for (const name of ICONS) {
    const { __iconData } = await import(pathToFileURL(join(dir, `${name}.mjs`)).href);
    const body = __iconData.node
      .map(([tag, attrs]) => {
        const a = Object.entries(attrs)
          .filter(([k]) => k !== 'key')
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ');
        return `<${tag} ${a}/>`;
      })
      .join('');
    out.push(
      `<symbol id="ico-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`,
    );
  }
  return out;
}

// -------------------------------------------------------------- globes ----

const AFRICA = new Set(
  '012 024 204 072 854 108 120 140 148 178 180 384 262 818 226 232 748 231 266 270 288 324 624 404 426 430 434 450 454 466 478 504 508 516 562 566 646 686 694 706 710 728 729 834 768 788 800 732 894 716'.split(' '),
);
const EUROPE = new Set(
  '008 040 112 056 070 100 191 196 203 208 233 246 250 276 300 348 352 372 380 428 440 442 498 499 528 807 578 616 620 642 688 703 705 724 752 756 804 826'.split(' '),
);
// Latin America and the Caribbean (English brochure only, page 3: adds this
// region to the "attentive to" commitment, see plaquette-en.html).
const LATIN_AMERICA = new Set(
  '484 320 084 340 222 558 188 591 192 388 332 214 044 780 170 862 328 740 218 604 076 068 600 152 032 858'.split(' '),
);
const NAMED = new Set(['Somaliland', 'Kosovo', 'N. Cyprus']);
const PARIS = [2.35, 48.86];

const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'));
const COUNTRIES = feature(topo, topo.objects.countries).features.map((f) => {
  const [[x0, y0], [x1, y1]] = geoBounds(f);
  return { f, x0, y0, x1, y1 };
});
function countryAt([lon, lat]) {
  return COUNTRIES.find(
    (c) =>
      lat >= c.y0 && lat <= c.y1 &&
      (c.x0 <= c.x1 ? lon >= c.x0 && lon <= c.x1 : lon >= c.x0 || lon <= c.x1) &&
      geoContains(c.f, [lon, lat]),
  )?.f;
}
function inAfricaEurope(f, lon) {
  if (f.id === '250' && lon < -30) return false; // French Guiana is in South America
  return AFRICA.has(f.id) || EUROPE.has(f.id) || NAMED.has(f.properties.name);
}
function inAfricaEuropeAmericas(f) {
  // Unlike inAfricaEurope, France (id 250) needs no French-Guiana carve-out
  // here: Europe and Latin America are both highlighted, so either half of
  // that merged shape already matches, with no need for the `lon` split.
  return AFRICA.has(f.id) || EUROPE.has(f.id) || LATIN_AMERICA.has(f.id) || NAMED.has(f.properties.name);
}

// Dotted orthographic globe. `zoom` > 1 crops into the disc (detail view).
function globe({ file, center, step, dot, zoom = 1, lit, dim, sea, rim, paris = false, highlightFn = inAfricaEurope }) {
  const R = 100;
  const projection = geoOrthographic()
    .rotate([-center[0], -center[1], 0])
    .scale(R * zoom)
    .translate([0, 0])
    .clipAngle(90);
  const dots = { lit: [], dim: [] };
  for (let lat = -88.5; lat <= 88.5; lat += step) {
    const n = Math.max(1, Math.round((360 * Math.cos((lat * Math.PI) / 180)) / step));
    for (let i = 0; i < n; i++) {
      const lon = -180 + ((i + 0.5) * 360) / n;
      const d = geoDistance([lon, lat], center);
      if (d > Math.PI / 2 - 0.02) continue;
      const [x, y] = projection([lon, lat]);
      if (Math.hypot(x, y) > R - dot) continue;
      const f = countryAt([lon, lat]);
      if (!f) continue;
      const facing = Math.cos(d);
      const r = dot * zoom ** 0.15 * (0.4 + 0.6 * Math.sqrt(facing));
      const kind = lit.highlight && highlightFn(f, lon) ? 'lit' : 'dim';
      const o = kind === 'lit' ? lit.opacity(facing) : dim.opacity(facing);
      dots[kind].push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(r)}" fill-opacity="${f2(o)}"/>`);
    }
  }
  let marker = '';
  if (paris) {
    const [x, y] = projection(PARIS);
    marker = `<circle cx="${f2(x)}" cy="${f2(y)}" r="3.6" fill="none" stroke="#f58b1a" stroke-width="0.5"/><circle cx="${f2(x)}" cy="${f2(y)}" r="1.6" fill="#f58b1a"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-102 -102 204 204">
<defs><radialGradient id="sea" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="${sea[0]}" stop-opacity="${sea[1]}"/><stop offset="1" stop-color="${sea[0]}" stop-opacity="${sea[2]}"/></radialGradient></defs>
<circle r="${R}" fill="url(#sea)"/>
<circle r="${R}" fill="none" stroke="${rim[0]}" stroke-opacity="${rim[1]}" stroke-width="0.5"/>
<g fill="${dim.color}">${dots.dim.join('')}</g>
<g fill="${lit.color}">${dots.lit.join('')}</g>
${marker}
</svg>
`;
  writeFileSync(join(HERE, file), svg);
  return `${file}: ${dots.lit.length} + ${dots.dim.length} dots`;
}

function buildGlobes() {
  return [
    // Cover: inside the ring, on deep indigo.
    globe({
      file: 'globe-couverture.svg', center: [12, 10], step: 2.1, dot: 1.05,
      lit: { highlight: true, color: '#f4f2ec', opacity: (c) => 0.5 + 0.5 * c },
      dim: { color: '#f4f2ec', opacity: (c) => 0.1 + 0.22 * c },
      sea: ['#ffffff', 0.1, 0.02], rim: ['#ffffff', 0.22], paris: true,
    }),
    // "Mondial": the Atlantic face, every land alike, on paper.
    globe({
      file: 'globe-monde.svg', center: [-22, 12], step: 3.4, dot: 1.7,
      lit: { highlight: false, color: '#1f3d6e', opacity: () => 1 },
      dim: { color: '#1f3d6e', opacity: (c) => 0.35 + 0.65 * c },
      sea: ['#1f3d6e', 0.08, 0.03], rim: ['#1f3d6e', 0.35],
    }),
    // "Afrique et Europe": a closer view, the two continents lit. French
    // brochure, page 3, third commitment.
    globe({
      file: 'globe-afrique-europe.svg', center: [16, 18], step: 1.9, dot: 1.25, zoom: 1.75,
      lit: { highlight: true, color: '#1f3d6e', opacity: (c) => 0.55 + 0.45 * c },
      dim: { color: '#1f3d6e', opacity: () => 0.16 },
      sea: ['#1f3d6e', 0.07, 0.03], rim: ['#1f3d6e', 0.35],
    }),
    // "Africa, Europe, Latin America": the Atlantic face again, same framing
    // as globe-monde (worldwide), but with those three regions lit instead of
    // every country alike — reads as "worldwide, rooted here" rather than a
    // closed set of continents. English brochure only, page 3, third
    // commitment (see plaquette-en.html).
    globe({
      file: 'globe-afrique-europe-ameriques.svg', center: [-22, 12], step: 3.4, dot: 1.7,
      highlightFn: inAfricaEuropeAmericas,
      lit: { highlight: true, color: '#1f3d6e', opacity: (c) => 0.55 + 0.45 * c },
      dim: { color: '#1f3d6e', opacity: () => 0.16 },
      sea: ['#1f3d6e', 0.08, 0.03], rim: ['#1f3d6e', 0.35],
    }),
  ];
}

// --------------------------------------------------------------- build ----

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 2 });

const symbols = [...raySymbols(await traceRays(page)), ...(await iconSymbols())];
writeFileSync(
  join(HERE, 'visuels.js'),
  `// Generated by build.mjs: logo rays and Lucide icons as an inline SVG sprite.\n` +
    `document.body.insertAdjacentHTML('afterbegin', ${JSON.stringify(
      `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0"><defs>${symbols.join('')}</defs></svg>`,
    )});\n`,
);
for (const line of buildGlobes()) console.log(line);

// Fit guard: every .zone is a box of fixed size. Report, in mm, the room left
// under its last line; a negative room means the text overflows the box.
async function checkFit(label) {
  const report = await page.evaluate(() =>
    [...document.querySelectorAll('.page')].map((p, i) => {
      const mm = 96 / 25.4;
      const zones = [...p.querySelectorAll('.zone')].map((z) => {
        const top = z.getBoundingClientRect().top;
        const used = Math.max(...[...z.children].map((c) => c.getBoundingClientRect().bottom)) - top;
        const box = z.getBoundingClientRect().height; // fractional, unlike clientHeight
        return { name: z.dataset.zone, room: Math.round(((box - used) / mm) * 10) / 10 };
      });
      return { page: i + 1, zones };
    }),
  );
  let fits = true;
  for (const { page: n, zones } of report) {
    const parts = zones.map((z) => `${z.name} ${z.room >= 0 ? `${z.room}mm` : `OVERFLOW ${-z.room}mm`}`);
    if (zones.some((z) => z.room < 0)) fits = false;
    console.log(`${label} page ${n}: ${parts.join(' · ') || 'no zone'}`);
  }
  return fits;
}

// One PNG per page, plus an overview as the folded booklet reads: cover,
// three spreads, back cover.
async function previews(dir) {
  mkdirSync(dir, { recursive: true });
  const pages = await page.$$('.page');
  for (const [i, el] of pages.entries()) await el.screenshot({ path: join(dir, `page-${i + 1}.png`) });
  const shot = (i) =>
    `<img src="data:image/png;base64,${readFileSync(join(dir, `page-${i}.png`)).toString('base64')}">`;
  const sheet = await browser.newPage({ viewport: { width: 2400, height: 1000 } });
  await sheet.setContent(
    `<style>body{margin:0;padding:40px;background:#cfccc3;display:grid;grid-template-columns:repeat(4,auto);gap:40px 56px;justify-content:start}
    .s{display:flex;box-shadow:0 2px 10px rgba(0,0,0,.18)}img{width:260px;display:block}</style>
    <div class="s">${shot(1)}</div><div class="s">${shot(2)}${shot(3)}</div>
    <div class="s">${shot(4)}${shot(5)}</div><div class="s">${shot(6)}${shot(7)}</div><div class="s">${shot(8)}</div>`,
    { waitUntil: 'load' },
  );
  await sheet.screenshot({ path: join(dir, 'planche.png'), fullPage: true });
  await sheet.close();
}

// Two languages, each in two formats: A4 (screen, e-mail) and an A5 booklet.
const LANGS = [
  { id: 'fr', file: 'plaquette.html', suffix: '' },
  { id: 'en', file: 'plaquette-en.html', suffix: '-en' },
];
const FORMATS = [
  { id: 'a4', name: 'a4' },
  { id: 'a5', name: 'livret-a5' },
];

let fits = true;
for (const lang of LANGS) {
  await page.goto(pathToFileURL(join(HERE, lang.file)).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(() =>
    ['500 20px Newsreader', 'italic 400 20px Newsreader', '400 12px "IBM Plex Sans"', '500 12px "IBM Plex Mono"'].filter(
      (f) => !document.fonts.check(f),
    ),
  );
  if (missing.length) throw new Error(`Fonts not loaded (${lang.id}): ${missing.join(', ')}`);

  for (const f of FORMATS) {
    await page.evaluate((id) => {
      document.documentElement.dataset.format = id;
    }, f.id);
    await page.evaluate(() => document.fonts.ready);
    fits = (await checkFit(`${lang.id}-${f.id}`)) && fits;
    const pdf = `democracy-together-plaquette-${f.name}${lang.suffix}.pdf`;
    await page.pdf({ path: join(HERE, pdf), preferCSSPageSize: true, printBackground: true });
    await previews(join(HERE, 'apercu', lang.id, f.id));
    console.log(`${pdf} + previews in apercu/${lang.id}/${f.id}/`);
  }

  // Office print of the A5 booklet: two A4 sheets printed on both sides, nested,
  // folded and stapled. Saddle-stitch order: outer sheet 8|1 then 2|7, inner
  // sheet 6|3 then 4|5.
  await page.evaluate((id) => {
    document.documentElement.dataset.format = id;
  }, 'a5');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.page')];
    for (const [left, right] of [[8, 1], [2, 7], [6, 3], [4, 5]]) {
      const sheet = document.createElement('div');
      sheet.className = 'sheet';
      sheet.append(pages[left - 1].cloneNode(true), pages[right - 1].cloneNode(true));
      document.body.append(sheet);
    }
    for (const p of pages) p.remove();
  });
  const imposed = `democracy-together-plaquette-livret-a5-impression${lang.suffix}.pdf`;
  await page.pdf({ path: join(HERE, imposed), preferCSSPageSize: true, printBackground: true });
  console.log(imposed);
}
await browser.close();
if (!fits) process.exitCode = 1;
