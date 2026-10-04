# Left-edge gear and schematic backdrop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the empty left of the frame with a bigger meshing pair of foreground gears, and replace the flat black behind the scene with dim, slowly changing drafting sheets.

**Architecture:** The gears are a change to one `Mech.Assembly` in `scene.js`. The schematics are a new module, `wallpaper/js/schematic.js`. It bakes three tileable drafting sheets in code (reusing `Mech.gearDims`/`Mech.gearPath` for the gears on them). It paints them first in each frame: the black is lifted to a dim warm paper with Lighten, then each sheet is multiplied in as a drifting, zooming, fading pattern. Everything else draws over it unchanged. A new **Schematic strength** setting scales the paper's opacity.

**Tech Stack:** Plain JS and Canvas 2D, no build step. Node for `tools/test.js` and `tools/serve.js`. The browser preview to tune by eye.

## Global Constraints

- Everything is drawn in code; no image of the opening ships.
- Design space is 2560×1440 design px; `view.S` scales it to the screen.
- Settings are 0–100 with 50 as designed; 0 turns the schematics off (no work done).
- Under 1 ms more per frame at 1440p.
- Neither gear may touch Makise's figure above her fade (y ≈ 1213), with the cursor at either extreme.
- Comments and docs follow the house style: plain sentences, design px, "as designed".
- `node tools/test.js` already has one failure on a clean `main` (`rig: at its strongest nothing folds over…`, folds at 375,135). It's out of scope: expect `1 failing`, and that same test, after every change.

---

### Task 1: The left-edge gears

**Files:**
- Modify: `wallpaper/js/scene.js:65-67` (the bottom-left solid gear)

**Interfaces:**
- Consumes: `Mech.Assembly` with `parts` and `mesh: { to, angle }` (already supported by `linkGears`).
- Produces: nothing later tasks use.

- [ ] **Step 1: Replace the bottom-left gear with the pair**

In `wallpaper/js/scene.js`, replace:

```js
      new A({ x: -70, y: 1500, depth: 1.0, blur: 0.7, alpha: 1, rx: 0.1, ry: 0.12, seed: 15, drift: 16, shine: 0,
        beat: { period: 5, dur: 1.8, teeth: 0.25 },
        parts: [{ type: 'gear', style: 'solid', pitch: 58, teeth: 34, spokes: 6, curved: true }] }),
```

with:

```js
      // Climbing the left edge beside her: a big gear, and a small one meshing with it in
      // the empty band beside her hair.
      new A({ x: -200, y: 1400, depth: 1.0, blur: 0.7, alpha: 1, rx: 0.1, ry: 0.12, seed: 15, drift: 16, shine: 0,
        beat: { period: 5, dur: 1.8, teeth: 0.25 },
        parts: [
          { type: 'gear', style: 'solid', pitch: 64, teeth: 48, spokes: 6, curved: true },
          { type: 'gear', style: 'solid', teeth: 16, spokes: 4, curved: true, mesh: { to: 0, angle: -1.3 } },
        ] }),
```

(Big gear: pitch radius 48·64/2π ≈ 489, outer ≈ 505. The small one sits at angle −1.3 from it, about (−26, 772), outer radius ≈ 179.)

- [ ] **Step 2: Look at it, cursor centred and at both extremes**

Run the preview (`preview_start` "wallpaper", viewport 1280×720) and open, in turn:
`/wallpaper/?still=8&cursor=0,0`, `/wallpaper/?still=8&cursor=1,1`, `/wallpaper/?still=8&cursor=-1,-1`, `/wallpaper/?still=8&cursor=0,0&centre=time`.

Expected: the big gear's teeth climb the left edge to about two-thirds height; the small gear fills the band beside her hair; neither touches her above where her coat fades; they read as dark foreground silhouettes; in Time mode they don't touch the digits. If one does, nudge `x`/`y` or `angle` (keep the numbers round) and look again.

- [ ] **Step 3: Run the tests**

Run: `node tools/test.js`
Expected: `1 failing` (the pre-existing rig fold test only).

- [ ] **Step 4: Commit**

```bash
git add wallpaper/js/scene.js
git commit -m "Grow the left-edge gear and mesh a small one with it"
```

---

### Task 2: The schematics

**Files:**
- Create: `wallpaper/js/schematic.js`
- Modify: `wallpaper/js/mech.js:527` (export `gearPath`)
- Modify: `wallpaper/index.html` (script tag after `atmos.js`)
- Modify: `wallpaper/js/main.js` (create, build, draw)
- Modify: `wallpaper/js/config.js` (the `schematic` setting)
- Modify: `wallpaper/project.json`, `wallpaper/LivelyProperties.json` (the slider)
- Modify: `tools/preview.html` (the slider)
- Modify: `README.md`, `workshop/WORKSHOP.md` (docs)
- Test: `tools/test.js`

