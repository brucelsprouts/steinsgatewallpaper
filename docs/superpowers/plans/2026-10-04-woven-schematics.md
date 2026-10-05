# Woven Schematics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate schematic figures with one connected drafting drawing that
slowly redraws itself: dimmer, lines first, with a clear middle. Also sharpen the giant
clocks.

**Architecture:** `wallpaper/js/schematic.js` is rewritten around clusters. A cluster is
one line, sometimes ruled twice, plus the shapes on it.
- A pure-JS model places each new line where a density grid says the drawing is thinnest,
  and hangs shapes off it at its crossings and along it.
- The model runs the clusters' lives (draw on, stay, erase), the glints and the shift.
- It tracks which lines and shapes are settled.
- The renderer caches the settled ones in a sheet canvas, and draws only what moves each
  frame.
- The result goes onto the black with Screen, as now.

`scene.js` gets lighter blur and full resolution on the three deep sprites.

**Tech Stack:** Plain JS and Canvas 2D, with no build step. Node `vm` tests in
`tools/test.js`, and headless Chrome stills.

## Global Constraints

- No build step. Scripts load in `wallpaper/index.html` order, and `kit.js` comes before
  `schematic.js`.
- Design space is 2560×1440. `view = { S, ox, oy, W, H }`, and `scene.meterOffset(t)`
  gives the centrepiece's offset in design px.
- Deterministic for stills: all randomness comes from the seeded `Kit.rng` passed in.
- The schematics should cost under 1 ms a frame on average at 1440p, and a few ms for a
  sheet redraw.
- A single line sits about 6–12 levels over the black at 1440p at strength 50, below the
  deep clockwork.
- No gears. No diamonds side by side. Three dials at most. Lines carry more ink than
  shapes.
- `node tools/test.js`: the rig test "at its strongest nothing folds over or tears" fails
  before this work and is out of scope (a separate session is fixing it). Expect
  `1 failing` unless that fix has landed.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Sharper giant clocks

**Files:**
- Modify: `wallpaper/js/scene.js` (the three deep assemblies in `compose()`)

**Interfaces:** none (it's data).

- [ ] **Step 1: Lighter blur, full resolution**

In `compose()`, change:

```js
      new A({ x: 380, y: -300, depth: -0.8, blur: 1.4, res: 0.8, alpha: 0.2, rx: 0.2, ry: 0.05, seed: 3, drift: 10,
```
to
```js
      new A({ x: 380, y: -300, depth: -0.8, blur: 0.35, res: 1, alpha: 0.2, rx: 0.2, ry: 0.05, seed: 3, drift: 10,
```

then

```js
      new A({ x: 2000, y: 560, depth: -0.6, blur: 1.6, res: 0.8, alpha: 0.12, rx: 0.22, ry: -0.2, roll: 0.1, seed: 1, hands: 0.7,
```
to
```js
      new A({ x: 2000, y: 560, depth: -0.6, blur: 0.4, res: 1, alpha: 0.12, rx: 0.22, ry: -0.2, roll: 0.1, seed: 1, hands: 0.7,
```

and

```js
      new A({ x: 2330, y: 1330, depth: -0.45, blur: 1.2, res: 0.85, alpha: 0.1, rx: 0.15, ry: 0.2, seed: 2,
```
to
```js
      new A({ x: 2330, y: 1330, depth: -0.45, blur: 0.35, res: 1, alpha: 0.1, rx: 0.15, ry: 0.2, seed: 2,
```

Above the half clock's comment, add a line saying why they're sharp:

```js
      // ---- Deep clockwork ----
      // Sharp, but faint: the depth is in how dim they are and how they move, not in blur.
```

- [ ] **Step 2: Look at it**

Take a still with the scratchpad's `shoot.sh`: `wallpaper/index.html?still=8&cursor=0,0`
at 2560×1440. Crop the astrolabe (x 1250–1850, y 300–900) and the half clock (x 0–600,
y 140–480). The numerals and tick marks should be crisp, as in the right half of
`shots/clocks-sharpen.png`.

- [ ] **Step 3: Commit**

```bash
git add wallpaper/js/scene.js
git commit -m "Sharpen the giant clocks: faint, not blurred

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The woven drawing

**Files:**
- Rewrite: `wallpaper/js/schematic.js`
- Modify: `tools/test.js`, replacing the schematic section from
  `// ---------- Schematics:` down to just before `process.exitCode`.

**Interfaces:**
- Consumes: `Kit` (`TAU, canvas, clamp, smooth, ease, stepped, fbm2`).
- Produces: `Schematic.Field(random)`, with these members:
  - `cam`;
  - `build(view)`;
  - `keepClear(focus)`;
  - `update(t)`;
  - `shift(t)`;
  - `draw(ctx, view, t, a, m)`;
  - for the tests: `items`, `lines`, `clusters`, `glints`, `staying()`, `retired`,
    `redraws`.

  Each item has these fields:
  - `kind`, `k`, `lw`, `born`, `inT`, `dies`, `outT`, `cut`, `leaving`, `inSheet`, `deps`;
  - lines also have `x0, y0, x1, y1, len, ux, uy, nx, ny, twin, xs`;
  - shapes also have `x, y, u`, plus the fields of their own kind.

  `Schematic` also exports `KINDS`, `SHAPES`, `COUNT`, `AGE`, `stagger`, `phase`,
  `reach` and `cross`.

- [ ] **Step 1: Write the tests**

Replace the schematic section of `tools/test.js` with:

```js
// ---------- Schematics: the woven drawing, its lines and shapes, where they go and their lives (nothing is drawn without a screen) ----------

function loadSchematic() {
  const ctx = { Math };
  vm.createContext(ctx);
  const src = ['kit.js', 'schematic.js'].map(f => fs.readFileSync(path.join(__dirname, '../wallpaper/js', f), 'utf8')).join('\n;\n');
  vm.runInContext(src + ';this.Kit = Kit; this.Schematic = Schematic;', ctx);
  return ctx;
}

// A drawing run at 30 fps from the start to `until` s, `each(t, field, Schematic)` called every half second.
const MAKISE_FOCUS = { x: 600, y: 790, rx: 720, ry: 800 };
function runField(seed, until, each) {
  const { Kit, Schematic } = loadSchematic();
  const field = new Schematic.Field(Kit.rng(seed));
  field.keepClear(MAKISE_FOCUS);
  for (let k = 0; k <= until * 30; k++) {
    field.update(k / 30);
    if (k % 15 === 0 && each) each(k / 30, field, Schematic);
  }
  return { field, Schematic };
}
const isLine = e => e.kind === 'line';
// How far x, y lies from line l (design px).
function offLine(l, x, y) {
  const dx = l.x1 - l.x0, dy = l.y1 - l.y0, u = Math.max(0, Math.min(1, ((x - l.x0) * dx + (y - l.y0) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(l.x0 + dx * u - x, l.y0 + dy * u - y);
}

test('schematic: lines draw on along their length, and their shapes start as the pen passes them', () => {
  const { Kit, Schematic: S } = loadSchematic();
  const f = { born: 10, inT: 3, dies: 50, outT: 2 };
  assert.deepStrictEqual(S.phase(f, 10), [0, 0]);
  assert.deepStrictEqual(S.phase(f, 13), [1, 0]);
  assert.deepStrictEqual(S.phase(f, 52), [1, 1]);
  for (const n of [1, 3, 5]) {
    for (let i = 0; i < n; i++) {
      assert.strictEqual(S.stagger(0, i, n), 0);
      assert.strictEqual(S.stagger(1, i, n), 1);
      if (i) assert.ok(S.stagger(0.3, i, n) <= S.stagger(0.3, i - 1, n), 'a later part ran ahead of an earlier one');
    }
  }
  for (let i = 0; i <= 20; i++) {
    assert.ok(Math.abs(Kit.ease.inOut(S.reach(i / 20)) - i / 20) < 1e-9, `the pen isn't ${i / 20} of the way along when it should be`);
  }
  const { field } = runField(3, 120);
  for (const e of field.items) {
    if (isLine(e) || e.leaving) continue;
    const L = e.deps[0], due = L.born + L.inT * S.reach(e.u);
    assert.ok(e.born >= due && e.born <= due + 0.5, `a ${e.kind} started ${(e.born - due).toFixed(2)} s from when the pen passed it`);
  }
});

test('schematic: every shape lies on its lines, and goes when any of them goes', () => {
  let shapes = 0;
  runField(4, 600, (t, field) => {
    for (const e of field.items) {
      if (isLine(e)) continue;
      shapes++;
      const L = e.deps[0], on = [[e.x, e.y, L]];
      if (e.kind === 'link') on.push([e.x1, e.y1, e.deps[1]]);
      else if (e.deps[1]) on.push([e.x, e.y, e.deps[1]]);
      if (e.kind === 'diamond') e.corners.forEach(([x, y], i) => on.push([x, y, e.deps[i % 2]]));
      if (e.n && e.ux != null) { const gap = e.step || e.gap; on.push([e.x + e.ux * gap * (e.n - 1), e.y + e.uy * gap * (e.n - 1), L]); }
      for (const [x, y, l] of on) assert.ok(offLine(l, x, y) < 0.5, `a ${e.kind} ${offLine(l, x, y).toFixed(1)} px off its line`);
      if (!e.leaving) for (const d of e.deps) assert.ok(field.items.includes(d) && !d.leaving, `a ${e.kind} stayed after its line went, at ${t}s`);
    }
  });
  assert.ok(shapes > 1000, `only ${shapes} shapes looked at`);
});

