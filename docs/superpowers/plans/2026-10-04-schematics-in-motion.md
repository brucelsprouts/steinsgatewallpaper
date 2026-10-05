# Schematics in Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the drifting, double-exposed schematic sheets with faint light-line figures that each draw themselves on, move in their own way, and erase themselves, spaced evenly behind the scene.

**Architecture:** `wallpaper/js/schematic.js` is rewritten around a `Field` of figures, like the ink's field. A seeded scheduler keeps about 18 figures and 3 long construction lines alive. A best-candidate spot finder spaces them. Each figure has a life (drawn on, alive, erased), its own depth, drift and parameters. Every frame they're stroked live on a half-resolution layer, using trim-path helpers, then the layer goes over the black with Screen before the scene. `Kit` gains the clockwork's `stepped` easing so the dials can tick like the clocks.

**Tech Stack:** Plain JS, Canvas 2D, no build step. Node for `tools/test.js`. Headless Chrome stills for tuning by eye.

## Global Constraints

- Everything is drawn in code.
- Design space is 2560×1440 design px; `view.S` scales it to the screen.
- **Schematic strength** stays 0–100, 50 as designed; 0 does no drawing.
- Light lines on the dark, laid with Screen; nothing lifts the black.
- No gears and no rows of diamonds among the figures.
- About 18 figures and 3 long construction lines at a time, spaced so none pile up and no patch stays bare.
- Under 1 ms a frame at 1440p.
- `node tools/test.js` already fails one test on `main` (`rig: at its strongest nothing folds over…`, folds at 375,135). It's out of scope: expect it, and only it, to fail.
- Comments and docs follow the house style: plain sentences, design px, "as designed".

---

### Task 1: The figure field

**Files:**
- Modify: `wallpaper/js/kit.js` (add `stepped`)
- Modify: `wallpaper/js/mech.js` (use `Kit.stepped`; drop the `gearPath` export the sheets needed)
- Rewrite: `wallpaper/js/schematic.js`
- Modify: `wallpaper/js/main.js` (create, build, update, shift, draw)
- Test: `tools/test.js` (replace the three sheet tests)

**Interfaces:**
- Produces: `Kit.stepped(t, period, dur, amount, offset = 0)` → number.
- Produces: `Schematic.Field(random)` with `cam`, `figs`, `rules`, `build(view)`, `keepClear(focus)`, `update(t)`, `shift(t)`, `where(f, t)` → `{ x, y }` and `draw(ctx, view, t, a)`. Also `Schematic.KINDS`, `Schematic.COUNT` (18), `Schematic.RULES` (3), `Schematic.stagger(u, i, n, s = 0.35)` and `Schematic.phase(f, t)` → `[on, off]`.
- A figure: `{ kind, R, room, x, y, depth, seed, w, drift, spin, p, born, inT, outT, dies }`.

- [ ] **Step 1: Write the failing tests**

In `tools/test.js`, replace everything from `// ---------- Schematics: how the sheets fade and drift` up to (not including) `process.exitCode = …` with:

```js
// ---------- Schematics: the figures' lives, where they go and how they move (nothing is drawn without a screen) ----------

function loadSchematic() {
  const ctx = { Math };
  vm.createContext(ctx);
  const src = ['kit.js', 'schematic.js'].map(f => fs.readFileSync(path.join(__dirname, '../wallpaper/js', f), 'utf8')).join('\n;\n');
  vm.runInContext(src + ';this.Kit = Kit; this.Schematic = Schematic;', ctx);
  return ctx;
}

// A field run at 30 fps from the start to `until` s, `each(t, field)` called every half second.
const MAKISE_FOCUS = { x: 600, y: 790, rx: 720, ry: 800 };
function runField(seed, until, each) {
  const { Kit, Schematic } = loadSchematic();
  const field = new Schematic.Field(Kit.rng(seed));
  field.keepClear(MAKISE_FOCUS);
  for (let k = 0; k <= until * 30; k++) {
    field.update(k / 30);
    if (k % 15 === 0 && each) each(k / 30, field);
  }
  return { field, Schematic };
}

test('schematic: parts draw on one after another, from nothing to whole, then erase', () => {
  const { Schematic: S } = loadSchematic();
  const f = { born: 10, inT: 3, dies: 50, outT: 2 };
  const at = t => { const [on, off] = S.phase(f, t); return [on, off]; };
  assert.deepStrictEqual(at(10), [0, 0]);
  assert.deepStrictEqual(at(13), [1, 0]);
  assert.deepStrictEqual(at(52), [1, 1]);
  for (const n of [1, 3, 5]) {
    for (let i = 0; i < n; i++) {
      assert.strictEqual(S.stagger(0, i, n), 0);
      assert.strictEqual(S.stagger(1, i, n), 1);
      for (let u = 0, prev = 0; u <= 1; u += 0.05) { const v = S.stagger(u, i, n); assert.ok(v >= prev); prev = v; }
      if (i) assert.ok(S.stagger(0.3, i, n) < S.stagger(0.3, i - 1, n), 'a later part ran ahead of an earlier one');
    }
  }
});

test('schematic: always about the same number of figures, and always one drawing on or off', () => {
  let quiet = 0, longest = 0;
  const { Schematic: S } = runField(5, 3600, (t, field) => {
    assert.ok(field.figs.length >= S.COUNT - 3 && field.figs.length <= S.COUNT, `${field.figs.length} figures at ${t}s`);
    assert.ok(field.rules.length <= S.RULES, `${field.rules.length} long lines at ${t}s`);
    const busy = field.figs.some(f => { const [on, off] = S.phase(f, t); return on < 1 || off > 0; });
    quiet = busy ? 0 : quiet + 0.5;
    longest = Math.max(longest, quiet);
  });
  assert.ok(longest <= 6, `nothing drew on or off for ${longest}s`);
});

test('schematic: figures spread out, never piled up and leaving no bare patch', () => {
  let worst = 0;
  runField(7, 1800, (t, field) => {
    if (t % 10) return;
    const figs = field.figs;
    for (let i = 0; i < figs.length; i++) {
      for (let j = i + 1; j < figs.length; j++) {
        const a = figs[i], b = figs[j];
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > (a.room + b.room) * 0.45, `${a.kind} and ${b.kind} piled up at ${t}s`);
      }
    }
    // The barest place in the frame, outside the middle of the centrepiece.
    for (let y = 80; y < 1440; y += 160) {
      for (let x = 80; x < 2560; x += 160) {
        if (Math.hypot((x - 600) / 360, (y - 790) / 400) < 1) continue;
        worst = Math.max(worst, Math.min(...figs.map(f => Math.hypot(x - f.x, y - f.y) - f.room)));
      }
    }
  });
  assert.ok(worst < 420, `a bare patch ${worst.toFixed(0)} px from any figure`);
});

test('schematic: each figure moves its own way, and the cursor moves each by its own depth', () => {
  const { field } = runField(9, 60);
  const figs = field.figs.slice(0, 10);
  const moves = figs.map(f => { const a = field.where(f, 60), b = field.where(f, 75); return [b.x - a.x, b.y - a.y]; });
  const spread = Math.max(...moves.map(m => Math.hypot(m[0] - moves[0][0], m[1] - moves[0][1])));
  assert.ok(spread > 5, `the figures moved together, within ${spread.toFixed(1)} px of each other`);
  const still = figs.map(f => field.where(f, 60).x);
  field.cam.x = 1;
  const pushed = figs.map((f, i) => field.where(f, 60).x - still[i]);
  assert.ok(pushed.every(d => d > 0), 'a figure moved against the cursor');
  assert.ok(Math.max(...pushed) - Math.min(...pushed) > 10, 'the cursor moved every figure the same');
});

test('schematic: a worldline shift erases them all quickly and draws a fresh set', () => {
  const { Kit, Schematic: S } = loadSchematic();
  const field = new S.Field(Kit.rng(11));
  field.keepClear(MAKISE_FOCUS);
  let t = 0;
  for (; t < 100; t += 1 / 30) field.update(t);
  const before = new Set(field.figs);
  field.shift(t);
  for (const end = t + 2; t < end; t += 1 / 30) field.update(t);
  assert.ok(field.figs.every(f => !before.has(f)), 'figures from before the shift still there after 2 s');
  for (const end = t + 8; t < end; t += 1 / 30) field.update(t);
  assert.ok(field.figs.length >= S.COUNT - 2, `only ${field.figs.length} figures 10 s after the shift`);
});

test('schematic: no gears, and no rows of diamonds', () => {
  const { Schematic: S } = loadSchematic();
  for (const k of Object.keys(S.KINDS)) assert.ok(!/gear|train|diamond/i.test(k), `a ${k} among the figures`);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node tools/test.js`
Expected: the six `schematic:` tests FAIL (`S.phase is not a function`, `Schematic.Field is not a constructor` and the like), plus the pre-existing rig failure.

- [ ] **Step 3: Move `stepped` into Kit**

`wallpaper/js/kit.js`: after the `ease` object add:

```js
  // Stepped motion: `amount` every `period` s, each step eased over `dur` s, like a
  // clock's hand ticking.
  function stepped(t, period, dur, amount, offset = 0) {
    const u = t / period + offset, n = Math.floor(u);
    return amount * (n + ease.inOut(clamp((u - n) * period / dur)));
  }
```

and change its return to `return { TAU, canvas, hash, rng, noise, noise2, fbm2, pnoise2, pfbm2, clamp, smooth, ease, stepped };`.

`wallpaper/js/mech.js`: change `const { TAU, canvas, clamp, ease, hash } = Kit;` to `const { TAU, canvas, clamp, ease, hash, stepped } = Kit;`, delete its own `stepped` (the comment `// Stepped rotation: …` and the function under `// ---------- Motion helpers ----------`), and change the last line back to `return { Assembly, PALETTES, Mat, gearDims };`.

- [ ] **Step 4: Rewrite `wallpaper/js/schematic.js`**