**Interfaces:**
- Consumes: `Kit.{TAU, canvas, rng, pfbm2, smooth}`; `Mech.gearDims(pitch, teeth)` → `{ rp, r, root, step, teeth }`; `Mech.gearPath(G, { spokes, curved, holes })` → `Path2D` about the origin.
- Produces: `Schematic.Sheets` with `cam`, `build(view)`, `draw(ctx, view, t, a)`; and for tests `Schematic.SHEET` (`{ w, h }`), `Schematic.SHEETS`, `Schematic.FADE`, `Schematic.fades(t)` → three numbers in [0, 1] summing to 1.5, and `Schematic.place(i, t, cam)` → `{ x, y, zoom, turn }`.

- [ ] **Step 1: Write the failing tests**

Append to `tools/test.js`, just before `process.exitCode = …`:

```js
// ---------- Schematics: how the sheets fade and drift (nothing is drawn without a screen) ----------

function loadSchematic() {
  const ctx = { Math };
  vm.createContext(ctx);
  const src = ['kit.js', 'schematic.js'].map(f => fs.readFileSync(path.join(__dirname, '../wallpaper/js', f), 'utf8')).join('\n;\n');
  vm.runInContext(src + ';this.Schematic = Schematic;', ctx);
  return ctx;
}

test('schematic: the sheets take turns, always with as much drawing', () => {
  const { Schematic } = loadSchematic();
  const seen = Schematic.SHEETS.map(() => ({ lo: 1, hi: 0 }));
  for (let t = 0; t <= Schematic.FADE; t += 0.5) {
    const f = Schematic.fades(t), sum = f.reduce((a, b) => a + b, 0);
    assert.strictEqual(f.length, 3);
    assert.ok(Math.abs(sum - 1.5) < 1e-9, `${sum.toFixed(3)} sheets showing at ${t}s`);
    f.forEach((v, i) => { seen[i].lo = Math.min(seen[i].lo, v); seen[i].hi = Math.max(seen[i].hi, v); });
  }
  for (const s of seen) assert.ok(s.lo < 0.01 && s.hi > 0.99, `only fades between ${s.lo.toFixed(2)} and ${s.hi.toFixed(2)}`);
});

test('schematic: the sheets drift slowly and smoothly, however long it runs', () => {
  const { Schematic } = loadSchematic();
  const { w, h } = Schematic.SHEET, cam = { x: 0, y: 0 };
  const apart = (a, b, n) => Math.abs((b - a) - n * Math.round((b - a) / n));
  for (let i = 0; i < 3; i++) {
    for (const t0 of [0, 3600, 86400 * 30]) {
      const a = Schematic.place(i, t0, cam), b = Schematic.place(i, t0 + 1, cam);
      for (const p of [a, b]) assert.ok(p.x >= 0 && p.x < w && p.y >= 0 && p.y < h, `sheet ${i} at ${p.x},${p.y}`);
      const moved = Math.hypot(apart(a.x, b.x, w), apart(a.y, b.y, h));
      assert.ok(moved < 8, `sheet ${i} moved ${moved.toFixed(1)} px in a second at ${t0}s`);
      assert.ok(Math.abs(b.zoom - a.zoom) < 0.01 && Math.abs(b.turn - a.turn) < 0.01, `sheet ${i} jumped at ${t0}s`);
    }
  }
});

test('schematic: the sheets drift with the cursor, as the deepest layer', () => {
  const { Schematic } = loadSchematic();
  const { w } = Schematic.SHEET;
  for (let i = 0; i < 3; i++) {
    const a = Schematic.place(i, 10, { x: 0, y: 0 }), b = Schematic.place(i, 10, { x: 1, y: 0 });
    // The point at the middle of the frame slides back along the sheet: the sheet moves
    // the way the cursor did.
    const d = (b.x - a.x) - w * Math.round((b.x - a.x) / w);
    assert.ok(d < -30, `sheet ${i} moved ${d.toFixed(1)} px along itself`);
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node tools/test.js`
Expected: the three `schematic:` tests FAIL (ENOENT, no `schematic.js`), plus the pre-existing rig failure: `4 failing`.

- [ ] **Step 3: Export `gearPath` from Mech**

In `wallpaper/js/mech.js`, change the last line of the module:

```js
  return { Assembly, PALETTES, Mat, gearDims };
```

to:

```js
  return { Assembly, PALETTES, Mat, gearDims, gearPath };
```

- [ ] **Step 4: Write `wallpaper/js/schematic.js`**