test('schematic: woven: the lines cross one another into one drawing', () => {
  let looked = 0;
  runField(6, 900, (t, field) => {
    if (t < 30 || t % 30) return;
    looked++;
    const lines = field.lines.filter(l => !l.twin);
    const lonely = lines.filter(l => l.xs.filter(c => c.x >= 0 && c.x <= 2560 && c.y >= 0 && c.y <= 1440).length < 2);
    assert.ok(lonely.length <= 1, `${lonely.length} lines crossing fewer than two others at ${t}s`);
    // From any line, through crossings, to every other.
    const seen = new Set([lines[0]]), todo = [lines[0]];
    while (todo.length) for (const c of todo.pop().xs) if (!seen.has(c.o)) { seen.add(c.o); todo.push(c.o); }
    assert.strictEqual(seen.size, lines.length, `only ${seen.size} of ${lines.length} lines joined up at ${t}s`);
  });
  assert.ok(looked >= 29, `looked only ${looked} times`);
});

test('schematic: always the same number of clusters, and always something drawing on or off', () => {
  let quiet = 0, longest = 0;
  runField(5, 3600, (t, field, S) => {
    const n = field.staying();
    assert.ok(n >= S.COUNT - 1 && n <= S.COUNT, `${n} clusters at ${t}s`);
    const busy = field.items.some(e => { const [on, off] = S.phase(e, t); return (on > 0 && on < 1) || (off > 0 && off < 1); });
    quiet = busy ? 0 : quiet + 0.5;
    longest = Math.max(longest, quiet);
  });
  assert.ok(longest <= 8, `nothing drew on or off for ${longest}s`);
});

test('schematic: spread evenly: no dense blob, no bare patch, and no shapes in the clear middle', () => {
  let dense = 0, bare = Infinity;
  runField(7, 1800, (t, field, S) => {
    if (t < 60 || t % 20) return;
    // The line in each block of the frame (256 x 240 px), against the average, leaving out
    // the blocks in the pool of dark round the centrepiece.
    const ink = new Array(60).fill(0);
    for (const e of field.items) {
      if (e.leaving) continue;
      for (const [x, y] of S.KINDS[e.kind].pts(e)) {
        if (x < 0 || x >= 2560 || y < 0 || y >= 1440) continue;
        ink[Math.floor(y / 240) * 10 + Math.floor(x / 256)] += e.k;
      }
    }
    const open = ink.filter((v, i) => Math.hypot(((i % 10) * 256 + 128 - 600) / 720, (Math.floor(i / 10) * 240 + 120 - 790) / 800) > 0.75);
    const mean = open.reduce((s, v) => s + v, 0) / open.length;
    dense = Math.max(dense, Math.max(...open) / mean);
    bare = Math.min(bare, Math.min(...open) / mean);
    for (const e of field.items) {
      if (isLine(e) || e.leaving) continue;
      assert.ok(Math.hypot((e.x - 600) / 720, (e.y - 790) / 800) > 0.25, `a ${e.kind} in the clear middle at ${t}s`);
    }
  });
  assert.ok(dense < 2.5, `a block ${dense.toFixed(2)} times as full as the average`);
  assert.ok(bare > 0.3, `a block only ${bare.toFixed(2)} of the average`);
});

test('schematic: few small shapes, lines first: no gears, no diamonds side by side, three dials at most', () => {
  const { Schematic } = loadSchematic();
  assert.ok(!Schematic.SHAPES.some(k => /gear|train/i.test(k)), 'gears among the shapes');
  runField(8, 1200, (t, field, S) => {
    const staying = field.items.filter(e => !e.leaving), shapes = staying.filter(e => !isLine(e));
    const diamonds = shapes.filter(e => e.kind === 'diamond');
    for (let i = 0; i < diamonds.length; i++) {
      for (let j = i + 1; j < diamonds.length; j++) {
        assert.ok(Math.hypot(diamonds[i].x - diamonds[j].x, diamonds[i].y - diamonds[j].y) >= 300, `diamonds side by side at ${t}s`);
      }
    }
    assert.ok(shapes.filter(e => e.kind === 'dial').length <= 3, `more than three dials at ${t}s`);
    for (const e of shapes) if (e.kind === 'ring') assert.ok(Math.max(...e.radii) <= 80, 'a big ring');
    const ink = list => list.reduce((s, e) => s + S.KINDS[e.kind].pts(e).length * e.k, 0);
    assert.ok(ink(staying.filter(isLine)) >= 2 * ink(shapes), `nearly as much shape as line at ${t}s`);
  });
});

test('schematic: glints run only along lines, turning only where lines cross', () => {
  let seen = 0, turned = 0;
  runField(9, 900, (t, field) => {
    for (const gl of field.glints) {
      seen++;
      assert.ok(field.items.includes(gl.L) && isLine(gl.L) && !gl.L.leaving, 'a glint off any line');
      assert.ok(gl.u >= 0 && gl.u <= 1, 'a glint beyond its line');
      for (let i = 1; i < gl.path.length; i++) {
        const { x, y } = gl.path[i];
        assert.ok(offLine(gl.path[i - 1].L, x, y) < 0.5 && offLine(gl.path[i].L, x, y) < 0.5, 'a glint turned away from a crossing');
        turned++;
      }
    }
  });
  assert.ok(seen > 50 && turned > 0, `${seen} glints seen, ${turned} turns`);
});

test('schematic: a worldline shift wipes the drawing outward from the centrepiece and rules a new one', () => {
  const { Kit, Schematic: S } = loadSchematic();
  const field = new S.Field(Kit.rng(11));
  field.keepClear(MAKISE_FOCUS);
  let t = 0;
  for (; t < 100; t += 1 / 30) field.update(t);
  const before = new Set(field.items);
  field.shift(t);
  // Wiped outward: shapes near the centrepiece go before those far from it.
  const when = near => {
    const s = [...before].filter(e => !isLine(e) && near(Math.hypot(e.x - 600, e.y - 790)));
    return s.reduce((a, e) => a + e.dies, 0) / s.length;
  };
  assert.ok(when(d => d < 700) < when(d => d > 1500), 'the far shapes went first');
  for (const end = t + 2; t < end; t += 1 / 30) field.update(t);
  assert.ok(field.items.every(e => !before.has(e)), 'lines or shapes from before the shift still there after 2 s');
  for (const end = t + 6; t < end; t += 1 / 30) field.update(t);
  assert.ok(field.staying() >= S.COUNT - 2, `only ${field.staying()} clusters 8 s after the shift`);
});