```js
'use strict';
// Schematics: faint drafting figures behind the whole scene, like the technical drawings
// in the opening, in light lines on the dark: dials with ticking rings, dashed orbits,
// compass constructions, nested squares, pendulums, rulers, crosshairs, long construction
// lines and branching worldlines. Each has a life of its own, as figures do in motion
// graphics: it draws itself on, its parts one after another (trim paths, staggered); it
// lives, ticking, turning, sweeping, swinging or sliding in its own way, at its own depth
// and drifting its own way; then it erases itself, and a new one draws itself on in the
// emptiest free spot, so they stay evenly spread and something is always drawing on or
// erasing. A worldline shift erases them all at once and draws a fresh set, like the
// opening's quick cuts. They're drawn at half the frame's resolution, so they're soft, and
// laid over the black with Screen before anything else is drawn.
const Schematic = (() => {
  const { TAU, canvas, rng, clamp, ease, stepped } = Kit;

  const LINE = '226,214,198'; // the lines' light: a pale warm white
  const COUNT = 18;           // figures at a time
  const RULES = 3;            // long construction lines at a time, besides
  const RES = 0.5;            // the layer's resolution, a fraction of the frame's
  const P = 42;               // parallax travel in design px per unit of depth

  // ---------- Timing ----------

  // How far part i of n has gone when the whole has gone `u` of the way: the parts go one
  // after another, each starting `s` of a part's time after the one before.
  const stagger = (u, i, n, s = 0.35) => clamp(u * (1 + s * (n - 1)) - i * s);

  // How far figure f is drawn on, and how far erased, at time t (each 0 to 1, eased).
  const phase = (f, t) => [ease.inOut(clamp((t - f.born) / f.inT)), ease.inOut(clamp((t - f.dies) / f.outT))];

  // A life `length` s long, drawn on over `inT` s and erased over the last `outT` s of it,
  // `age` (0 to 1) of the way to being erased already.
  function lifetime(t, age, length, inT, outT) {
    const born = t - age * (length - outT);
    return { born, inT, outT, dies: born + length - outT };
  }

  // ---------- Trim paths ----------
  // Each draws only the stretch of its path from `a` to `b` (fractions of its length): a
  // figure drawn `on` of the way and erased `off` of the way shows `off` to `on`.

  function arcT(g, R, a0, sweep, a, b) {
    if (b <= a) return;
    g.beginPath();
    g.arc(0, 0, R, a0 + sweep * a, a0 + sweep * b, sweep < 0);
    g.stroke();
  }

  function lineT(g, x0, y0, x1, y1, a, b) {
    if (b <= a) return;
    g.beginPath();
    g.moveTo(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a);
    g.lineTo(x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
    g.stroke();
  }

  // Through the points (and back to the first, if closed).
  function polyT(g, pts, closed, a, b) {
    if (b <= a) return;
    const Q = closed ? [...pts, pts[0]] : pts, lens = [];
    let L = 0;
    for (let i = 1; i < Q.length; i++) { lens.push(Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1])); L += lens[i - 1]; }
    const A = a * L, B = b * L;
    let s = 0, started = false;
    g.beginPath();
    for (let i = 1; i < Q.length; i++) {
      const l = lens[i - 1], e = s + l, [x0, y0] = Q[i - 1], [x1, y1] = Q[i];
      if (e > A && s < B && l > 0) {
        const u0 = Math.max(0, (A - s) / l), u1 = Math.min(1, (B - s) / l);
        if (!started) { g.moveTo(x0 + (x1 - x0) * u0, y0 + (y1 - y0) * u0); started = true; }
        g.lineTo(x0 + (x1 - x0) * u1, y0 + (y1 - y0) * u1);
      }
      s = e;
    }
    if (started) g.stroke();
  }

  // A ring of n ticks from r0 out to r1, turned by `rot`, every `major`-th reaching further
  // in. Only the ticks whose place round the ring lies from `a` to `b` show: a repeater,
  // revealed.
  function ticksT(g, n, r0, r1, rot, a, b, major = 0) {
    if (b <= a) return;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const u = i / n;
      if (u < a || u >= b) continue;
      const c = Math.cos(rot + u * TAU), s = Math.sin(rot + u * TAU), ri = major && i % major === 0 ? r0 - (r1 - r0) * 0.8 : r0;
      g.moveTo(c * ri, s * ri);
      g.lineTo(c * r1, s * r1);
    }
    g.stroke();
  }

  // A polyline whose x only ever grows, drawn only where it lies from x = xa to xb.
  function clipX(g, pts, xa, xb) {
    if (xb <= xa) return;
    let started = false;
    g.beginPath();
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (x1 <= xa || x0 >= xb) continue;
      const u0 = x0 < xa ? (xa - x0) / (x1 - x0) : 0, u1 = x1 > xb ? (xb - x0) / (x1 - x0) : 1;
      if (!started) { g.moveTo(x0 + (x1 - x0) * u0, y0 + (y1 - y0) * u0); started = true; }
      g.lineTo(x0 + (x1 - x0) * u1, y0 + (y1 - y0) * u1);
    }
    if (started) g.stroke();
  }

  // How big something that pops is: up from nothing with a little overshoot as `u` goes 0
  // to 1, and back down to nothing as `v` does.
  const pop = (u, v) => ease.tick(u) * (1 - ease.inOut(clamp(v)));

  // A small ring (a pivot, a corner, a bob) at x, y, popping in and out.
  function node(g, x, y, rad, u, v, fill = false) {
    const k = pop(u, v);
    if (k <= 0.001) return;
    g.beginPath();
    g.arc(x, y, rad * k, 0, TAU);
    if (fill) g.fill(); else g.stroke();
  }

  // A crosshair of arm s, popping in and out, ringed if asked.
  function mark(g, s, u, v, ring = false) {
    const k = pop(u, v) * s;
    if (k <= 0.01) return;
    g.beginPath();
    g.moveTo(-k, 0); g.lineTo(k, 0);
    g.moveTo(0, -k); g.lineTo(0, k);
    if (ring) { g.moveTo(k * 0.55, 0); g.arc(0, 0, k * 0.55, 0, TAU); }
    g.stroke();
  }

  // A wedge shaded with a fan of lines from the middle, centred on angle `a`, `w` wide,
  // from r0 out to r1, drawn outward from `lo` to `hi`, with its rim once it's out.
  function fan(g, a, w, r0, r1, lo, hi) {
    if (hi <= lo) return;
    const ra = r0 + (r1 - r0) * lo, rb = r0 + (r1 - r0) * hi;
    g.beginPath();
    for (let i = 0; i <= 5; i++) {
      const c = Math.cos(a - w / 2 + w * i / 5), s = Math.sin(a - w / 2 + w * i / 5);
      g.moveTo(c * ra, s * ra);
      g.lineTo(c * rb, s * rb);
    }
    g.stroke();
    if (hi >= 1) { g.beginPath(); g.arc(0, 0, r1, a - w / 2, a + w / 2); g.stroke(); }
  }

  // ---------- The figures ----------
  // Each kind: how often it's picked (`w`), how big it is (`R`, design px), how much room it
  // takes when the figures are spaced (`room`, a fraction of R), what it's made of (`make`,
  // from its own randomness) and how it's drawn about its own middle at time t, drawn `on`
  // of the way and erased `off` of the way.
  const KINDS = {
    // A dial: its rim; a ring of ticks ticking round a tick at a time, like the clocks; an
    // inner ring; often a ring of fewer ticks turning the other way; often a hand sweeping
    // round; and a centre mark.
    dial: {
      w: 3, R: r => 130 + r() ** 1.6 * 290,
      make: r => {
        const ticks = [60, 72, 120][Math.floor(r() * 3)];
        return {
          a0: r() * TAU, ticks, major: ticks / 12, every: 1 + r() * 2.5, ph: r(), dir: r() < 0.6 ? 1 : -1,
          inner: 0.6 + r() * 0.18, ring: r() < 0.6 ? [12, 24, 36][Math.floor(r() * 3)] : 0,
          turn: (r() < 0.5 ? -1 : 1) * TAU / (70 + r() * 110),
          hand: r() < 0.7 ? (r() < 0.5 ? -1 : 1) * TAU / (25 + r() * 50) : 0,
        };
      },
      draw(g, f, t, on, off) {
        const p = f.p, R = f.R, q = i => [stagger(off, i, 5), stagger(on, i, 5)];
        g.lineWidth = 2.4;
        arcT(g, R, p.a0, TAU, ...q(0));
        g.lineWidth = 1.5;
        g.globalAlpha = f.w * 0.85;
        ticksT(g, p.ticks, R * 0.93, R * 0.985, p.a0 + stepped(t, p.every, 0.4, p.dir * TAU / p.ticks, p.ph), ...q(1), p.major);
        g.lineWidth = 1.7;
        g.globalAlpha = f.w * 0.7;
        arcT(g, R * p.inner, p.a0 + 2, -TAU, ...q(2));
        if (p.ring) ticksT(g, p.ring, R * p.inner * 0.9, R * p.inner * 0.97, p.turn * t, ...q(3));
        g.globalAlpha = f.w * 0.8;
        if (p.hand) {
          const a = p.a0 + p.hand * t;
          lineT(g, 0, 0, Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86, ...q(4));
        }
        g.globalAlpha = f.w;
        mark(g, 9 + R * 0.04, on, off, true);
      },
    },

    // Dashed orbits: a dashed circle, often another inside it, their dashes marching round
    // opposite ways, and a segment travelling round the outer one with a dot at its head.
    orbit: {
      w: 2, R: r => 90 + r() ** 1.4 * 230,
      make: r => ({
        a0: r() * TAU, dash: [5 + r() * 9, 7 + r() * 12], march: (r() < 0.5 ? -1 : 1) * (6 + r() * 14),
        inner: r() < 0.65 ? 0.55 + r() * 0.2 : 0, seg: 0.07 + r() * 0.1, speed: (r() < 0.5 ? -1 : 1) * TAU / (9 + r() * 14),
      }),
      draw(g, f, t, on, off) {
        const p = f.p, R = f.R, q = i => [stagger(off, i, 3), stagger(on, i, 3)];
        g.setLineDash(p.dash);
        g.lineWidth = 1.7;
        g.lineDashOffset = -t * p.march;
        arcT(g, R, p.a0, TAU, ...q(0));
        if (p.inner) {
          g.lineDashOffset = t * p.march;
          g.globalAlpha = f.w * 0.7;
          arcT(g, R * p.inner, p.a0, -TAU, ...q(1));
        }
        g.setLineDash([]);
        const [a, b] = q(2), head = p.a0 + p.speed * t, len = p.seg * TAU * Math.sign(p.speed);
        if (b > a) {
          g.globalAlpha = f.w * (b - a);
          g.lineWidth = 2.6;
          g.beginPath();
          g.arc(0, 0, R, head - len, head, len < 0);
          g.stroke();
          node(g, Math.cos(head) * R, Math.sin(head) * R, 5, 1, 0, true);
        }
        g.globalAlpha = f.w;
        mark(g, 8 + R * 0.04, on, off);
      },
    },

    // A compass construction: a circle; a polygon in it, turning slowly round; its
    // diagonals (a triangle's radii); and a small ring at each corner.
    construction: {
      w: 2.5, R: r => 80 + r() ** 1.3 * 200,
      make: r => ({ n: 3 + Math.floor(r() * 4), a0: r() * TAU, spin: (r() < 0.5 ? -1 : 1) * TAU / (50 + r() * 110), lines: r() < 0.75 }),
      draw(g, f, t, on, off) {
        const p = f.p, R = f.R, q = i => [stagger(off, i, 4, 0.5), stagger(on, i, 4, 0.5)];
        g.lineWidth = 2;
        arcT(g, R, p.a0, TAU, ...q(0));
        const rot = p.a0 + p.spin * t, pts = Array.from({ length: p.n }, (_, i) => [Math.cos(rot + i / p.n * TAU) * R, Math.sin(rot + i / p.n * TAU) * R]);
        g.lineWidth = 1.7;
        polyT(g, pts, true, ...q(1));
        if (p.lines) {
          const [a, b] = q(2);
          g.lineWidth = 1.2;
          g.globalAlpha = f.w * 0.6;
          if (p.n === 3) for (const [x, y] of pts) lineT(g, 0, 0, x, y, a, b);
          else for (let i = 0; i < p.n; i++) for (let j = i + 2; j < p.n - (i === 0 ? 1 : 0); j++) lineT(g, ...pts[i], ...pts[j], a, b);
          g.globalAlpha = f.w;
        }
        const [a, b] = q(3);
        g.lineWidth = 1.4;
        for (const [x, y] of pts) node(g, x, y, 6, b, a);
      },
    },

    // Nested squares, each sitting corner-in inside the last and swinging to and fro on its
    // own, so they slip out of line and back.
    squares: {
      w: 1.3, R: r => 80 + r() * 150,
      make: r => ({ n: 3 + Math.floor(r() * 3), a0: r() * TAU, amp: 0.12 + r() * 0.22, per: 12 + r() * 16 }),
      draw(g, f, t, on, off) {
        const p = f.p;
        for (let j = 0, s = f.R; j < p.n; j++, s *= Math.SQRT1_2) {
          const a = p.a0 + Math.PI / 4 * j + p.amp * Math.sin(TAU * t / (p.per * (1 + 0.37 * j)) + j * 1.3);
          g.lineWidth = 1.9 - 0.2 * j;
          g.globalAlpha = f.w * (1 - 0.12 * j);
          polyT(g, [0, 1, 2, 3].map(i => [Math.cos(a + i * Math.PI / 2) * s, Math.sin(a + i * Math.PI / 2) * s]), true,
            stagger(off, j, p.n, 0.5), stagger(on, j, p.n, 0.5));
        }
        g.globalAlpha = f.w;
      },
    },

    // A pendulum: its swing marked out in degrees, the rod and bob swinging, and a pair of
    // opposite wedges shaded in fans, swinging with it like a balance's sweep.
    pendulum: {
      w: 1.5, R: r => 120 + r() * 170,
      make: r => ({ amp: 0.3 + r() * 0.3, per: 2.6 + r() * 3.2, ph: r() * TAU, wedge: 0.2 + r() * 0.2, twin: r() < 0.6, down: Math.PI / 2 + (r() - 0.5) * 0.4 }),
      draw(g, f, t, on, off) {
        const p = f.p, R = f.R, q = i => [stagger(off, i, 4), stagger(on, i, 4)];
        const th = p.down + p.amp * Math.sin(TAU * t / p.per + p.ph), span = p.amp + 0.15;
        let [a, b] = q(0);
        g.lineWidth = 1.5;
        arcT(g, R * 0.92, p.down - span, span * 2, a, b);
        const n = Math.round(span * 2 / (Math.PI / 36)); // a tick every 5 degrees
        g.globalAlpha = f.w * 0.7;
        g.beginPath();
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          if (u < a || u > b) continue;
          const ang = p.down - span + span * 2 * u, r0 = R * (i % 3 ? 0.89 : 0.85);
          g.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
          g.lineTo(Math.cos(ang) * R * 0.92, Math.sin(ang) * R * 0.92);
        }
        g.stroke();
        g.globalAlpha = f.w;
        [a, b] = q(1);
        g.lineWidth = 1.8;
        lineT(g, 0, 0, Math.cos(th) * R * 0.8, Math.sin(th) * R * 0.8, a, b);
        node(g, Math.cos(th) * R * 0.8, Math.sin(th) * R * 0.8, R * 0.06, b, a);
        [a, b] = q(2);
        g.lineWidth = 1.1;
        g.globalAlpha = f.w * 0.5;
        fan(g, th, p.wedge, R * 0.12, R * 0.62, a, b);
        if (p.twin) fan(g, th + Math.PI, p.wedge, R * 0.12, R * 0.62, a, b);
        g.globalAlpha = f.w;
        [a, b] = q(3);
        g.lineWidth = 1.4;
        node(g, 0, 0, 7, b, a);
      },
    },

    // A rule: a long strip with ticks along one edge, longer every fifth and tenth, sliding
    // along it, and an index moving to and fro beneath.
    ruler: {
      w: 1.5, R: r => 170 + r() * 300, room: 0.55,
      make: r => ({
        rot: r() < 0.65 ? Math.floor(r() * 2) * Math.PI / 2 : (r() - 0.5) * 1.6, wid: 22 + r() * 16, step: 10 + r() * 6,
        slide: (r() < 0.5 ? -1 : 1) * (3 + r() * 9), per: 9 + r() * 12, ph: r() * TAU,
      }),
      draw(g, f, t, on, off) {
        const p = f.p, L = f.R, w = p.wid, q = i => [stagger(off, i, 3), stagger(on, i, 3)];
        g.rotate(p.rot);
        g.lineWidth = 1.8;
        polyT(g, [[-L, -w / 2], [L, -w / 2], [L, w / 2], [-L, w / 2]], true, ...q(0));
        let [a, b] = q(1);
        const shift = p.slide * t;
        g.lineWidth = 1.3;
        g.globalAlpha = f.w * 0.8;
        g.beginPath();
        for (let i = Math.ceil((-L - shift) / p.step); ; i++) {
          const x = i * p.step + shift, u = (x + L) / (2 * L);
          if (x > L) break;
          if (u < a || u > b) continue;
          g.moveTo(x, -w / 2);
          g.lineTo(x, -w / 2 + w * (i % 10 === 0 ? 0.7 : i % 5 === 0 ? 0.5 : 0.3));
        }
        g.stroke();
        [a, b] = q(2);
        if (b > a) {
          const x = L * 0.85 * Math.sin(TAU * t / p.per + p.ph);
          g.globalAlpha = f.w * (b - a);
          g.lineWidth = 1.4;
          g.beginPath();
          g.moveTo(x, w / 2 + 5); g.lineTo(x - 7, w / 2 + 17); g.lineTo(x + 7, w / 2 + 17); g.closePath();
          g.stroke();
        }
        g.globalAlpha = f.w;
      },
    },

    // A cluster of registration marks and crosshairs popping in one after another, each
    // snapping round an eighth of a turn now and then, often linked by a dotted line.
    marks: {
      w: 1.3, R: r => 60 + r() * 110,
      make: r => ({
        pts: Array.from({ length: 3 + Math.floor(r() * 4) }, () => [r() * 2 - 1, r() * 2 - 1, 8 + r() * 13, r() < 0.5]),
        every: 2.5 + r() * 4, ph: r(), link: r() < 0.6,
      }),
      draw(g, f, t, on, off) {
        const p = f.p, R = f.R, n = p.pts.length;
        if (p.link) {
          g.setLineDash([3, 7]);
          g.lineWidth = 1.1;
          g.globalAlpha = f.w * 0.6;
          polyT(g, p.pts.map(([x, y]) => [x * R, y * R]), false, stagger(off, 0, 2), stagger(on, 1, 2));
          g.setLineDash([]);
          g.globalAlpha = f.w;
        }
        const spin = stepped(t, p.every, 0.5, Math.PI / 4, p.ph);
        g.lineWidth = 1.5;
        p.pts.forEach(([x, y, s, ring], i) => {
          g.save();
          g.translate(x * R, y * R);
          g.rotate(spin);
          mark(g, s, stagger(on, i, n, 0.5), stagger(off, i, n, 0.5), ring);
          g.restore();
        });
      },
    },

    // A worldline: a line drawn on from one end, branching as it goes, each branch curving
    // away and running on beside it, a ring at each split; now and then a pulse of light
    // runs along it.
    worldline: {
      w: 1.6, R: r => 260 + r() * 260, room: 0.6,
      make: r => ({
        tilt: (r() - 0.5) * 0.35, every: 4 + r() * 5, ph: r() * 10,
        splits: Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({
          x: -0.75 + r() * 1.2, dy: (r() < 0.5 ? -1 : 1) * (0.1 + r() * 0.2), run: 0.15 + r() * 0.15,
        })),
      }),
      draw(g, f, t, on, off) {
        const p = f.p, R = f.R, xa = -R + 2 * R * off, xb = -R + 2 * R * on;
        g.rotate(p.tilt);
        g.lineWidth = 1.9;
        lineT(g, -R, 0, R, 0, off, on);
        g.lineWidth = 1.4;
        for (const s of p.splits) {
          const x0 = s.x * R, x1 = x0 + s.run * R, dy = s.dy * R, pts = [];
          for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push([x0 + (x1 - x0) * u, dy * u * u * (3 - 2 * u)]); }
          pts.push([R, dy]);
          g.globalAlpha = f.w * 0.75;
          clipX(g, pts, xa, xb);
          g.globalAlpha = f.w;
          node(g, x0, 0, 5, (xb - x0) / 60, (xa - x0) / 60);
        }
        // The pulse, running from one end to the other.
        const u = ((t + p.ph) / p.every) % 1, x = -R + 2 * R * u, lo = Math.max(x - 34, xa), hi = Math.min(x + 34, xb);
        if (hi > lo) {
          g.globalAlpha = Math.min(1, f.w * 1.6) * Math.sin(Math.PI * u);
          g.lineWidth = 2.8;
          lineT(g, lo, 0, hi, 0, 0, 1);
          g.globalAlpha = f.w;
        }
      },
    },
  };
  const NAMES = Object.keys(KINDS), TOTAL = NAMES.reduce((s, k) => s + KINDS[k].w, 0);

  // A kind, by how often each is picked.
  function pick(r) {
    let u = r() * TOTAL;
    for (const k of NAMES) if ((u -= KINDS[k].w) <= 0) return k;
    return NAMES[0];
  }

  // ---------- Long construction lines, right across the frame ----------
  // Drawn on from one end, sometimes ruled twice, often with small ticks along them.
  function drawRule(g, f, on, off) {
    const { x0, y0, x1, y1 } = f, len = Math.hypot(x1 - x0, y1 - y0), nx = (y0 - y1) / len, ny = (x1 - x0) / len;
    g.lineWidth = 1.3;
    lineT(g, x0, y0, x1, y1, off, on);
    if (f.gap) lineT(g, x0 + nx * f.gap, y0 + ny * f.gap, x1 + nx * f.gap, y1 + ny * f.gap, off, on);
    if (!f.tick) return;
    g.beginPath();
    for (let d = f.tick; d < len; d += f.tick) {
      const u = d / len;
      if (u < off || u > on) continue;
      const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
      g.moveTo(x - nx * 7, y - ny * 7);
      g.lineTo(x + nx * 7, y + ny * 7);
    }
    g.stroke();
  }

  // ---------- The field ----------
  class Field {
    // `random` makes the figures and where they go (seed it for repeatable stills).
    constructor(random = Math.random) {
      this.r = random;
      this.cam = { x: 0, y: 0 };
      this.figs = [];
      this.rules = [];
      this.next = null;     // when the next figure may come
      this.nextRule = null;
      this.rush = false;    // drawing a fresh set after a worldline shift
      this.last = null;     // the kind drawn last: never drawn twice running
      this.clear = null;    // the middle of the centrepiece, kept clear
      this.layer = null;
    }

    build(view) { this.layer = canvas(Math.ceil(view.W * RES), Math.ceil(view.H * RES)); }

    // `focus`: the centrepiece's pool of negative space (design px: centre and radii). New
    // figures keep out of the middle half of it.
    keepClear(focus) { this.clear = { x: focus.x, y: focus.y, rx: focus.rx * 0.5, ry: focus.ry * 0.5 }; }

    update(t) {
      const r = this.r;
      if (this.next == null) this.boot(t);
      this.figs = this.figs.filter(f => t < f.dies + f.outT);
      this.rules = this.rules.filter(f => t < f.dies + f.outT);
      if (t >= this.next && this.figs.length < COUNT) {
        this.figs.push(this.figure(t));
        this.next = t + (this.rush ? 0.1 + r() * 0.25 : 0.8 + r() * 1.6);
        if (this.figs.length >= COUNT) this.rush = false;
      }
      if (t >= this.nextRule && this.rules.length < RULES) {
        this.rules.push(this.rule(t));
        this.nextRule = t + (this.rush ? 0.4 : 5 + r() * 10);
      }
    }

    // At the start: a full set already, at every stage of their lives.
    boot(t) {
      for (let i = 0; i < COUNT; i++) this.figs.push(this.figure(t, this.r()));
      for (let i = 0; i < RULES; i++) this.rules.push(this.rule(t, this.r()));
      this.next = t + 1;
      this.nextRule = t + 6;
    }

    // A new figure, `age` (0 to 1) of the way through its life.
    figure(t, age = 0) {
      const r = this.r;
      let kind = pick(r);
      while (kind === this.last) kind = pick(r);
      this.last = kind;
      const k = KINDS[kind], R = k.R(r), room = R * (k.room || 1), seed = Math.floor(r() * 2 ** 31);
      const at = this.spot(room), depth = -1.3 + r() * 0.8;
      return {
        kind, R, room, x: at.x, y: at.y, depth, seed,
        w: 0.55 + 0.45 * (depth + 1.3) / 0.8, // the deeper, the fainter
        drift: { ax: 10 + r() * 30, ay: 8 + r() * 24, px: 50 + r() * 70, py: 60 + r() * 80, ph: r() * TAU },
        spin: (r() - 0.5) * 0.004, // how fast it turns as a whole (rad/s)
        p: k.make(rng(seed)),
        ...lifetime(t, age, 30 + r() * 40, this.rush ? 0.9 + r() * 0.7 : 2.5 + r() * 2.5, 2 + r() * 2),
      };
    }

    // Where a figure taking up `room` goes: of forty places tried, the one with the most
    // room to spare, from the figures already there (allowing for theirs) and from the
    // middle of the centrepiece. It may hang off the edge of the frame, but not lie beyond.
    spot(room) {
      const r = this.r, c = this.clear;
      let best = null, most = -Infinity;
      for (let i = 0; i < 40; i++) {
        const x = -130 + r() * 2820, y = -90 + r() * 1620;
        let spare = Infinity;
        for (const f of this.figs) spare = Math.min(spare, Math.hypot(x - f.x, y - f.y) - room - f.room);
        if (c) spare = Math.min(spare, (Math.hypot((x - c.x) / c.rx, (y - c.y) / c.ry) - 1) * Math.min(c.rx, c.ry) - room * 0.5);
        if (spare > most) { most = spare; best = { x, y }; }
      }
      return best;
    }

    // A new long construction line, `age` (0 to 1) of the way through its life: level,
    // upright or slanting; a level or upright one as far as it can be from the others
    // running its way.
    rule(t, age = 0) {
      const r = this.r, k = r(), ax = k < 0.4 ? 'h' : k < 0.8 ? 'v' : 's';
      let pos = 0, x0, y0, x1, y1;
      if (ax !== 's') {
        let most = -1;
        for (let i = 0; i < 10; i++) {
          const c = ax === 'h' ? 60 + r() * 1320 : 60 + r() * 2440;
          let spare = 1e9;
          for (const o of this.rules) if (o.ax === ax) spare = Math.min(spare, Math.abs(o.pos - c));
          if (spare > most) { most = spare; pos = c; }
        }
      }
      if (ax === 'h') [x0, y0, x1, y1] = [-80, pos, 2640, pos];
      else if (ax === 'v') [x0, y0, x1, y1] = [pos, -80, pos, 1520];
      else {
        const a = (r() < 0.5 ? 1 : -1) * (0.25 + r() * 0.6), cx = 400 + r() * 1760, cy = 200 + r() * 1040;
        [x0, y0, x1, y1] = [cx - Math.cos(a) * 1700, cy - Math.sin(a) * 1700, cx + Math.cos(a) * 1700, cy + Math.sin(a) * 1700];
      }
      if (r() < 0.5) [x0, y0, x1, y1] = [x1, y1, x0, y0]; // drawn on from either end
      return {
        x0, y0, x1, y1, ax, pos, depth: -1.1 + r() * 0.4, w: 0.4 + r() * 0.25,
        gap: r() < 0.3 ? 8 + r() * 8 : 0, tick: r() < 0.5 ? 120 + r() * 160 : 0,
        ...lifetime(t, age, 40 + r() * 50, this.rush ? 1.2 : 3 + r() * 3, 2.5 + r() * 2),
      };
    }

    // A worldline shift: everything erases itself at once, quickly, and a fresh set draws
    // itself on, quickly, one after another.
    shift(t) {
      const r = this.r;
      for (const f of [...this.figs, ...this.rules]) {
        if (f.dies > t) { f.dies = t + r() * 0.4; f.outT = 0.5 + r() * 0.4; }
      }
      this.rush = true;
      this.next = t + 0.8;
      this.nextRule = t + 1.2;
    }

    // Where figure f is at time t (design px): home, drifting its own slow way, and moved
    // with the cursor by its own depth (they're deep, so they drift with it).
    where(f, t) {
      const d = f.drift;
      return {
        x: f.x + d.ax * Math.sin(TAU * t / d.px + d.ph) - this.cam.x * P * f.depth,
        y: f.y + d.ay * Math.cos(TAU * t / d.py + d.ph * 1.7) - this.cam.y * P * f.depth * 0.7,
      };
    }

    // `a`: how bright the lines are (Screen's opacity, 0 to 1).
    draw(ctx, view, t, a) {
      if (!this.layer || a <= 0) return;
      const g = this.layer.getContext('2d'), s = view.S * RES;
      const X = x => (view.ox + x * view.S) * RES, Y = y => (view.oy + y * view.S) * RES;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.clearRect(0, 0, this.layer.width, this.layer.height);
      g.strokeStyle = g.fillStyle = `rgb(${LINE})`;
      g.lineCap = g.lineJoin = 'round';
      for (const f of this.rules) {
        const [on, off] = phase(f, t);
        if (on <= 0 || off >= 1) continue;
        g.setTransform(s, 0, 0, s, X(-this.cam.x * P * f.depth), Y(-this.cam.y * P * f.depth * 0.7));
        g.globalAlpha = f.w;
        drawRule(g, f, on, off);
      }
      for (const f of this.figs) {
        const [on, off] = phase(f, t);
        if (on <= 0 || off >= 1) continue;
        const at = this.where(f, t);
        g.setTransform(s, 0, 0, s, X(at.x), Y(at.y));
        g.rotate(f.spin * (t - f.born));
        g.globalAlpha = f.w;
        KINDS[f.kind].draw(g, f, t, on, off);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(this.layer, 0, 0, view.W, view.H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  return { Field, KINDS, COUNT, RULES, stagger, phase };
})();
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node tools/test.js`
Expected: the six `schematic:` tests print `ok`; `1 failing` (the pre-existing rig test only). If the spacing test's thresholds (0.45 of the combined room, a 420 px bare patch) fail by a little, look at where. Change the spot finder (more places tried), not the thresholds, unless the frame really can't hold them.