```js
'use strict';
// Schematics: dim drafting sheets behind the whole scene, like the technical drawings in
// the opening: compass circles and dials, gear trains in outline, squares, diamonds and
// zig-zags, long construction lines, rulers, crosshairs and scribbled graphite, in pen on
// grubby paper. They go in the way you'd lay a scan of such a drawing into Photoshop, in
// Lighten at a low opacity: the black behind everything lifts to a dim warm paper and the
// lines stay dark. The whole scene is drawn over them, and the pool of dark it keeps
// around the centrepiece dims them there.
//
// Three sheets, baked once, tile; each frame they're double-exposed. Each drifts its own
// slow way, slowly zooms and turns a little, and fades in and out on a long cycle a third
// of a cycle apart from the others, so one drawing slowly gives way to the next while
// there's always as much drawing.
const Schematic = (() => {
  const { TAU, canvas, rng, pfbm2, smooth } = Kit;

  // A sheet, in design px: bigger than the frame, so its repeats lie far apart.
  const SHEET = { w: 3200, h: 2000 };
  const FADE = 84; // s for a sheet to fade in, out and back in
  // Each sheet: its drawing, how big it's shown and how it's turned (rad), how fast it
  // drifts (design px/s) and how much it drifts with the cursor; and the periods (s) of
  // its slow zoom and turn.
  const SHEETS = [
    { seed: 11, zoom: 1, turn: -0.06, v: [4.2, -1.6], par: 1.1, zp: 170, tp: 230 },
    { seed: 23, zoom: 1.35, turn: 0.05, v: [-3.1, 2.4], par: 0.9, zp: 205, tp: 190 },
    { seed: 37, zoom: 0.8, turn: 0.12, v: [1.6, 3.4], par: 1.25, zp: 150, tp: 260 },
  ];
  const INK = '22,18,26';      // the pen: a purplish black, as in the opening
  const PAPER = '255,226,200'; // the paper, in the scene's warm light

  // How far each sheet has faded in at time t (0 to 1). A third of a cycle apart, so they
  // always add up to one and a half.
  const fades = t => SHEETS.map((_, i) => 0.5 + 0.5 * Math.sin(TAU * (t / FADE + i / 3)));

  // Where sheet i lies at time t: the point of it at the middle of the frame (design px,
  // inside the sheet), how big it's shown and how it's turned. `cam` is the cursor as the
  // near air follows it; the sheets drift with it, deepest of all.
  function place(i, t, cam) {
    const s = SHEETS[i], P = 42 * s.par, wrap = (v, n) => ((v % n) + n) % n;
    return {
      x: wrap(i * 977 + s.v[0] * t - cam.x * P, SHEET.w),
      y: wrap(i * 613 + s.v[1] * t - cam.y * P * 0.7, SHEET.h),
      zoom: s.zoom * (1 + 0.08 * Math.sin(TAU * t / s.zp + i * 2.1)),
      turn: s.turn + 0.035 * Math.sin(TAU * t / s.tp + i * 1.3),
    };
  }

  // ---------- The pen ----------
  const pen = (g, w, a) => { g.lineWidth = w; g.globalAlpha = a; };

  function trace(g, pts) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }

  // A ruled line, drawn by hand: it bows a hair and wavers. Its ends stay put, so a line
  // right across the sheet meets itself where the sheet repeats.
  function line(g, r, x0, y0, x1, y1, wob = 1) {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1, n = Math.max(2, Math.ceil(len / 50));
    const nx = (y0 - y1) / len, ny = (x1 - x0) / len;
    const bow = (r() - 0.5) * Math.min(14, len * 0.01) * wob, ph = r() * TAU, pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, d = Math.sin(u * Math.PI) * (bow + Math.sin(u * TAU * 3 + ph) * 0.9 * wob);
      pts.push([x0 + (x1 - x0) * u + nx * d, y0 + (y1 - y0) * u + ny * d]);
    }
    trace(g, pts);
  }

  // Straight edges through the points, each ruled by hand; closed unless asked not to be.
  function poly(g, r, pts, close = true) {
    for (let i = 0; i < pts.length - (close ? 0 : 1); i++) line(g, r, ...pts[i], ...pts[(i + 1) % pts.length], 0.6);
  }

  // A compass circle or arc of radius R about the origin, its radius wavering a little. A
  // whole circle runs on a little past where it began, as a drawn one does.
  function arc(g, r, R, a0 = 0, a1 = TAU, wob = 1) {
    const end = a1 - a0 >= TAU - 1e-9 ? a1 + 0.05 + r() * 0.25 : a1;
    const n = Math.max(16, Math.ceil(R * (end - a0) / 24)), ph = r() * TAU, amp = Math.min(2.5, 0.5 + R * 0.004) * wob, pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (end - a0) * i / n, rr = R + Math.sin(a * 2 + ph) * amp;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    trace(g, pts);
  }

  // ---------- What's drawn: each about the origin, with its own randomness `r` ----------

  // A centre mark or crosshair: a cross, often ringed, now and then a dot.
  function mark(g, r, s) {
    pen(g, 1.4 + r() * 0.8, 0.5 + r() * 0.4);
    line(g, r, -s, 0, s, 0, 0.3);
    line(g, r, 0, -s, 0, s, 0.3);
    if (r() < 0.6) arc(g, r, s * 0.55, 0, TAU, 0.3);
    if (r() < 0.3) { g.beginPath(); g.arc(0, 0, s * 0.18, 0, TAU); g.fill(); }
  }

  // A dial: rings, often a chapter of ticks, a few radii and a centre mark; now and then a
  // pair of opposite wedges shaded in, like a pendulum's sweep.
  function dial(g, r, R) {
    pen(g, 2.4 + r() * 1.6, 0.55 + r() * 0.35);
    arc(g, r, R);
    for (let j = 1, n = Math.floor(r() * 3); j <= n; j++) {
      pen(g, 1.4 + r() * 1.2, 0.4 + r() * 0.4);
      arc(g, r, R * (1 - j * (0.05 + r() * 0.09)));
    }
    if (r() < 0.65) {
      const n = [12, 24, 36, 60, 72][Math.floor(r() * 5)];
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU, big = i % (n / 12) === 0, r0 = R * (big ? 0.86 : 0.92);
        pen(g, big ? 2.2 : 1.3, 0.6);
        line(g, r, Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98, 0.3);
      }
    }
    for (let i = 0, n = Math.floor(r() * 3); i < n; i++) {
      const a = r() * TAU, len = R * (0.6 + r() * 0.5);
      pen(g, 1.4 + r(), 0.5 + r() * 0.3);
      line(g, r, 0, 0, Math.cos(a) * len, Math.sin(a) * len);
    }
    if (r() < 0.35) {
      const a = r() * TAU, w = 0.25 + r() * 0.3;
      g.globalAlpha = 0.18 + r() * 0.2;
      g.beginPath();
      g.moveTo(0, 0); g.arc(0, 0, R * 0.8, a - w, a + w); g.closePath();
      g.moveTo(0, 0); g.arc(0, 0, R * 0.8, a + Math.PI - w, a + Math.PI + w); g.closePath();
      g.fill();
    }
    mark(g, r, 10 + R * 0.03);
  }

  // A gear and one or two more meshing with it (design px about the first's centre), and
  // how far they reach.
  function layout(r, pitch, teeth) {
    const gears = [{ x: 0, y: 0, G: Mech.gearDims(pitch, teeth) }];
    for (let j = 1, n = 1 + Math.floor(r() * 3); j < n; j++) {
      const from = gears[j - 1], G = Mech.gearDims(pitch, 10 + Math.floor(r() * 30)), a = r() * TAU, d = from.G.rp + G.rp;
      gears.push({ x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d, G });
    }
    return { gears, R: Math.max(...gears.map(q => Math.hypot(q.x, q.y) + q.G.r)) };
  }

  // The gears in outline, their pitch circles often dashed in and their centres marked.
  function train(g, r, gears) {
    for (const { x, y, G } of gears) {
      g.save();
      g.translate(x, y);
      mark(g, r, 8 + G.r * 0.05);
      g.rotate(r() * TAU);
      const spokes = r() < 0.6 ? 3 + Math.floor(r() * 4) : 0;
      pen(g, 2 + r() * 1.6, 0.5 + r() * 0.4);
      g.stroke(Mech.gearPath(G, { spokes, curved: r() < 0.5, holes: spokes ? 0 : 3 + Math.floor(r() * 4) }));
      if (r() < 0.6) {
        pen(g, 1.3, 0.4);
        g.setLineDash([12, 9]);
        g.beginPath(); g.arc(0, 0, G.rp, 0, TAU); g.stroke();
        g.setLineDash([]);
      }
      g.restore();
    }
  }

  // A construction: squares nested, each turned to sit corner-in inside the last; a chain
  // of diamonds; zig-zags or square steps; or a polygon in its circle, with its diagonals.
  function figure(g, r, R) {
    const kind = Math.floor(r() * 4);
    g.rotate(r() < 0.5 ? 0 : r() * TAU);
    pen(g, 1.8 + r() * 1.6, 0.45 + r() * 0.4);
    if (kind === 0) {
      for (let j = 0, n = 3 + Math.floor(r() * 3), s = R; j < n; j++, s *= Math.SQRT1_2) {
        const a = Math.PI / 4 * (j + 1);
        poly(g, r, [0, 1, 2, 3].map(i => [Math.cos(a + i * Math.PI / 2) * s, Math.sin(a + i * Math.PI / 2) * s]));
      }
    } else if (kind === 1) {
      const n = 3 + Math.floor(r() * 5), d = R * 2 / n;
      for (let i = 0; i < n; i++) {
        const x = -R + d * (i + 0.5);
        poly(g, r, [[x - d / 2, 0], [x, -d / 2], [x + d / 2, 0], [x, d / 2]]);
      }
    } else if (kind === 2) {
      const n = 4 + Math.floor(r() * 6), d = R * 2 / n, steps = r() < 0.5, pts = [];
      for (let i = 0; i <= n; i++) {
        const x = -R + d * i, y = (i % 2 ? -1 : 1) * d / 2;
        if (steps && i) pts.push([x, pts[pts.length - 1][1]]);
        pts.push([x, y]);
      }
      poly(g, r, pts, false);
    } else {
      const n = 3 + Math.floor(r() * 4), pts = Array.from({ length: n }, (_, i) => [Math.cos(i / n * TAU) * R, Math.sin(i / n * TAU) * R]);
      arc(g, r, R);
      poly(g, r, pts);
      pen(g, 1.2, 0.35);
      for (let i = 0; i < n; i++) for (let j = i + 2; j < n - (i === 0 ? 1 : 0); j++) line(g, r, ...pts[i], ...pts[j], 0.5);
    }
  }

  // A rule: a long strip with ticks along one edge, longer every fifth and tenth.
  function ruler(g, r, L, a) {
    g.rotate(a);
    const w = 22 + r() * 18, step = 9 + r() * 7;
    pen(g, 1.8 + r(), 0.5 + r() * 0.3);
    poly(g, r, [[-L / 2, -w / 2], [L / 2, -w / 2], [L / 2, w / 2], [-L / 2, w / 2]]);
    pen(g, 1.2, 0.5);
    for (let i = 0, x = -L / 2 + step; x < L / 2; i++, x += step) {
      line(g, r, x, -w / 2, x, -w / 2 + w * (i % 10 === 9 ? 0.7 : i % 5 === 4 ? 0.5 : 0.3), 0.2);
    }
  }

  // Shading: parallel strokes across a disc or a wedge of one.
  function hatch(g, r, R) {
    const a = r() * Math.PI, gap = 6 + r() * 6, a0 = r() * TAU, w = 0.5 + r() * 1.5;
    g.save();
    g.beginPath();
    if (r() < 0.5) { g.moveTo(0, 0); g.arc(0, 0, R, a0, a0 + w); g.closePath(); } else g.arc(0, 0, R, 0, TAU);
    g.clip();
    g.rotate(a);
    pen(g, 1.2 + r() * 0.8, 0.3 + r() * 0.3);
    for (let y = -R; y <= R; y += gap) line(g, r, -R, y, R, y, 0.3);
    g.restore();
  }

  // Graphite scribbled into a dark mass: hundreds of short looping strokes, thickest in
  // the middle and thinning out raggedly.
  function scribble(g, r, R) {
    for (let i = 0, n = Math.round(240 + R * 1.4); i < n; i++) {
      const d = R * Math.sqrt(r()) * (0.6 + 0.4 * r()), a = r() * TAU;
      let x = Math.cos(a) * d, y = Math.sin(a) * d * 0.75, h = r() * TAU;
      pen(g, 1.2 + r() * 1.4, (0.06 + 0.2 * (1 - d / R)) * (0.6 + 0.4 * r()));
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 7; j++) { h += (r() - 0.5) * 2.4; x += Math.cos(h) * 16; y += Math.sin(h) * 16; g.lineTo(x, y); }
      g.stroke();
    }
  }

  // ---------- A sheet ----------

  // The things on sheet `seed`, each { x, y, R (how far it reaches), draw(g) }. Each keeps
  // its own randomness, so it draws the same every time it's drawn.
  function things(seed) {
    const r = rng(seed), { w: W, h: H } = SHEET, out = [];
    const add = (R, draw, x = r() * W, y = r() * H) => {
      const s = Math.floor(r() * 2 ** 31);
      out.push({ x, y, R, draw: g => draw(g, rng(s)) });
    };
    // Construction lines right across the sheet: mostly level or upright, a few slanting,
    // some ruled twice, close together.
    for (let i = 0, n = 8 + Math.floor(r() * 5); i < n; i++) {
      const kind = r(), gaps = r() < 0.3 ? [0, 7 + r() * 9] : [0];
      const rule = (x0, y0, x1, y1) => (g, q) => {
        pen(g, 1.6 + q() * 1.4, 0.3 + q() * 0.35);
        const len = Math.hypot(x1 - x0, y1 - y0), nx = (y0 - y1) / len, ny = (x1 - x0) / len;
        for (const d of gaps) line(g, q, x0 + nx * d, y0 + ny * d, x1 + nx * d, y1 + ny * d, 1.5);
      };
      if (kind < 0.4) add(W / 2 + 20, rule(-W / 2, 0, W / 2, 0), W / 2, r() * H);
      else if (kind < 0.8) add(H / 2 + 20, rule(0, -H / 2, 0, H / 2), r() * W, H / 2);
      else {
        const a = (r() - 0.5) * 1.2 + (r() < 0.5 ? 0 : Math.PI / 2), L = 900 + r() * 1300, c = Math.cos(a) * L / 2, s = Math.sin(a) * L / 2;
        add(L / 2 + 20, rule(-c, -s, c, s));
      }
    }
    // Dials and compass work, from small to most of the frame.
    for (let i = 0, n = 4 + Math.floor(r() * 4); i < n; i++) {
      const R = 120 + r() ** 1.5 * 620;
      add(R * 1.12 + 10, (g, q) => dial(g, q, R)); // its radii run out to 1.1 R
    }
    // Gear trains.
    for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) {
      const lay = layout(rng(Math.floor(r() * 2 ** 31)), 16 + r() * 30, 14 + Math.floor(r() * 46));
      add(lay.R + 30, (g, q) => train(g, q, lay.gears));
    }
    // Constructions.
    for (let i = 0, n = 7 + Math.floor(r() * 5); i < n; i++) {
      const R = 60 + r() * 260;
      add(R * 1.5, (g, q) => figure(g, q, R));
    }
    // Rulers, mostly level or upright.
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
      const L = 400 + r() * 900, a = r() < 0.6 ? Math.floor(r() * 4) * Math.PI / 2 : r() * TAU;
      add(L / 2 + 40, (g, q) => ruler(g, q, L, a));
    }
    // Small holes and pivots, some filled; and crosshairs.
    for (let i = 0, n = 30 + Math.floor(r() * 25); i < n; i++) {
      const s = 4 + r() ** 2 * 26;
      add(s + 6, (g, q) => {
        pen(g, 1.4 + q(), 0.4 + q() * 0.4);
        arc(g, q, s, 0, TAU, 0.4);
        if (q() < 0.25) { g.beginPath(); g.arc(0, 0, s * 0.5, 0, TAU); g.fill(); }
      });
    }
    for (let i = 0, n = 16 + Math.floor(r() * 14); i < n; i++) {
      const s = 8 + r() * 22;
      add(s + 6, (g, q) => mark(g, q, s));
    }
    // Shading.
    for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) {
      const R = 60 + r() * 160;
      add(R + 6, (g, q) => hatch(g, q, R));
    }
    // Fine upright streaks, as where the opening's frames double up.
    if (r() < 0.7) {
      const x0 = r() * W;
      for (let i = 0; i < 26; i++) {
        const L = 60 + r() ** 2 * 380;
        add(L / 2 + 6, (g, q) => { pen(g, 1 + q() * 1.2, 0.15 + q() * 0.3); line(g, q, 0, -L / 2, 0, L / 2, 0.4); }, x0 + (r() - 0.5) * 700, r() * H);
      }
    }
    // Graphite scribbled into a dark mass, over the rest.
    for (let i = 0, n = 1 + Math.floor(r() * 2); i < n; i++) {
      const R = 140 + r() * 200;
      add(R + 130, (g, q) => scribble(g, q, R));
    }
    return out;
  }

  // Draw `fn` (in design px about the origin) at x, y on the sheet, and again a sheet's
  // width or height away wherever its reach R crosses an edge, so the sheet tiles.
  function wrapped(g, x, y, R, fn) {
    const { w: W, h: H } = SHEET;
    for (const dx of [-W, 0, W]) {
      for (const dy of [-H, 0, H]) {
        const X = x + dx, Y = y + dy;
        if (X + R < 0 || X - R > W || Y + R < 0 || Y - R > H) continue;
        g.save();
        g.translate(X, Y);
        fn();
        g.restore();
      }
    }
  }

  // The paper's grime: broad soft blotches and a finer mottle. It tiles, so it's stretched
  // over the sheet whole.
  function grime(seed) {
    const n = 192, P = 4, c = canvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n);
    for (let y = 0, i = 0; y < n; y++) {
      for (let x = 0; x < n; x++, i += 4) {
        const u = x / n * P, v = y / n * P;
        const broad = pfbm2(u, v, P, seed, 3), fine = pfbm2(u * 4, v * 4, P * 4, seed + 5, 3);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * (1 - 0.22 * smooth(0.4, 0.75, broad) - 0.08 * fine);
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Sheet `seed` at k px per design px (a whole number of px across and down, so it tiles).
  function sheet(seed, k) {
    const c = canvas(Math.round(SHEET.w * k), Math.round(SHEET.h * k)), g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(grime(seed), 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    g.setTransform(k, 0, 0, k, 0, 0);
    g.strokeStyle = g.fillStyle = `rgb(${INK})`;
    g.lineCap = g.lineJoin = 'round';
    for (const it of things(seed)) wrapped(g, it.x, it.y, it.R, () => it.draw(g));
    return c;
  }

  class Sheets {
    constructor() { this.cam = { x: 0, y: 0 }; this.tiles = null; this.px = 0; this.k = 1; this.pats = []; }

    // Bake the sheets at about half the frame's resolution (they're seen soft, far
    // behind), and again only when that changes. Their width is a multiple of 8 px, so
    // their height (5/8 of it) is a whole number too.
    build(view) {
      const px = 8 * Math.max(1, Math.round(SHEET.w * Math.min(0.5, view.S * 0.5) / 8));
      if (this.tiles && px === this.px) return;
      this.px = px;
      this.k = px / SHEET.w;
      this.tiles = SHEETS.map(s => sheet(s.seed, this.k));
      this.pats = [];
    }

    // `a`: how far the paper lifts the black (Lighten's opacity, 0 to 1).
    draw(ctx, view, t, a) {
      if (!this.tiles || a <= 0) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // The paper: the black lifted a little toward the scene's warm light.
      ctx.globalCompositeOperation = 'lighten';
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = `rgb(${PAPER})`;
      ctx.fillRect(0, 0, view.W, view.H);
      // The drawings on it: each sheet multiplied in as far as it has faded in, turned and
      // zoomed about the middle of the frame.
      ctx.globalCompositeOperation = 'multiply';
      const cx = view.ox + 1280 * view.S, cy = view.oy + 720 * view.S;
      fades(t).forEach((f, i) => {
        if (f < 0.004) return;
        const p = place(i, t, this.cam), pat = this.pats[i] || (this.pats[i] = ctx.createPattern(this.tiles[i], 'repeat'));
        pat.setTransform(new DOMMatrix().translate(cx, cy).rotate(p.turn * 180 / Math.PI)
          .scale(view.S * p.zoom).translate(-p.x, -p.y).scale(1 / this.k));
        ctx.globalAlpha = f;
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, view.W, view.H);
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  return { Sheets, SHEET, SHEETS, FADE, fades, place };
})();
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node tools/test.js`
Expected: the three `schematic:` tests print `ok`; `1 failing` (the pre-existing rig test only).