test('schematic: the sheet is drawn afresh only when something starts to erase', () => {
  const { field } = runField(12, 900);
  assert.ok(field.retired > 100, `only ${field.retired} clusters erased in 15 minutes`);
  assert.ok(field.redraws <= field.retired, `${field.redraws} redraws for ${field.retired} clusters erased`);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `node tools/test.js 2>&1 | grep schematic`
Expected: every `schematic:` test FAILs. The old module has no `reach`, `items`,
`lines`, `staying()` and so on.

- [ ] **Step 3: Write the module**

Replace `wallpaper/js/schematic.js` with:

```js
'use strict';
// Schematics: one faint drafting drawing behind the whole scene, like the technical
// drawings in the opening, in light lines on the black. Long lines are ruled across the
// screen, crossing like a hash, and small shapes hang off them: circles strung along a
// line; rings, diamonds, crosshairs and now and then a small dial where lines cross; ruler
// ticks and hatching along them; compass arcs from one crossing through another; links to
// the next line over. It slowly redraws itself, as if being drafted: every few seconds the
// oldest line and its shapes erase themselves, and a new line is ruled where the drawing
// is thinnest, its shapes growing on it as the pen passes them (trim paths, staggered).
// Glints run along the lines, now and then turning where they cross, and the dials tick.
// A worldline shift wipes it outward from the centrepiece and rules a new one. What has
// settled is drawn once into a cached sheet and only what moves is drawn each frame, on a
// layer at about half a px per design px, so it's soft. The layer is laid over the black
// with Screen before anything else is drawn.
const Schematic = (() => {
  const { TAU, canvas, clamp, smooth, ease, stepped, fbm2 } = Kit;

  const LINE = '226,214,198'; // the lines' light: a pale warm white
  const W = 2560, H = 1440;   // the design frame
  const M = 140;              // the sheet's margin round the frame: the parallax never shows its edge
  const COUNT = 48;           // clusters at a time: a line, ruled once or twice, and its shapes
  const AGE = 100;            // s a cluster stays at least, before it may be erased
  const RES = 0.5;            // the layer's px per design px: soft, and the same on any screen
  const P = 42;               // parallax travel in design px per unit of depth
  const DEPTH = -1;           // the drawing's depth: deep, with the backdrop
  const HOLE = 0.7;           // how far out the clear middle fades, in the centrepiece's radii
  const CELL = 80;            // the density grid's cells (design px)
  const STEP = 16;            // how far apart the density samples lie along a stroke (design px)
  const TAIL = 110;           // a glint's length (design px)
  const COLS = Math.ceil((W + 2 * M) / CELL), ROWS = Math.ceil((H + 2 * M) / CELL);

  // ---------- Timing ----------

  // How far part i of n has gone when the whole has gone `u` of the way: the parts go one
  // after another, each starting `s` of a part's time after the one before.
  const stagger = (u, i, n, s = 0.35) => clamp(u * (1 + s * (n - 1)) - i * s);

  // How far e is drawn on, and how far erased, at time t (each 0 to 1, eased).
  const phase = (e, t) => [ease.inOut(clamp((t - e.born) / e.inT)), ease.inOut(clamp((t - e.dies) / e.outT))];

  // How far through its time a line is drawn on when the pen reaches `u` of the way along
  // it (the inverse of ease.inOut).
  const reach = u => (u < 0.5 ? Math.cbrt(u / 4) : 1 - Math.cbrt(2 * (1 - u)) / 2);

  // How big something that pops is: up from nothing with a little overshoot as `u` goes 0
  // to 1, and back down to nothing as `v` does.
  const pop = (u, v) => ease.tick(u) * (1 - ease.inOut(clamp(v)));

  // ---------- Paths ----------
  // Each adds to the path being drawn only its stretch from `a` to `b` (fractions of its
  // length): something drawn `on` of the way and erased `off` of the way shows `off` to `on`.

  function seg(g, x0, y0, x1, y1, a, b) {
    if (b <= a) return;
    g.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a);
    g.lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
  }

  function arcPath(g, x, y, R, a0, sweep, a, b) {
    if (b <= a) return;
    const s = a0 + sweep * a;
    g.moveTo(x + Math.cos(s) * R, y + Math.sin(s) * R);
    g.arc(x, y, R, s, a0 + sweep * b, sweep < 0);
  }

  // Through the points (and back to the first, if closed).
  function polyPath(g, pts, closed, a, b) {
    if (b <= a) return;
    const Q = closed ? [...pts, pts[0]] : pts, lens = [];
    let L = 0;
    for (let i = 1; i < Q.length; i++) { lens.push(Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1])); L += lens[i - 1]; }
    const A = a * L, B = b * L;
    let s = 0, started = false;
    for (let i = 1; i < Q.length; i++) {
      const l = lens[i - 1], e = s + l, [x0, y0] = Q[i - 1], [x1, y1] = Q[i];
      if (e > A && s < B && l > 0) {
        const u0 = Math.max(0, (A - s) / l), u1 = Math.min(1, (B - s) / l);
        if (!started) { g.moveTo(x0 + (x1 - x0) * u0, y0 + (y1 - y0) * u0); started = true; }
        g.lineTo(x0 + (x1 - x0) * u1, y0 + (y1 - y0) * u1);
      }
      s = e;
    }
  }

  // A small circle at x, y, popping in as `u` goes 0 to 1 and out as `v` does.
  function dot(g, x, y, rad, u, v) {
    const k = pop(u, v) * rad;
    if (k < 0.3) return;
    g.moveTo(x + k, y);
    g.arc(x, y, k, 0, TAU);
  }

  // ---------- Samples, for the density ----------
  // Points about STEP apart along a stroke.

  function alongLine(x0, y0, x1, y1) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / STEP));
    return Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);
  }
  function alongArc(x, y, R, a0, sweep) {
    const n = Math.max(4, Math.round(Math.abs(sweep) * R / STEP));
    return Array.from({ length: n }, (_, i) => {
      const a = a0 + sweep * (i + 0.5) / n;
      return [x + Math.cos(a) * R, y + Math.sin(a) * R];
    });
  }
  const around = (x, y, R) => alongArc(x, y, R, 0, TAU);

  // ---------- What's drawn ----------
  // Each kind: `path` adds it to the path being drawn at time t, drawn `on` of the way and
  // erased `off` of the way; `pts`, points along it for the density; `live`, if it moves
  // while it stays, so it's drawn every frame and never into the sheet.
  const KINDS = {
    // A line, drawn on from its start and trimmed off outward from `cut`: from its start
    // (0) when it's erased, from nearest the centrepiece when a shift wipes it.
    line: {
      path(g, e, t, on, off) {
        const c = e.cut, a = c - off * c, b = c + off * (1 - c);
        seg(g, e.x0, e.y0, e.x1, e.y1, 0, Math.min(on, a));
        seg(g, e.x0, e.y0, e.x1, e.y1, b, on);
      },
      pts: e => alongLine(e.x0, e.y0, e.x1, e.y1),
    },

    // Small circles strung along a line, popping in one after another.
    beads: {
      path(g, e, t, on, off) {
        for (let i = 0; i < e.n; i++) {
          dot(g, e.x + e.ux * e.gap * i, e.y + e.uy * e.gap * i, e.rad, stagger(on, i, e.n, 0.5), stagger(off, i, e.n, 0.5));
        }
      },
      pts: e => Array.from({ length: e.n }, (_, i) => around(e.x + e.ux * e.gap * i, e.y + e.uy * e.gap * i, e.rad)).flat(),
    },

    // One to three rings where two lines cross, swept round one after another as by a
    // compass, sometimes with a dot in the middle.
    ring: {
      path(g, e, t, on, off) {
        const n = e.radii.length;
        e.radii.forEach((R, j) => arcPath(g, e.x, e.y, R, e.a0 + j * 0.9, TAU, stagger(off, j, n), stagger(on, j, n)));
        if (e.dot) dot(g, e.x, e.y, 2.4, on, off);
      },
      pts: e => e.radii.flatMap(R => around(e.x, e.y, R)),
    },

    // A diamond on a crossing, its corners on the two lines, drawn round from a corner.
    diamond: {
      path: (g, e, t, on, off) => polyPath(g, e.corners, true, off, on),
      pts: e => e.corners.flatMap((p, i) => alongLine(...p, ...e.corners[(i + 1) % 4])),
    },

    // Crosshairs on a crossing, ringed, popping in.
    mark: {
      path(g, e, t, on, off) {
        const k = pop(on, off) * e.s;
        if (k < 0.5) return;
        const c = Math.cos(e.a) * k, s = Math.sin(e.a) * k;
        g.moveTo(e.x - c, e.y - s); g.lineTo(e.x + c, e.y + s);
        g.moveTo(e.x + s, e.y - c); g.lineTo(e.x - s, e.y + c);
        g.moveTo(e.x + k * 0.55, e.y); g.arc(e.x, e.y, k * 0.55, 0, TAU);
      },
      pts: e => around(e.x, e.y, e.s),
    },

    // Ruler ticks along a stretch of a line, every fifth longer, appearing along it.
    ticks: {
      path(g, e, t, on, off) {
        for (let i = 0; i < e.n; i++) {
          const u = i / (e.n - 1);
          if (u < off || u > on) continue;
          const x = e.x + e.ux * e.step * i, y = e.y + e.uy * e.step * i, L = e.len * (i % 5 ? 1 : 1.8);
          g.moveTo(x + e.nx * L * e.lo, y + e.ny * L * e.lo);
          g.lineTo(x + e.nx * L * e.hi, y + e.ny * L * e.hi);
        }
      },
      pts: e => alongLine(e.x, e.y, e.x + e.ux * e.step * (e.n - 1), e.y + e.uy * e.step * (e.n - 1)),
    },

    // Hatching: a run of short parallel strokes from a line, like the streaks in the
    // opening's drawings, each growing out of the line in turn.
    hatch: {
      path(g, e, t, on, off) {
        for (let i = 0; i < e.n; i++) {
          const x = e.x + e.ux * e.gap * i, y = e.y + e.uy * e.gap * i, L = e.lens[i];
          seg(g, x, y, x + e.dx * L, y + e.dy * L, stagger(off, i, e.n, 0.25), stagger(on, i, e.n, 0.25));
        }
      },
      pts: e => e.lens.flatMap((L, i) => {
        const x = e.x + e.ux * e.gap * i, y = e.y + e.uy * e.gap * i;
        return alongLine(x, y, x + e.dx * L, y + e.dy * L);
      }),
    },

    // A compass arc, centred on one crossing and through another, swept round with the
    // compass's arm showing while it's drawn.
    arc: {
      path(g, e, t, on, off) {
        arcPath(g, e.x, e.y, e.R, e.a0, e.sweep, off, on);
        if (on < 1 && off <= 0) {
          const a = e.a0 + e.sweep * on;
          seg(g, e.x, e.y, e.x + Math.cos(a) * e.R, e.y + Math.sin(a) * e.R, 0, Math.min(1, on * 8));
        }
      },
      pts: e => alongArc(e.x, e.y, e.R, e.a0, e.sweep),
    },

    // A short link from a line to the next one over, drawn out from the first.
    link: {
      path: (g, e, t, on, off) => seg(g, e.x0, e.y0, e.x1, e.y1, off, on),
      pts: e => alongLine(e.x0, e.y0, e.x1, e.y1),
    },

    // Now and then a small dial on a crossing: its rim swept round, then a ring of ticks,
    // longer every twelfth of the way round, ticking round a tick at a time like the
    // clocks, and a dot in the middle.
    dial: {
      live: true,
      path(g, e, t, on, off) {
        const q = i => [stagger(off, i, 3), stagger(on, i, 3)];
        arcPath(g, e.x, e.y, e.R, e.a0, TAU, ...q(0));
        const [a, b] = q(1), rot = e.a0 + stepped(t, e.every, 0.4, e.dir * TAU / e.n, e.ph), major = e.n / 12;
        for (let i = 0; i < e.n; i++) {
          const u = i / e.n;
          if (u < a || u >= b) continue;
          const c = Math.cos(rot + u * TAU), s = Math.sin(rot + u * TAU), r0 = e.R * (i % major ? 0.8 : 0.68);
          g.moveTo(e.x + c * r0, e.y + s * r0);
          g.lineTo(e.x + c * e.R * 0.9, e.y + s * e.R * 0.9);
        }
        const [c0, c1] = q(2);
        dot(g, e.x, e.y, 2.6, c1, c0);
      },
      pts: e => around(e.x, e.y, e.R).concat(around(e.x, e.y, e.R * 0.8)),
    },
  };
  const SHAPES = Object.keys(KINDS).filter(k => k !== 'line');

  // ---------- Geometry ----------

  const inFrame = (x, y, pad = 0) => x >= pad && x <= W - pad && y >= pad && y <= H - pad;

  // Where lines a and b cross: how far along each (0 to 1), and where; null if they don't.
  function cross(a, b) {
    const dx = a.x1 - a.x0, dy = a.y1 - a.y0, ex = b.x1 - b.x0, ey = b.y1 - b.y0, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-6 * Math.hypot(dx, dy) * Math.hypot(ex, ey)) return null;
    const fx = b.x0 - a.x0, fy = b.y0 - a.y0, u = (fx * ey - fy * ex) / den, v = (fx * dy - fy * dx) / den;
    return u < 0 || u > 1 || v < 0 || v > 1 ? null : { u, v, x: a.x0 + dx * u, y: a.y0 + dy * u };
  }

  // How far x, y lies from line e (design px).
  function distTo(e, x, y) {
    const dx = e.x1 - e.x0, dy = e.y1 - e.y0, u = clamp(((x - e.x0) * dx + (y - e.y0) * dy) / (dx * dx + dy * dy));
    return Math.hypot(e.x0 + dx * u - x, e.y0 + dy * u - y);
  }

  // The stretch of the line through x, y at angle `a` that lies on the sheet (the frame
  // and its margin).
  function span(x, y, a) {
    const c = Math.cos(a), s = Math.sin(a);
    let lo = -1e5, hi = 1e5;
    for (const [p, d, min, max] of [[x, c, -M, W + M], [y, s, -M, H + M]]) {
      if (Math.abs(d) < 1e-9) { if (p < min || p > max) return null; continue; }
      const t0 = (min - p) / d, t1 = (max - p) / d;
      lo = Math.max(lo, Math.min(t0, t1));
      hi = Math.min(hi, Math.max(t0, t1));
    }
    return hi - lo > 1 ? { x0: x + c * lo, y0: y + s * lo, x1: x + c * hi, y1: y + s * hi } : null;
  }

  // The ways a line is ruled: how often each is picked, its angle (0 is level) and how
  // often a line that way runs only from one line to another, not right across.
  const WAYS = [
    { w: 0.4, angle: () => Math.PI / 2, part: 0.6 },                               // upright
    { w: 0.22, angle: () => 0, part: 0.35 },                                       // level
    { w: 0.24, angle: r => (r() < 0.5 ? 1 : -1) * Math.PI / 4, part: 0.55 },       // diagonal
    { w: 0.14, angle: r => (r() < 0.5 ? 1 : -1) * (0.2 + r() * 0.3), part: 0.2 },  // a shallow slant
  ];
  function way(r) {
    let u = r();
    for (const f of WAYS) if ((u -= f.w) <= 0) return f;
    return WAYS[0];
  }

  // ---------- The drawing ----------
  class Field {
    // `random` makes the drawing (seed it for repeatable stills).
    constructor(random = Math.random) {
      this.r = random;
      this.cam = { x: 0, y: 0 };
      this.items = [];      // every line and shape there, until it has erased itself
      this.clusters = [];   // in the order they came: { id, born, dies, items }
      this.lines = [];      // the lines staying (not erasing), each with where it crosses the others
      this.glints = [];
      this.ids = 0;
      this.next = null;     // when the next cluster may come
      this.retire = null;   // when the next one goes
      this.nextGlint = null;
      this.rush = false;    // ruling a fresh drawing after a worldline shift
      this.clear = null;    // the centrepiece's pool of negative space
      this.vary = Math.floor(random() * 1e4);
      this.ink = new Float32Array(COLS * ROWS); // the line in each cell (px, times brightness)
      this.T = new Float32Array(COLS * ROWS);   // what each cell should hold, relative to the rest
      this.target();
      this.sheet = this.layer = this.hole = null;
      this.stale = true;    // the sheet needs drawing afresh
      this.pending = [];    // settled since the sheet was drawn: to add to it
      this.redraws = 0;     // how often the sheet has had to be drawn afresh
      this.retired = 0;     // how many clusters have been erased
    }

    // The layer and the sheet: about RES px per design px whatever the screen, so the lines
    // look the same on any (between 0.4 and 1 of the screen's own px), with the margin.
    build(view) {
      this.q = view.S * clamp(RES / view.S, 0.4, 1);
      const w = Math.ceil((W + 2 * M) * this.q), h = Math.ceil((H + 2 * M) * this.q);
      this.sheet = canvas(w, h);
      this.layer = canvas(w, h);
      this.stale = true;
      this.pending.length = 0;
      // The clear middle: a soft round fade, stretched over the centrepiece when it's cut out.
      this.hole = canvas(128, 128);
      const g = this.hole.getContext('2d'), fade = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      for (let i = 0; i <= 10; i++) fade.addColorStop(i / 10, `rgba(0,0,0,${(1 - smooth(0.36, 1, i / 10)).toFixed(3)})`);
      g.fillStyle = fade;
      g.fillRect(0, 0, 128, 128);
    }

    // `focus`: the centrepiece's pool of negative space (design px: centre and radii). No
    // shapes go in its core, less line goes near it, and the drawing fades out toward its
    // middle.
    keepClear(focus) {
      this.clear = { x: focus.x, y: focus.y, rx: focus.rx, ry: focus.ry };
      this.target();
    }

    // What each cell should hold, relative to the rest: nothing in the centrepiece's core,
    // rising to all of it a little way out, and a little more or less here and there.
    target() {
      const c = this.clear;
      this.open = [];
      for (let j = 0; j < ROWS; j++) {
        for (let i = 0; i < COLS; i++) {
          const x = (i + 0.5) * CELL - M, y = (j + 0.5) * CELL - M, n = j * COLS + i;
          const d = c ? Math.hypot((x - c.x) / c.rx, (y - c.y) / c.ry) : 9;
          this.T[n] = smooth(0.3, 0.75, d) * (0.75 + 0.5 * fbm2(x / 700, y / 700, this.vary, 3));
          if (inFrame(x, y) && this.T[n] > 0.05) this.open.push(n);
        }
      }
    }

    cell(x, y) {
      const i = Math.floor((x + M) / CELL), j = Math.floor((y + M) / CELL);
      return i < 0 || j < 0 || i >= COLS || j >= ROWS ? -1 : j * COLS + i;
    }

    // Count e's line in the density (sign 1), or stop counting it (-1).
    tally(e, sign) {
      if (!e.cells) {
        const m = new Map();
        for (const [x, y] of KINDS[e.kind].pts(e)) {
          const c = this.cell(x, y);
          if (c >= 0) m.set(c, (m.get(c) || 0) + STEP * e.k);
        }
        e.cells = [...m];
      }
      for (const [c, v] of e.cells) this.ink[c] += sign * v;
    }

    // How full the open frame is, on average, for what it should hold.
    level() {
      let d = 0, s = 0;
      for (const c of this.open) { d += this.ink[c]; s += this.T[c]; }
      return s > 0 ? d / s : 0;
    }

    // How much more line the drawing wants at x, y: what its cell should hold at the
    // present level, less what it holds.
    want(x, y, lvl) {
      const c = this.cell(x, y);
      return c < 0 ? 0 : this.T[c] * lvl - this.ink[c];
    }

    // How much room there is for a shape at x, y, from 0 (none) to 1: none in the clear
    // core, less where it's full, and in the right third, where the clockwork is busiest,
    // half as much.
    room(x, y, lvl) {
      const c = this.cell(x, y);
      if (c < 0 || this.T[c] < 0.05) return 0;
      const full = lvl > 0 ? this.ink[c] / (this.T[c] * lvl * 1.2) : 0;
      return clamp(1 - full) * (1 - 0.5 * smooth(1500, 1900, x));
    }

    // A shape (of the given kind, if any) staying within `d` of x, y, or among those `made`.
    near(x, y, d, made, kind = null) {
      const hit = e => e.kind !== 'line' && !e.leaving && (!kind || e.kind === kind) && Math.hypot(e.x - x, e.y - y) < d;
      return made.some(hit) || this.items.some(hit);
    }

    dials(made) { return made.concat(this.items).filter(e => e.kind === 'dial' && !e.leaving).length; }

    update(t) {
      const r = this.r;
      if (this.next == null) this.boot(t);
      // What has erased itself goes.
      if (this.items.some(e => t >= e.dies + e.outT)) {
        this.items = this.items.filter(e => t < e.dies + e.outT);
        this.clusters = this.clusters.filter(c => c.items.some(e => t < e.dies + e.outT));
      }
      // Every few seconds the oldest cluster, if it has been there a while, erases itself...
      if (t >= this.retire) {
        const old = this.clusters.find(c => c.dies === Infinity && t - c.born > AGE);
        if (old) this.erase(old, t);
        this.retire = t + 4 + r() * 3;
      }
      // ...and a new line is ruled where the drawing is thinnest.
      if (t >= this.next && this.staying() < COUNT) {
        this.add(this.cluster(t));
        this.next = t + (this.rush ? 0.06 + r() * 0.06 : 0.5 + r() * 0.8);
        if (this.staying() >= COUNT) this.rush = false;
      }
      this.glide(t);
      this.settle(t);
    }

    // How many clusters aren't being erased: as soon as one starts to go, the next may come.
    staying() { return this.clusters.reduce((n, c) => n + (c.dies === Infinity ? 1 : 0), 0); }

    // At the start: a whole drawing already, ruled over the last few minutes, its newest
    // line still being drawn.
    boot(t) {
      const r = this.r;
      for (let i = 0; i < COUNT; i++) this.add(this.cluster(t, (COUNT - 1 - i) * 5.5 + r() * 3 - 1.5));
      this.next = t + 2;
      this.retire = t + 2 + r() * 3;
      this.nextGlint = t + 1 + r() * 2;
    }

    // A new cluster, born `ago` s before t: a line where the drawing is thinnest (ruled
    // twice, a third of the time) and the shapes that grow on it as the pen passes them.
    cluster(t, ago = 0) {
      const r = this.r, s = this.rule();
      if (!s) return null;
      const id = ++this.ids, fast = this.rush ? 3.5 : 1, born = t - ago;
      const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0), ux = (s.x1 - s.x0) / len, uy = (s.y1 - s.y0) / len;
      const k = 0.45 + 0.55 * r() ** 1.5;
      const L = this.item({
        kind: 'line', ...s, len, ux, uy, nx: -uy, ny: ux, k, lw: 1.2 + r() * 0.8, born,
        inT: clamp(len / (650 + r() * 450), 1.2, 4.5) / fast,
      }, id);
      const items = [L];
      if (r() < 0.33) {
        const d = (r() < 0.5 ? -1 : 1) * (7 + r() * 9);
        items.push(this.item({
          kind: 'line', x0: s.x0 + L.nx * d, y0: s.y0 + L.ny * d, x1: s.x1 + L.nx * d, y1: s.y1 + L.ny * d,
          len, ux, uy, nx: L.nx, ny: L.ny, twin: L, k: k * 0.75, lw: L.lw, born: born + (0.15 + r() * 0.3) / fast, inT: L.inT,
        }, id));
      }
      for (const e of this.attach(L, r)) {
        e.born = born + L.inT * reach(e.u) + (0.05 + r() * 0.25) / fast;
        e.inT /= fast;
        items.push(this.item(e, id));
      }
      return { id, born, dies: Infinity, items };
    }

    // Line or shape e, of cluster `cl`, staying until it's erased. Its brightness and width
    // are rounded, so the sheet can draw alike ones together and they look the same there.
    item(e, cl) {
      return Object.assign(e, {
        id: ++this.ids, cl, k: Math.round(e.k * 8) / 8, lw: Math.round(e.lw * 4) / 4,
        dies: Infinity, outT: 1, cut: 0, leaving: false, inSheet: false, cells: null, deps: e.deps || [], xs: [],
      });
    }

    // Where the next line goes: of 24 tried, the one running through the most ink the
    // drawing wants, crossing at least two lines and not alongside one running its way.
    // Half are tried through a crossing that's there already, and many run only from one
    // line to another.
    rule() {
      const r = this.r, lvl = this.level(), mains = this.lines.filter(l => !l.twin);
      const nodes = mains.flatMap(l => l.xs.filter(c => c.o.id > l.id));
      let best = null, top = -Infinity;
      for (let i = 0; i < 24; i++) {
        const f = way(r), a = f.angle(r), n = nodes.length && r() < 0.5 ? nodes[Math.floor(r() * nodes.length)] : null;
        let s = span(n ? n.x : r() * W, n ? n.y : r() * H, a);
        if (!s) continue;
        if (r() < f.part) s = this.between(s, mains, r) || s;
        const v = this.score(s, mains, lvl);
        if (v > top) { top = v; best = s; }
      }
      return best && r() < 0.5 ? { x0: best.x1, y0: best.y1, x1: best.x0, y1: best.y0 } : best;
    }

    // The stretch of s from one line it crosses to another, at least 40% of its length
    // and running a little past both; null if there's none.
    between(s, mains, r) {
      const us = [];
      for (const o of mains) {
        const c = cross(s, o);
        if (c && inFrame(c.x, c.y, -40)) us.push(c.u);
      }
      us.sort((a, b) => a - b);
      const pairs = [];
      for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) if (us[j] - us[i] >= 0.4) pairs.push([us[i], us[j]]);
      if (!pairs.length) return null;
      const [a, b] = pairs[Math.floor(r() * pairs.length)], len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
      const ua = Math.max(0, a - (8 + r() * 24) / len), ub = Math.min(1, b + (8 + r() * 24) / len);
      return {
        x0: s.x0 + (s.x1 - s.x0) * ua, y0: s.y0 + (s.y1 - s.y0) * ua,
        x1: s.x0 + (s.x1 - s.x0) * ub, y1: s.y0 + (s.y1 - s.y0) * ub,
      };
    }

    // How good a place for line s: the ink the drawing wants along it, on average, where
    // it's in the frame; far worse alongside a line running its way (within 40 px), or
    // crossing fewer than two.
    score(s, mains, lvl) {
      const pts = alongLine(s.x0, s.y0, s.x1, s.y1).filter(([x, y]) => inFrame(x, y));
      if (!pts.length) return -Infinity;
      let v = 0;
      for (const [x, y] of pts) v += this.want(x, y, lvl);
      v /= pts.length;
      const dx = s.x1 - s.x0, dy = s.y1 - s.y0, len = Math.hypot(dx, dy);
      let crossings = 0;
      for (const o of mains) {
        if (Math.abs(dx * o.uy - dy * o.ux) / len < 0.03) {
          if (Math.min(distTo(o, s.x0, s.y0), distTo(o, s.x1, s.y1), distTo(s, o.x0, o.y0), distTo(s, o.x1, o.y1)) < 40) v -= 1e4;
        } else if (cross(s, o)) crossings++;
      }
      if (crossings < 2 && mains.length >= 4) v -= 1e4;
      return v;
    }

    // The shapes on new line L: at some of the crossings it makes and along the stretches
    // between, where there's room for them; a handful at most.
    attach(L, r) {
      const lvl = this.level(), made = [], most = 1 + Math.floor(r() * 5), xs = [];
      for (const o of this.lines) {
        if (o.twin) continue;
        const c = cross(L, o);
        if (c && inFrame(c.x, c.y, 30)) xs.push({ ...c, o });
      }
      xs.sort((a, b) => a.u - b.u);
      for (const c of xs) {
        if (made.length >= most) break;
        if (r() > 0.5 * this.room(c.x, c.y, lvl) || this.near(c.x, c.y, 40, made)) continue;
        made.push(this.onCrossing(L, c, xs, made, r));
      }
      for (let i = 0; i < 4 && made.length < most; i++) {
        const u = 0.04 + r() * 0.92, x = L.x0 + (L.x1 - L.x0) * u, y = L.y0 + (L.y1 - L.y0) * u;
        if (!inFrame(x, y, 30) || r() > this.room(x, y, lvl) || this.near(x, y, 60, made)) continue;
        const e = this.onStretch(L, u, r);
        if (e) made.push(e);
      }
      for (const e of made) { e.k = L.k * (0.7 + r() * 0.3); e.lw = 1 + r() * 0.5; }
      return made;
    }

    // A shape where L crosses line c.o: rings; crosshairs; a compass arc centred there and
    // through another crossing on L; a diamond with its corners on the two lines (never
    // near another); or now and then a dial (three at most, never near another).
    onCrossing(L, c, xs, made, r) {
      const o = c.o, base = { x: c.x, y: c.y, u: c.u, deps: [L, o] }, v = r();
      if (v < 0.1 && this.dials(made) < 3 && !this.near(c.x, c.y, 700, made, 'dial')) {
        return {
          kind: 'dial', ...base, R: 30 + r() * 36, n: [24, 36, 48, 60][Math.floor(r() * 4)],
          every: 2 + r() * 4, dir: r() < 0.5 ? -1 : 1, ph: r(), a0: r() * TAU, inT: 1.6,
        };
      }
      if (v < 0.24) {
        const s = 14 + r() * 30, sin = Math.abs(L.ux * o.uy - L.uy * o.ux);
        const fits = Math.min(c.u * L.len, (1 - c.u) * L.len, c.v * o.len, (1 - c.v) * o.len) > s + 2;
        if (sin > 0.85 && fits && !this.near(c.x, c.y, 320, made, 'diamond')) {
          const corners = [[L.ux, L.uy], [o.ux, o.uy], [-L.ux, -L.uy], [-o.ux, -o.uy]].map(([dx, dy]) => [c.x + dx * s, c.y + dy * s]);
          return { kind: 'diamond', ...base, corners, inT: 0.9 };
        }
      }
      if (v < 0.46) {
        const far = xs.filter(d => { const D = Math.hypot(d.x - c.x, d.y - c.y); return D > 120 && D < 520; });
        if (far.length) {
          const d = far[Math.floor(r() * far.length)], R = Math.hypot(d.x - c.x, d.y - c.y), th = Math.atan2(d.y - c.y, d.x - c.x);
          const sweep = (r() < 0.5 ? -1 : 1) * (0.5 + r() * 1.0);
          return { kind: 'arc', ...base, R, sweep, a0: th - sweep * (0.25 + r() * 0.5), inT: 0.9 + R / 600 };
        }
      }
      if (v < 0.64) return { kind: 'mark', ...base, s: 7 + r() * 9, a: Math.atan2(L.uy, L.ux), inT: 0.5 };
      const R1 = 8 + r() * 26, n = 1 + (r() < 0.45 ? 1 : 0) + (r() < 0.15 ? 1 : 0);
      return { kind: 'ring', ...base, radii: [R1, R1 * (1.4 + r() * 0.4), R1 * 2.3].slice(0, n), a0: r() * TAU, dot: r() < 0.4, inT: 0.7 + 0.35 * n };
    }

    // A shape along L from u on: ruler ticks, hatching, small circles strung along it, or a
    // link straight across or at 45° to the next line that way.
    onStretch(L, u, r) {
      const x = L.x0 + (L.x1 - L.x0) * u, y = L.y0 + (L.y1 - L.y0) * u, left = (1 - u) * L.len, v = r();
      const base = { x, y, u, ux: L.ux, uy: L.uy, nx: L.nx, ny: L.ny, deps: [L] };
      if (v < 0.32) {
        const step = 9 + r() * 9, n = Math.min(8 + Math.floor(r() * 22), Math.floor(left / step));
        if (n < 5) return null;
        const side = Math.floor(r() * 3) - 1;
        return {
          kind: 'ticks', ...base, n, step, len: 6 + r() * 8,
          lo: side > 0 ? 0 : side < 0 ? -1 : -0.5, hi: side > 0 ? 1 : side < 0 ? 0 : 0.5, inT: 0.5 + n * 0.04,
        };
      }
      if (v < 0.62) {
        const gap = 6 + r() * 8, n = Math.min(6 + Math.floor(r() * 16), Math.floor(left / gap)), most = 18 + r() * 60;
        if (n < 4) return null;
        // Streaks hang straight down (or up) from a line that isn't upright, and slant
        // from one that is.
        const sgn = r() < 0.5 ? -1 : 1, [dx, dy] = Math.abs(L.uy) < 0.8 ? [0, sgn] : [sgn * Math.SQRT1_2, Math.SQRT1_2];
        return { kind: 'hatch', ...base, n, gap, dx, dy, lens: Array.from({ length: n }, () => most * (0.45 + 0.55 * r())), inT: 0.5 + n * 0.05 };
      }
      if (v < 0.82) {
        const gap = 22 + r() * 30, n = Math.min(3 + Math.floor(r() * 6), Math.floor(left / gap) + 1);
        if (n < 2) return null;
        return { kind: 'beads', ...base, n, gap, rad: 4 + r() * 7, inT: 0.4 + n * 0.12 };
      }
      const a = Math.atan2(L.uy, L.ux) + [1, -1, 0.5, -0.5, 1.5, -1.5][Math.floor(r() * 6)] * Math.PI / 2;
      const ray = { x0: x, y0: y, x1: x + Math.cos(a) * 420, y1: y + Math.sin(a) * 420 };
      let hit = null;
      for (const o of this.lines) {
        if (o.twin) continue;
        const c = cross(ray, o);
        if (c && c.u * 420 > 60 && (!hit || c.u < hit.u)) hit = { ...c, o };
      }
      if (!hit) return null;
      return { kind: 'link', ...base, x0: x, y0: y, x1: hit.x, y1: hit.y, deps: [L, hit.o], inT: 0.3 + hit.u * 0.6 };
    }

    add(c) {
      if (!c) return;
      for (const e of c.items) this.tally(e, 1);
      this.items.push(...c.items);
      this.clusters.push(c);
      this.relink();
    }

    // Erase cluster c from t: its shapes, and the shapes of other clusters hanging off its
    // lines, one after another; then its lines, trimmed off from their start.
    erase(c, t) {
      const r = this.r, lines = c.items.filter(e => e.kind === 'line');
      const shapes = this.items.filter(e => e.kind !== 'line' && !e.leaving && (e.cl === c.id || e.deps.some(d => lines.includes(d))));
      c.dies = t;
      this.retired++;
      shapes.forEach((e, i) => this.leave(e, t + Math.min(0.9, i * 0.12) + r() * 0.15, 0.5 + r() * 0.5));
      for (const e of lines) this.leave(e, t + 0.9 + r() * 0.4, clamp(e.len / (900 + r() * 500), 0.9, 2.6));
      this.relink();
    }

    // e erases itself from `at`, over `outT` s, trimmed off outward from `cut` (0, its
    // start, but for a line a shift wipes). It stops counting toward the density at once,
    // so a new line or shape may take its place while it goes. If it hasn't begun to draw
    // on by then, it never does.
    leave(e, at, outT, cut = 0) {
      if (e.leaving) return;
      e.leaving = true;
      e.cut = cut;
      if (at <= e.born) { e.born = e.dies = at; e.outT = 1e-3; } else { e.dies = at; e.outT = outT; }
      this.tally(e, -1);
    }

    // After lines come or go: the lines staying, and where each crosses the others (twins,
    // a line's second ruling, aside).
    relink() {
      this.lines = this.items.filter(e => e.kind === 'line' && !e.leaving);
      for (const l of this.lines) l.xs = [];
      const mains = this.lines.filter(l => !l.twin);
      for (let i = 0; i < mains.length; i++) {
        for (let j = i + 1; j < mains.length; j++) {
          const a = mains[i], b = mains[j], c = cross(a, b);
          if (!c) continue;
          a.xs.push({ u: c.u, v: c.v, x: c.x, y: c.y, o: b });
          b.xs.push({ u: c.v, v: c.u, x: c.x, y: c.y, o: a });
        }
      }
      for (const l of mains) l.xs.sort((p, q) => p.u - q.u);
    }

    // Keep the sheet to what's settled: drawn on, staying and still. What has settled since
    // is added to it; if anything on it has started to erase, it's drawn afresh (`redraws`).
    settle(t) {
      let dirty = false;
      for (const e of this.items) {
        const settled = !e.leaving && !KINDS[e.kind].live && t >= e.born + e.inT;
        if (settled && !e.inSheet) { e.inSheet = true; if (!this.stale) this.pending.push(e); }
        else if (!settled && e.inSheet) { e.inSheet = false; dirty = true; }
      }
      if (dirty) { this.stale = true; this.pending.length = 0; this.redraws++; }
    }

    // Glints: every few seconds one sets off from an end of a settled line, at its own
    // pace, and where the line crosses another it sometimes turns onto that one.
    glide(t) {
      const r = this.r;
      if (t >= this.nextGlint) {
        this.nextGlint = t + 3 + r() * 5;
        const ok = this.lines.filter(l => !l.twin && l.inSheet);
        if (ok.length && this.glints.length < 2) {
          const L = ok[Math.floor(r() * ok.length)], dir = r() < 0.5 ? 1 : -1, u = dir > 0 ? 0 : 1;
          this.glints.push({ L, u, from: u, dir, speed: 260 + r() * 340, turns: 1 + Math.floor(r() * 3), born: t, last: t, path: [{ L, u }] });
        }
      }
      for (const gl of this.glints) {
        const dt = t - gl.last;
        gl.last = t;
        if (gl.L.leaving) { gl.done = true; continue; }
        const u1 = gl.u + gl.dir * gl.speed * dt / gl.L.len, lo = Math.min(gl.u, u1), hi = Math.max(gl.u, u1);
        const passed = gl.L.xs.filter(c => c.u > lo && c.u <= hi && c.u !== gl.from).sort((a, b) => (a.u - b.u) * gl.dir);
        const turn = gl.turns > 0 ? passed.find(c => c.o.inSheet && !c.o.leaving && r() < 0.35) : null;
        if (turn) {
          gl.turns--;
          gl.path.push({ L: turn.o, u: turn.v, x: turn.x, y: turn.y });
          gl.L = turn.o;
          gl.u = gl.from = turn.v;
          gl.dir = r() < 0.5 ? 1 : -1;
        } else gl.u = u1;
        if (gl.u < 0 || gl.u > 1) gl.done = true;
      }
      this.glints = this.glints.filter(gl => !gl.done);
    }

    // A worldline shift: the drawing is wiped outward from the centrepiece within about a
    // second, lines from their nearest point to it, and a new one is ruled quickly.
    shift(t) {
      const r = this.r, c = this.clear || { x: W / 2, y: H / 2 };
      for (const e of this.items) {
        if (e.leaving) {
          // Erasing already: it hurries on from where it's got to.
          const outT = 0.35 + r() * 0.25;
          e.dies = t - clamp((t - e.dies) / e.outT) * outT;
          e.outT = outT;
          continue;
        }
        let d, cut = 0;
        if (e.kind === 'line') {
          const dx = e.x1 - e.x0, dy = e.y1 - e.y0;
          cut = clamp(((c.x - e.x0) * dx + (c.y - e.y0) * dy) / (dx * dx + dy * dy));
          d = Math.hypot(e.x0 + dx * cut - c.x, e.y0 + dy * cut - c.y);
        } else d = Math.hypot(e.x - c.x, e.y - c.y);
        this.leave(e, t + 0.8 * clamp(d / 2400) + r() * 0.1, 0.35 + r() * 0.25, cut);
      }
      for (const cl of this.clusters) cl.dies = Math.min(cl.dies, t);
      this.glints = [];
      this.relink();
      this.rush = true;
      this.next = t + 0.9;
    }

    // `a`: how bright the lines are (Screen's opacity, 0 to 1). `m`: how far the
    // centrepiece is from its home this frame (design px), so the clear middle stays on it.
    draw(ctx, view, t, a, m = { x: 0, y: 0 }) {
      if (!this.layer || a <= 0) return;
      const q = this.q, s = this.sheet.getContext('2d'), g = this.layer.getContext('2d');
      for (const c of [s, g]) { c.strokeStyle = `rgb(${LINE})`; c.lineCap = c.lineJoin = 'round'; }
      // The sheet: what has settled, drawn once, alike lines and shapes together.
      if (this.stale || this.pending.length) {
        const list = this.stale ? this.items.filter(e => e.inSheet) : this.pending, groups = new Map();
        if (this.stale) { s.setTransform(1, 0, 0, 1, 0, 0); s.clearRect(0, 0, this.sheet.width, this.sheet.height); }
        for (const e of list) {
          const key = e.k * 100 + e.lw;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(e);
        }
        s.setTransform(q, 0, 0, q, M * q, M * q);
        for (const es of groups.values()) {
          s.globalAlpha = es[0].k;
          s.lineWidth = es[0].lw;
          s.beginPath();
          for (const e of es) KINDS[e.kind].path(s, e, t, 1, 0);
          s.stroke();
        }
        this.stale = false;
        this.pending.length = 0;
      }
      // The layer: the sheet, and what's moving over it.
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'copy';
      g.drawImage(this.sheet, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.setTransform(q, 0, 0, q, M * q, M * q);
      for (const e of this.items) {
        if (e.inSheet) continue;
        const [on, off] = phase(e, t);
        if (on <= 0 || off >= 1) continue;
        g.globalAlpha = e.k;
        g.lineWidth = e.lw;
        g.beginPath();
        KINDS[e.kind].path(g, e, t, on, off);
        g.stroke();
      }
      // The glints: brightest at the head, fading along the tail, and in as they set off.
      g.lineWidth = 2.2;
      for (const gl of this.glints) {
        const L = gl.L, du = TAIL / L.len / 4, fade = clamp((t - gl.born) / 0.5);
        for (let i = 0; i < 4; i++) {
          const u0 = gl.u - gl.dir * du * i, u1 = gl.u - gl.dir * du * (i + 1);
          let lo = Math.max(0, Math.min(u0, u1)), hi = Math.min(1, Math.max(u0, u1));
          if (gl.dir > 0) lo = Math.max(lo, gl.from); else hi = Math.min(hi, gl.from);
          g.globalAlpha = fade * (1 - i / 4);
          g.beginPath();
          seg(g, L.x0, L.y0, L.x1, L.y1, lo, hi);
          g.stroke();
        }
      }
      // Where it lies this frame: moved with the cursor as one deep plane.
      const ox = -this.cam.x * P * DEPTH, oy = -this.cam.y * P * DEPTH * 0.7;
      // The clear middle, cut out where the centrepiece is.
      const c = this.clear;
      if (c) {
        const rx = c.rx * HOLE, ry = c.ry * HOLE;
        g.globalCompositeOperation = 'destination-out';
        g.globalAlpha = 1;
        g.drawImage(this.hole, c.x + m.x - ox - rx, c.y + m.y - oy - ry, rx * 2, ry * 2);
        g.globalCompositeOperation = 'source-over';
      }
      // Over the black.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(this.layer, view.ox + (ox - M) * view.S, view.oy + (oy - M) * view.S, (W + 2 * M) * view.S, (H + 2 * M) * view.S);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  return { Field, KINDS, SHAPES, COUNT, AGE, stagger, phase, reach, cross };
})();
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `node tools/test.js 2>&1 | tail -14`
Expected: all nine `schematic:` tests `ok`. The only FAIL is the rig fold test that was
already failing, ending `1 failing`.

If "spread evenly" or "woven" fail on their thresholds (2.5 / 0.3 / one lonely line),
print the measured values across seeds 1–7 first, and don't loosen anything blindly.
- If the drawing is uneven, fix the placement (`score`, `target`).
- Only if the measured spread is fine to look at, set the thresholds just outside what's
  measured, and note them in the plan's As built.

- [ ] **Step 5: Commit**

```bash
git add wallpaper/js/schematic.js tools/test.js
git commit -m "Schematics as one woven drawing: lines ruled across, shapes hanging off them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Wire it in, and tune it by eye

**Files:**
- Modify: `wallpaper/js/main.js`

**Interfaces:**
- Consumes: `Schematic.Field` from Task 2 (`draw(ctx, view, t, a, m)` now takes the
  centrepiece's offset), and `scene.meterOffset(t)`.

- [ ] **Step 1: Rename and rewire**

In `wallpaper/js/main.js`:

```js
  // The schematics: faint drafting figures behind everything, drawing themselves on and
  // off. The setting (0-100, 50 as designed) scales how bright their lines are.
  const figures = new Schematic.Field(Kit.rng(seed + 11));
  const schematic = () => Config.get('schematic') / 50;
  backdrop.cam = figures.cam = scene.dust.cam;
```
becomes
```js
  // The schematics: one faint drafting drawing behind everything, slowly redrawing
  // itself. The setting (0-100, 50 as designed) scales how bright its lines are.
  const drafting = new Schematic.Field(Kit.rng(seed + 11));
  const schematic = () => Config.get('schematic') / 50;
  backdrop.cam = drafting.cam = scene.dust.cam;
```

Change `figures.shift(t)` to `drafting.shift(t)` in `controller.onShift`. In
`buildSprites()`, change `figures.build(view);` and `figures.keepClear(f);` to
`drafting.build(view);` and `drafting.keepClear(f);`. In `step(t)`, change
`figures.update(t);` to `drafting.update(t);`.

In `render(t)`:

```js
    // The schematics first: faint lines on the black, everything else drawn over them.
    const sk = schematic();
    if (sk > 0) figures.draw(ctx, view, t, 0.35 * sk);
    scene.drawBehind(ctx, view, t, now);
    // The backdrop and the screentone go in after the pool of dark the scene keeps around
    // the centrepiece, so they reach the whole frame and show in that pool; the backdrop
    // eases off around the centrepiece by itself. The screentone and the halftone on
    // Makise move with the centrepiece.
    const tx = texture(), m = scene.meterOffset(t), makise = centre() === 'makise';
```
becomes
```js
    // The schematics first: faint lines on the black, everything else drawn over them.
    const sk = schematic(), m = scene.meterOffset(t);
    if (sk > 0) drafting.draw(ctx, view, t, 0.12 * sk, m);
    scene.drawBehind(ctx, view, t, now);
    // The backdrop and the screentone go in after the pool of dark the scene keeps around
    // the centrepiece, so they reach the whole frame and show in that pool; the backdrop
    // eases off around the centrepiece by itself. The screentone and the halftone on
    // Makise move with the centrepiece.
    const tx = texture(), makise = centre() === 'makise';
```

- [ ] **Step 2: Look at stills**

- With the scratchpad's `shoot.sh`, at 2560×1440:
  - `wallpaper/index.html?still=8&cursor=0,0`;
  - `?still=40&cursor=0,0`;
  - `?still=8&cursor=0,0&schematic=0`, for the scene without it;
  - `?still=8&cursor=0,0&centre=time`.
- Also take `?still=8&cursor=0,0` at 1920×1080 and 3840×2160.
- Check by eye, beside `refs/ref_l14_0_view.png` inverted:
  - long lines across, crossing like a hash, with shapes on them;
  - no blob, no bare patch;
  - the middle clear;
  - dimmer than the clockwork.
- Measure the brightness with `levels.py`, with and without the schematics. A single
  line should sit 6–12 levels over the black in the open areas.
- Tune `COUNT`, the brightness in `main.js` (`0.12`) and line widths until that holds.
  Keep the tests passing.

- [ ] **Step 3: Watch it move**

Take an 8-frame contact sheet, 1 s apart, around a retirement. Check that:
- a line rules across, and its shapes grow on it as the pen passes;
- an old cluster's shapes go first, then its line trims off;
- a glint runs along a line.

Then take stills through `?shiftAt=6` at `still=6.4`, `7` and `10`. The drawing should
be wiped outward from the centrepiece and ruled anew.

- [ ] **Step 4: Measure the cost**

In the browser pane at the dev server, read `SG.state().ms` with schematic 50 and 0,
over several seconds each. Time the sheet redraw too: in a still page,
`performance.now()` around `drafting.draw` when `stale` is set, from the console. One
way is to call `SG.shift()`. The targets are under 1 ms on average and a few ms for a
redraw.

- [ ] **Step 5: Run the tests, then commit**

Run: `node tools/test.js 2>&1 | tail -14`. Expect the schematic tests `ok`, and
`1 failing` (the rig).

```bash
git add wallpaper/js/main.js wallpaper/js/schematic.js tools/test.js
git commit -m "Draw the woven schematics behind the scene, dimmer, with a clear middle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Docs and the setting's descriptions

**Files:**
- Modify: `README.md`, `workshop/WORKSHOP.md`, `wallpaper/js/config.js`,
  `tools/preview.html`
- Modify: this plan, adding an As built section

- [ ] **Step 1: README**

The intro paragraph becomes:

```
An animated desktop wallpaper: Makise Kurisu, or the glowing digits of a nixie meter
(with their faint unlit cathodes and honeycomb, but no glass), surrounded by slowly
turning clocks, gears and an escapement over a faint drafting drawing that slowly
redraws itself, with living ink, light that pans across the scene, wandering dust,
faint smoke and film grain over the top.
```

The settings row becomes:

```
| Schematic strength | 0–100: the faint drafting drawing behind everything (0 turns it off) | 50 |
```

The **Schematics** bullet under "How it behaves", including its nested list and the
paragraph after it, becomes:

```
- **Schematics** lie behind everything, like the technical drawings in the opening: one
  faint drawing in light lines on the black, woven together. Long lines are ruled right
  across the screen, crossing like a hash, some of them twice, and small shapes hang off
  them: circles strung along a line; rings, diamonds, crosshairs and now and then a small
  dial where lines cross; ruler ticks and hatching along them; compass arcs from one
  crossing through another; links to the next line over. It slowly redraws itself, as if
  being drafted: every few seconds the oldest line erases itself, its shapes first, and a
  new one is ruled where the drawing is thinnest, its shapes growing on it as the pen
  passes them. Glints run along the lines, now and then turning where they cross, and the
  dials tick round like the clocks. It moves only with the cursor, as one deep plane. It
  thins out around the centrepiece and fades to nothing in the middle of it, and the
  right third, where the clockwork is busiest, has fewer shapes. A worldline shift wipes
  it outward from the centrepiece and rules a new one within a few seconds.
```

The schematics' performance bullet becomes the following, with the ms measured in
Task 3:

```
- The schematics are drawn once into a cached sheet at about half a px per design px
  (1280×720 on most screens). Each frame only what is drawing on, erasing, ticking or
  glinting is drawn over a copy of it, and the sheet is drawn afresh, a handful of
  strokes, only when a line starts to erase (every few seconds): about 0.5 ms a frame at
  2560×1440.
```

The code layout row becomes:

```
| `schematic.js` | The schematics: one faint drafting drawing of lines and the shapes on them, slowly redrawing itself behind everything |
```

- [ ] **Step 2: The Workshop page and the setting's descriptions**

In `workshop/WORKSHOP.md`, the features bullet becomes:

```
[*]A faint drafting drawing behind everything, like the schematics in the opening: long lines ruled across the screen, with rings, ticks, arcs and small dials hanging off them, slowly redrawing itself line by line
```

In `wallpaper/js/config.js`:

```js
//   schematic: 0-100, how bright the schematics behind everything are: one faint
//              drafting drawing, slowly redrawing itself (50 as designed, 0 turns it off)
```

In `tools/preview.html`, the Schematic group's title becomes:

```
How bright the schematics behind everything are: one faint drafting drawing, slowly redrawing itself. 0 turns it off, 50 as designed
```

- [ ] **Step 3: As built**

Append an `## As built` section to this plan. Record what tuning changed (count,
brightness, widths, thresholds) and the measured cost.

- [ ] **Step 4: Commit**

```bash
git add README.md workshop/WORKSHOP.md wallpaper/js/config.js tools/preview.html docs/superpowers/plans/2026-10-04-woven-schematics.md
git commit -m "Document the woven schematics

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## As built

Task 1 went in as planned. Task 2 was built as written, and then changed mid-build after
the user looked at it: the lines read as one big grid, too uniform and bunched up. They
asked to break lines apart, not bunch them, angle them differently and dim them a
little, "like bismuth formations". The spec was revised to match. What changed from the
code above:

- **Lines grow like a crystal**, not as one hash of upright, level and diagonal lines.
  - `WAYS`, `rule()` and `between()` are gone. `grow()`, `seed()`, `toward()`, `branch()`
    and `runTo()` replace them.
  - A growth is a run of lines drawn as one stroke, one line item each. A line's `from`
    is the line it set off from, and its `form` is its formation.
  - What grows is chosen first, so the drawing keeps its make-up:
    - a new formation 22%, a third of them right across the sheet;
    - a run 30%;
    - a step 26%;
    - a frame 22%.

    Where it goes comes second: of 24 tried, half aimed at the six barest places (3×3
    cell blocks) from the nearest line, scored by the mean ink wanted along it.
  - When the score alone picked the kind, the drawing drifted to short single runs:
    median line length 345 → 280 px, total line down a quarter over 20 minutes. With
    the kind chosen first it holds at about 110 lines and 39–49k px.
  - A formation holding more than `BIG` (10%) of the drawing stops growing, and a run at
    60° starts a formation of its own. At once, no 5° band of angle holds more than about
    a quarter of the line.
- **No twins.** `APART` = 45 px is the closest two lines running the same way may lie.
- **Broken lines.** About a third of the lines over 350 px get one to three `gaps`.
  `pieces()` draws around them, and shapes, crossings and glints keep out of them.
- **Lines ruled to other lines** (`ends`, and erasing them along with those lines) was
  tried against orphaned segments, then dropped with the grid.
- **A ring or a dot** now and then where a growth sets off from a line, or turns.
- `COUNT` 48 → 60 growths. The pen is slower (350–600 px/s). Hatching is lighter
  (5–13 strokes, 16–56 px).
- **Crossings are kept up to date** as lines come and go (`link()` and `unlink()`) and
  aren't sorted. The full `relink()` was 3.5 ms a time and slowed the tests from 10 s
  to 55 s.
- **Erased lines let go** of the line they grew from and of their crossings. Otherwise
  each line's `from` chain would keep every erased ancestor in memory.
- The brightness in `main.js` is `0.2 * strength/50`, not 0.12. The first build (seen
  at 0.35) was "dim a little" too bright. At 0.2 a line lifts the open dark at 1440p by
  a median of 6 levels, and 14 at the 90th percentile.

Tests, beyond the plan:
- "woven" became "it grows like a crystal": each growth sets off from its line, square
  to it or at 60°; at most 35% of the line at one angle at once; and, over time, no
  angle band over 25% and at least 10 of 18 holding over 2%.
- New: "lines apart, some broken".
- "Spread evenly" uses percentiles: under 2% of block samples below 0.15 of the mean,
  the barest 5% over 0.25, and never 3.5 times the mean. One long line coming or going
  swings a block a long way.
- `deepStrictEqual` on `phase` needs the arrays copied out of the vm.
- The sheet test also checks that nothing long gone is kept.

Measured in the browser, from the drawing's own `draw` and `update`:
- draw: about 0.05 ms a frame (p95 0.1);
- a sheet redraw: 0.2–0.4 ms, every few seconds;
- planning a growth: about 0.5 ms (max 1.2).

Stills are as specified: 1440p, 1080p and 4K, a motion strip, through a shift, and with
the nixie meter.