- [ ] **Step 6: Wire it into the wallpaper**

In `wallpaper/js/main.js`, replace:

```js
  // The schematics: dim drafting sheets the whole scene is drawn over. The setting (0-100,
  // 50 as designed) scales how far their paper lifts the black.
  const sheets = new Schematic.Sheets();
  const schematic = () => Config.get('schematic') / 50;
  backdrop.cam = sheets.cam = scene.dust.cam;
```

with:

```js
  // The schematics: faint drafting figures behind everything, drawing themselves on and
  // off. The setting (0-100, 50 as designed) scales how bright their lines are.
  const figures = new Schematic.Field(Kit.rng(seed + 11));
  const schematic = () => Config.get('schematic') / 50;
  backdrop.cam = figures.cam = scene.dust.cam;
```

In `controller.onShift`, change `if (worldline) { scene.ink.shift(t); light.flare(t); }` to
`if (worldline) { scene.ink.shift(t); light.flare(t); figures.shift(t); }`, and in its
comment add that a real shift also redraws the schematics.

In `buildSprites()`, replace `sheets.build(view);` with:

```js
    figures.build(view);
    figures.keepClear(f);
```

In `render(t)`, replace:

```js
    // The schematics first: the paper everything else is drawn on.
    const sk = schematic();
    if (sk > 0) sheets.draw(ctx, view, t, 0.09 * sk);
```