- [ ] **Step 6: Wire it into the wallpaper**

`wallpaper/index.html`: after `<script src="js/atmos.js"></script>` add:

```html
<script src="js/schematic.js"></script>
```

`wallpaper/js/main.js`, after the line `const texture = () => Config.get('texture') / 50;`:

```js
  // The schematics: dim drafting sheets the whole scene is drawn over. The setting (0-100,
  // 50 as designed) scales how far their paper lifts the black.
  const sheets = new Schematic.Sheets();
  const schematic = () => Config.get('schematic') / 50;
```

and change `backdrop.cam = scene.dust.cam;` to:

```js
  backdrop.cam = sheets.cam = scene.dust.cam;
```

In `buildSprites()`, after `backdrop.build(view, f);`:

```js
    sheets.build(view);
```

In `render(t)`, right after `ctx.fillRect(0, 0, view.W, view.H);`:

```js
    // The schematics first: the paper everything else is drawn on.
    const sk = schematic();
    if (sk > 0) sheets.draw(ctx, view, t, 0.06 * sk);
```

- [ ] **Step 7: Add the setting**

`wallpaper/js/config.js`: in the header comment, after the `texture:` lines, add:

```js
//   schematic: 0-100, how strong the schematics behind everything are: dim drafting
//              sheets that slowly change (50 as designed, 0 turns them off)
```

and in `defaults`, after `texture: 50,` add `schematic: 50,`.

`wallpaper/project.json`: after the `"texture"` property add the following, and renumber `motion`, `parallax`, `shift` to orders 105, 106, 107:

```json
      "schematic": {
        "order": 104,
        "text": "Schematic strength",
        "type": "slider",
        "min": 0,
        "max": 100,
        "value": 50
      },
```

`wallpaper/LivelyProperties.json`: after the `"texture"` entry add:

```json
  "schematic": {
    "type": "slider",
    "value": 50,
    "min": 0,
    "max": 100,
    "step": 1,
    "text": "Schematic strength"
  },
```

`tools/preview.html`: after the Texture group add:

```html
  <div class="group" title="How strong the schematics behind everything are: dim drafting sheets that slowly change. 0 turns them off, 50 as designed">
    <span class="label">Schematic</span>
    <input data-key="schematic" type="range" min="0" max="100" step="5" aria-label="Schematic strength"><output></output>
  </div>
```

add `'schematic'` after `'texture'` in `SETTINGS`, and `schematic: num('schematic', 50),` after `texture: num('texture', 50),` in `st`.

- [ ] **Step 8: Look at it and tune**

Open `/wallpaper/?still=8&cursor=0,0` (viewport 1280×720), then `still=40` and `still=80` to see the sheets change, and `schematic=0`, `schematic=100`, `centre=time`. Repeat `still=8` at 1920×1080 and 2560×1440 (zooming into regions to judge detail). Read a few background pixels with `javascript_tool` (inspection only).