with:

```js
    // The schematics first: faint lines on the black, everything else drawn over them.
    const sk = schematic();
    if (sk > 0) figures.draw(ctx, view, t, 0.2 * sk);
```

In `step(t)`, after `light.update(t);` add `figures.update(t);`.

- [ ] **Step 7: Look at it**

Render `/wallpaper/?still=8&cursor=0,0`, `still=30`, `still=60`, `?still=12&shiftAt=6`, and `centre=time` with headless Chrome at 1280×720. Expected: faint light figures spread over the frame behind the clockwork, at different stages (some drawing on), no console errors.

- [ ] **Step 8: Commit**

```bash
git add wallpaper/js/kit.js wallpaper/js/mech.js wallpaper/js/schematic.js wallpaper/js/main.js tools/test.js
git commit -m "Schematics as figures that draw themselves on, move their own ways and erase"
```

---

### Task 2: Tune, measure and document

**Files:**
- Modify: `wallpaper/js/schematic.js`, `wallpaper/js/main.js` (only the tuned numbers)
- Modify: `wallpaper/js/config.js`, `tools/preview.html` (the setting's description)
- Modify: `README.md`, `workshop/WORKSHOP.md`

**Interfaces:**
- Consumes: everything Task 1 produces; changes no names.

- [ ] **Step 1: Tune by eye**

Render stills at 1280×720 and 2560×1440 (crop 1:1 regions) at a few moments. Also render a short sequence 1 s apart (`still=20` … `still=26`) to see the motion step by step. Expected:
- the lines are plainly there but fainter than the deep clockwork;
- the black stays black between them;
- they're spread evenly (none piled up, no bare quarter);
- each kind reads (dial ticks, orbit dashes, worldline branches);
- the pool of dark keeps Makise and the digits clear.

Tune in this order: the `0.2` in `main.js`; `LINE`; line widths; `COUNT`; each kind's size range.

- [ ] **Step 2: Measure the cost**

In the browser pane, run `Schematic.Field` with `update` and `draw` against 1920×1080, 2560×1440 and 3840×2160 canvases for 120 frames, reading a pixel back at the end, as for the sheets. Expected: under 1 ms a frame at 2560×1440.

- [ ] **Step 3: Docs**

- `wallpaper/js/config.js`: the `schematic:` comment becomes "how bright the schematics behind everything are: faint drafting figures drawing themselves on and off (50 as designed, 0 turns them off)".
- `tools/preview.html`: the Schematic group's title becomes "How bright the schematics behind everything are: faint drafting figures drawing themselves on and off. 0 turns them off, 50 as designed".
- `README.md`:
  - intro: "over faint drafting figures that draw themselves on and off";
  - settings row: "0–100: the faint drafting figures behind everything (0 turns them off)";
  - "How it behaves": rewrite the **Schematics** bullet for the figures (what they are, their life, how each kind moves, depth and drift, spacing, the shift);
  - performance: rewrite the schematics bullet with the measured cost;
  - code layout: rewrite the `schematic.js` row; the `kit.js` row gains "stepped motion".
- `workshop/WORKSHOP.md`: the schematics feature bullet describes the figures.

- [ ] **Step 4: Run the tests**

Run: `node tools/test.js`
Expected: `1 failing` (the pre-existing rig test only).

- [ ] **Step 5: Commit**

```bash
git add wallpaper/js/schematic.js wallpaper/js/main.js wallpaper/js/config.js tools/preview.html README.md workshop/WORKSHOP.md docs/superpowers
git commit -m "Tune and document the schematic figures"
```