Expected: the black reads as a dim warm paper of about 14–18/255 at 50, with dark pen drawings across it that are plainly there but below the clockwork. Makise and the digits keep their dark pool. No seams where a sheet repeats. The solid gears still read as dark silhouettes. If not, tune these, in this order: the `0.06` in `main.js`; line weights in `pen()` calls; `PAPER`; and the number of things per sheet. A seam means a `wrapped()` reach is too small.

- [ ] **Step 9: Measure the cost**

On the live `/wallpaper/?schematic=0` and then `?schematic=50` at 2560×1440, wait about 5 s, then read `SG.state().ms` for each.
Expected: under 1 ms apart.

- [ ] **Step 10: Docs**

`README.md`:
- First paragraph: after "…an escapement," add "over dim drafting sheets that slowly change,".
- Settings table, after Texture strength: `| Schematic strength | 0–100: the dim drafting sheets behind everything (0 turns them off) | 50 |`.
- "How it behaves", after the **Texture** bullet:
  `- **Schematics** lie behind everything, like the technical drawings in the opening: compass circles and dials, gear trains, squares, diamonds and zig-zags, construction lines, rulers and scribbled graphite, in pen on grubby paper. They go in the way you'd lay a scan of a drawing into Photoshop, in Lighten at a low opacity, so the black lifts to a dim warm paper and the lines stay dark. Three sheets are double-exposed: each drifts its own way, slowly zooms and turns, and fades in and out over about a minute and a half, so one drawing slowly gives way to another. The pool of dark around the centrepiece dims them there.`
- Performance: `- The schematics are baked once, three sheets at about half the frame's resolution; each frame lays them over the frame with four fills.`
- Preview settings list: add "schematic strength". URL parameters: add `schematic=0-100` after `texture=0-100`.
- Code layout table, after `atmos.js`: `| \`schematic.js\` | The schematics: drafting sheets drawn in code, double-exposed and slowly changing behind everything |`.

`workshop/WORKSHOP.md`: in Features, after the "Living ink…" bullet add `[*]Dim drafting schematics behind everything, slowly drifting and changing, like the opening's`; in Settings change the ink/texture line to `[*][b]Ink strength[/b], [b]Texture strength[/b] and [b]Schematic strength[/b]`.

- [ ] **Step 11: Run the tests**

Run: `node tools/test.js`
Expected: `1 failing` (the pre-existing rig test only).

- [ ] **Step 12: Commit**

```bash
git add wallpaper/js/schematic.js wallpaper/js/mech.js wallpaper/js/main.js wallpaper/js/config.js wallpaper/index.html wallpaper/project.json wallpaper/LivelyProperties.json tools/preview.html tools/test.js README.md workshop/WORKSHOP.md
git commit -m "Lay dim, slowly changing schematics behind the scene"
```

---

## As built

Tuning by eye changed a few numbers from the code above:

- **Gears:** the big gear sits at x −240 (not −200) and the small one meshes at angle −1.2
  (not −1.3). At −200 its rim came within a few px of her coat at the bottom; this keeps
  both gears on the edge and clear of her above the fade.
- **Fades:** `clamp(0.5 + 0.75 sin …)` instead of `0.5 + 0.5 sin …`. With pure sines each
  sheet spent most of its time half faded, which halved its lines' darkness and made them
  unreadable. Now each sheet rests fully in (and fully out) for about a quarter of its
  cycle, and 1.25–1.75 sheets show at any time. The test checks that instead of a
  constant 1.5.
- **Pen:** a `PEN` multiplier (widths ×1.7, darkness ×1.4), denser and darker scribbles
  (400 + 2.2 R strokes, alpha 0.08–0.38), and lighter grime (0.15 broad, 0.06 fine).
- **Strength:** the paper's opacity at 50 is 0.09 (not 0.06), so the paper sits at
  about 17–23/255 in the open middle of the frame.
- **Measured:** 0.38 ms a frame at 2560×1440 (0.40 at 1080p, 0.82 at 4K), plus a one-off
  bake of 27–43 ms.
