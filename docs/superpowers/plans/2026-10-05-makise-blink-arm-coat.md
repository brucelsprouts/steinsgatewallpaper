# Makise blinks, her left arm bends, and her coat sways: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Makise blinks now and then, her left forearm bends a little at the elbow and
drifts on its own, the coat around her legs sways more, its folds ripple more, and her tie
sways a little: all as rig effects that can be tuned and repainted in the rig editor.

**Architecture:** `rig.js` gains a `blink` effect (a pull, looked up after the push is
undone: the WE Shake trick), a blink schedule worked out from the time alone, and an
`idle` setting on the springs. `rigmap.py` makes the four new masks from lash lines,
polygons and colours measured on the picture; the shipped rig keeps its hand-touched masks
and gains the new ones. The editor learns Blink (add, preview, arrow, no hold setting).

**Tech Stack:** plain JS (no build), WebGL1 GLSL, Node `tools/test.js`, Python
(Pillow, NumPy, SciPy) for `tools/rigmap.py`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-05-makise-blink-arm-coat-design.md`.
- Keep `wallpaper/js` runnable after every edit (the user previews the working tree live):
  syntax-check each edited module with `node -e "new (require('vm').Script)(require('fs').readFileSync('<file>','utf8'))"`.
- Blink defaults: Travel 20 px, Every 5 s (1.5–30), Length 0.16 s, Doubles 0.15,
  Direction 90. Shipped blink: Travel 24.
- Left forearm: pivot (640, 560), length 290, max 3.5 px, idle 2. Left arm: wind 2, max
  5.8, idle 2.5. Coat hem: max 6. Coat flutter: 0.8. Tie: pivot (425, 292), length 325,
  max 2.5, hold false.
- `makise-rig-0.png` and `makise-rig-1.png` stay byte-identical; only `-2.png`'s blue,
  the new `-3.png` and `makise-rig.js` change.
- Rig MAX 12 → 15.
- Known before this work: `rig: at its strongest nothing folds` fails at 375,135 (the
  hair mask touched up in the editor). Don't repaint the user's mask; report it.

---

### Task 1: Blink and Idle in rig.js

**Files:**
- Modify: `wallpaper/js/rig.js`
- Test: `tools/test.js`

**Interfaces:**
- Produces: `Rig.KINDS.blink` (params `amount`, `every`, `span`, `twice`, `dir`;
  `hold: null`, so normalized blinks have no `hold`); `Rig.shut(t, e)` → 0..1;
  `Motion#shut(t, e)`, `Motion#blink(t)` (blink now); `Rig.blinked(effects, vals, mask, q)`
  → `[x, y]` where the shader takes the colour from; SPRING param `idle` (px, default 0);
  `Rig.MAX === 15`.

- [ ] **Step 1: Write the failing tests** (after `rig: an effect switched off moves nothing`)

```js
test('rig: she blinks now and then, at random, quickly, now and then twice', () => {
  const { Rig } = loadRig(), e = Rig.make('blink');
  // Each blink (from shutting to open again), at 1 ms steps over an hour.
  const blinks = [];
  let open = true;
  for (let i = 0; i < 3600 * 1000; i++) {
    const t = i / 1000, c = Rig.shut(t, e);
    if (c > 0 && open) blinks.push(t);
    open = c === 0;
  }
  assert.ok(blinks.length > 600 && blinks.length < 1000, `${blinks.length} blinks an hour`);
  const gaps = blinks.slice(1).map((t, i) => t - blinks[i]);
  const doubles = gaps.filter(g => g < 3 * e.span).length;
  assert.ok(doubles > blinks.length * 0.05 && doubles < blinks.length * 0.3, `${doubles} doubles in ${blinks.length}`);
  const apart = gaps.filter(g => g >= 3 * e.span);
  assert.ok(Math.min(...apart) > 0.25 * e.every - 3 * e.span, `blinks ${Math.min(...apart).toFixed(2)} s apart`);
  assert.ok(Math.max(...apart) < 1.75 * e.every + 3 * e.span, `no blink for ${Math.max(...apart).toFixed(2)} s`);
  // Shut for a frame or two: at 30 fps at least two frames 85% shut, at 15 fps at least one.
  for (const fps of [30, 15]) {
    const phase = 0.37 / fps;
    for (const b of blinks.slice(0, 300)) {
      let frames = 0;
      for (let f = Math.ceil((b - phase) * fps); f / fps + phase < b + e.span; f++) if (Rig.shut(f / fps + phase, e) >= 0.85) frames++;
      assert.ok(frames >= (fps === 30 ? 2 : 1), `${frames} shut frames at ${fps} fps for the blink at ${b.toFixed(3)}`);
    }
  }
});

test('rig: shut, a blink shows what is above the eye; open, it moves nothing', () => {
  const { Rig } = loadRig();
  const rig = Rig.normalize({ size: [100, 100], maps: ['a.png'], effects: [
    { kind: 'hold', mask: [0, 0] }, { kind: 'blink', mask: [0, 1], amount: 20 },
  ] });
  // An eye at x 40..60: its lash at y 30..35 lands on 50..55; the lid above stretches down.
  const paint = (x, y) => (x < 40 || x > 60 ? 0 : y < 20 ? 0 : y < 50 ? (y - 20) / 30 : y <= 55 ? 1 : 0);
  const mask = (m, q) => [1, paint(q[0], q[1]), 0]; // all of it held: a blink pays no heed
  const blink = rig.effects[1], m = new Rig.Motion();
  assert.ok(!('hold' in blink), 'a blink has no hold setting');
  m.blink(100);
  const shut = m.values(100 + blink.span * 0.42, rig.effects);
  for (let y = 36; y <= 55; y++) {
    const q = Rig.blinked(rig.effects, shut, mask, [50, y]);
    assert.ok(q[1] <= 35.01 && q[0] === 50, `${y} shows ${q[1].toFixed(2)}`);
  }
  for (const p of [[50, 60], [30, 50], [50, 10]]) assert.deepStrictEqual(Rig.blinked(rig.effects, shut, mask, p), p);
  assert.deepStrictEqual([...Rig.push(rig.effects, shut, mask, [50, 50])], [0, 0], 'the push leaves it to the blink');
  let t = 0;
  while (Rig.shut(t, blink) > 0 || Math.abs(t - 100) < 1) t += 0.25;
  assert.deepStrictEqual(Rig.blinked(rig.effects, m.values(t, rig.effects), mask, [50, 50]), [50, 50]);
  const src = Rig.fragment(rig.effects, 1);
  assert.ok(src.includes('l += a0.g * fx[2].xy') && src.includes('q = lid(q)') && !src.includes('d += a0.g'), 'the shader blinks after the push');
});

test('rig: with Idle a spring drifts about on its own, slowly, each in its own time', () => {
  const { Rig } = loadRig(), m = new Rig.Motion();
  const fx = [Rig.make('swing', 'Left arm'), Rig.make('swing', 'Left forearm')];
  for (const e of fx) { e.wind = 0; e.idle = 3; }
  const xs = [[], []];
  for (let i = 0; i <= 150 * 30; i++) {
    const t = i / 30;
    m.update(t, fx, { x: 0, y: 0 });
    if (t > 10) fx.forEach((e, j) => xs[j].push(m.spring(e).off().x));
  }
  for (const x of xs) {
    assert.ok(Math.max(...x) > 1.2 && Math.min(...x) < -1.2, `drifts ${Math.min(...x).toFixed(1)}..${Math.max(...x).toFixed(1)} px`);
    assert.ok(Math.max(...x.slice(1).map((v, i) => Math.abs(v - x[i]))) < 0.1, 'and slowly');
  }
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length, [ma, mb] = xs.map(mean);
  const cov = mean(xs[0].map((v, i) => (v - ma) * (xs[1][i] - mb))), sd = (a, m0) => Math.sqrt(mean(a.map(v => (v - m0) ** 2)));
  assert.ok(cov / sd(xs[0], ma) / sd(xs[1], mb) < 0.9, 'the two drift in step');
  assert.strictEqual(Rig.make('sway').idle, 0, 'no drifting unless asked');
});
```

- [ ] **Step 2: Run** `node tools/test.js 2>&1 | grep -E "FAIL|blink|Idle" -A1`
  Expected: the three new tests FAIL (`Rig.shut is not a function` and the like).

- [ ] **Step 3: Implement in `wallpaper/js/rig.js`**

  1. Header comment: add `blink     shuts the eyes now and then: what's painted takes its colour from further up, so the lid comes down`.
  2. `const MAX = 15;     // effects in one rig (three masks to each of five textures)`
  3. SPRING gains `idle: P(0, 0, 20, 0.1, 'Idle', 'px', 'How far it drifts about on its own, slowly, as if she shifted it'),`.
  4. KINDS gains:

```js
    blink: { label: 'Blink', color: [250, 226, 80], hold: null,
      params: {
        amount: P(20, 0, 60, 0.5, 'Travel', 'px', 'How far the lid comes down where it is painted at full strength'),
        every: P(5, 1.5, 30, 0.1, 'Every', 's', 'Seconds between blinks on average, from a quarter of this to 1.75 times'),
        span: P(0.16, 0.06, 0.6, 0.01, 'Length', 's', 'How long a blink takes, shutting and opening again'),
        twice: P(0.15, 0, 1, 0.01, 'Doubles', '', 'How often a second blink follows straight after'),
        dir: P(90, 0, 360, 1, 'Direction', '°', 'Which way the lid comes down: 90 down'),
      },
      tip: 'Shuts the eyes now and then: what is painted takes its colour from further up, so the lid comes down. Paint each eye strongest just above its lower lash, fading up over the lid, with a sharp edge under the lower lash' },
```

  5. `normalize`: `if (raw.kind !== 'hold' && K.hold !== null) e.hold = ...` (comment: a blink pays Hold still no heed).
  6. Motion section: `drift(t, seed)`, `seedOf(name)`, `blinkCurve(u, span)`, `shut(t, e)`:

```js
  // How far an effect drifts about on its own at time t (about -1..1): slow waves out of
  // step with one another, timed by its own `seed` (0..1).
  function drift(t, seed) {
    return 0.5 * Math.sin(t * 0.29 + seed * 6.1) + 0.32 * Math.sin(t * 0.53 + seed * 9.7) + 0.18 * Math.sin(t * 1.07 + seed * 4.3);
  }
  // An effect's own seed, from its name.
  function seedOf(name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 100003;
    return hash(h, 61);
  }

  // How shut the eyes are `u` seconds into a blink `span` seconds long (0..1): shutting over
  // its first 30%, shut for the next 25%, opening (a little slower) over the rest.
  function blinkCurve(u, span) {
    const x = u / span;
    if (!(x > 0 && x < 1)) return 0;
    if (x < 0.3) return 0.5 - 0.5 * Math.cos(Math.PI * x / 0.3);
    if (x < 0.55) return 1;
    return 0.5 + 0.5 * Math.cos(Math.PI * (x - 0.55) / 0.45);
  }
  // How shut a blink's eyes are at time t (0..1): once at a random moment in each `every`
  // seconds (in its first three quarters), now and then twice in a row. From the time
  // alone, so every blink with the same `every` (both eyes) shuts at once.
  function shut(t, e) {
    const n = Math.floor(t / e.every);
    let c = 0;
    for (let k = n - 1; k <= n; k++) {
      const at = (k + 0.75 * hash(k, 81)) * e.every;
      c = Math.max(c, blinkCurve(t - at, e.span));
      if (hash(k, 82) < e.twice) c = Math.max(c, blinkCurve(t - at - e.span * (1.2 + 0.4 * hash(k, 83)), e.span));
    }
    return c;
  }
```

  7. Spring: `this.seed = seedOf(o.name)`; `rest(w, t)` returns
     `(w * this.o.wind + drift(t, this.seed) * (this.o.idle || 0)) / Math.max(1e-3, this.o.gain)`;
     `snap(bx, by, w, t)` and `step(dt, bx, by, w, t)` pass `t` to `rest`.
  8. Motion: `this.blinkAt = -1e9`; `blink(t) { this.blinkAt = t; }`;
     `shut(t, e) { return Math.max(shut(t, e), blinkCurve(t - this.blinkAt, e.span)); }`;
     `spring(e)` snaps with `at.t`; `update` passes the time of each step:
     `const tt = last.t + (t - last.t) * u, w = this.air(tt).x; for (const s of springs) s.step(dt, x, y, w, tt);`
     and snaps with `t`.
  9. `values`: `else if (e.kind === 'blink') { const k = e.amount * this.shut(t, e); out[A] = Math.cos(rad) * k; out[A + 1] = Math.sin(rad) * k; }`
  10. `fragment`: `used` leaves blinks out; `sum` skips them; after `field` add (only if a
      blink has a mask):

```glsl
// Where a blink takes its colour from instead of q: further up, by as much as is painted
// there and as shut as the eyes are.
vec2 lid(vec2 q) {
  vec2 t = q / size;
  vec4 a2 = texture2D(m2, t);        // the maps the blinks are in
  vec2 l = vec2(0.0);
  l += a2.b * fx[16].xy;             // one line a blink
  return q - l;
}
```
      and `main` becomes `if (still < 0.5) { <the four rounds, if anything else moves> q = lid(q); }`.
  11. `push`: skip `blink`. New `blinked(effects, vals, mask, q)`: `q` less each blink's
      `mask * vals[i * 8 .. + 1]`. Export `shut` and `blinked`.

- [ ] **Step 4: Run** `node tools/test.js 2>&1 | grep -E "^(ok|FAIL)   rig" -A1`
  Expected: the new tests pass; every rig test that passed before still passes (the
  fold test still fails at 375,135 as on main).

- [ ] **Step 5: Commit** `git add wallpaper/js/rig.js tools/test.js && git commit -m "Blink and Idle in the rig"`

### Task 2: Blink in the editor

**Files:** Modify `tools/rig.html`

- [ ] **Step 1:** Add `<button data-add="blink" title="Shuts the eyes now and then: the lid comes down over what's painted">Blink</button>` to the Add list (before Hold still).
- [ ] **Step 2:** Under Preview, beside Gust: `<button id="blink" title="A blink now (K)">Blink</button>`, wired as
  `$('#blink').onclick = () => { ed.motion.blink(ed.t); say('A blink'); };`, key `k` →
  `$('#blink').click()`, and `K blink` in the footer and the keys comment at the top.
- [ ] **Step 3:** The arrow shows for blinks: `(e.kind === 'wave' || e.kind === 'breathe' || e.kind === 'blink')`.
- [ ] **Step 4:** No hold for blinks: `$('#holdrow').hidden = !('hold' in e);`, `if ('hold' in e) { ... }`,
  and in `files()` `if ('hold' in e) d.hold = e.hold;`.
- [ ] **Step 5: Verify** in the browser pane (`preview_start wallpaper`, `/tools/rig.html`):
  no console errors; add a Blink, paint an eye, press K: the lid comes down.
- [ ] **Step 6: Commit** `git commit -am "Blink in the rig editor"`

### Task 3: The new masks, and the shipped rig

**Files:**
- Modify: `tools/rigmap.py`, `wallpaper/img/makise-rig.js`, `wallpaper/img/makise-rig-2.png`
- Create: `wallpaper/img/makise-rig-3.png`
- Test: `tools/test.js`

**Interfaces:** Consumes `Rig.shut`, `Rig.blinked`, the `idle` and `blink` params.

- [ ] **Step 1: Failing tests on the shipped rig**

```js
test('rig: the shipped rig blinks both eyes shut, and nothing else', () => {
  const { Rig } = loadRig(), rig = shippedRig(Rig), mask = masks(rig);
  const blinks = rig.effects.filter(e => e.kind === 'blink');
  assert.strictEqual(blinks.length, 1, 'one blink, so both eyes shut at once');
  const m = new Rig.Motion();
  m.blink(50);
  const vals = m.values(50 + blinks[0].span * 0.42, rig.effects);
  // Columns of each eye: the bottom of its upper lash, and the top of its lower lid.
  for (const [x, lash, lid] of [[372, 151, 170], [380, 149, 171], [388, 150, 168], [448, 129, 148], [452, 128, 147], [458, 127, 148]]) {
    for (let y = lash + 2; y <= lid - 2; y++) {
      const q = Rig.blinked(rig.effects, vals, mask, [x, y]);
      assert.ok(q[1] <= lash + 1, `shut, ${x},${y} shows ${q[1].toFixed(1)} (the lash ends at ${lash})`);
    }
  }
  for (let y = 0; y < rig.size[1] * 0.6; y += 5) {
    for (let x = 0; x < rig.size[0]; x += 5) {
      if (x > 350 && x < 475 && y > 100 && y < 180) continue;
      assert.deepStrictEqual(Rig.blinked(rig.effects, vals, mask, [x, y]), [x, y], `the blink moves ${x},${y}`);
    }
  }
});

test('rig: her left forearm bends at the elbow, a little, without dragging the coat beside it', () => {
  const { Rig } = loadRig(), rig = shippedRig(Rig), mask = masks(rig);
  const fore = rig.effects.find(e => e.name === 'Left forearm'), at = q => mask(fore.mask[0], q)[fore.mask[1]];
  assert.ok(fore && fore.kind === 'swing' && fore.max <= 4, 'a small swing');
  assert.ok(at([712, 820]) > 0.9 && at([700, 720]) > 0.9, 'the hand and forearm turn with it');
  assert.ok(at([600, 420]) < 0.02, 'the upper arm leaves it to the shoulder');
  for (const q of [[580, 700], [590, 800], [600, 880]]) assert.ok(at(q) < 0.02, `the coat at ${q} is dragged ${at(q).toFixed(2)}`);
});
```

  Update `trail()` to zero `idle` (`for (const e of rig.effects) if ('idle' in e) e.idle = 0; // the springs alone`)
  and record `rests: arms.map(a => a.max * Math.tanh(m.air(t).x * a.wind / a.max))`; the arms
  test checks `Math.abs(s.arms[side] - s.rests[side]) < 3.3` after 11 s. The shader test
  leaves blinks out of the `d += ` count and checks `count('l += ')` equals the blinks.

- [ ] **Step 2: Run** `node tools/test.js` → the two new tests FAIL (no blink, no forearm).

- [ ] **Step 3: `tools/rigmap.py`**: the docstring lists `blink`, `forearm`, `hem`, `tie`;
  measured data:

```python
EYELIDS = [  # each eye, column by column: x, the bottom of its upper lash, the top of its lower lid
    [(360, 155, 155), (362, 156, 158), (364, 154, 162), (366, 153, 167), (368, 152, 168), (370, 151, 169),
     (372, 151, 170), (374, 150, 170), (376, 150, 171), (378, 150, 171), (380, 149, 171), (382, 150, 170),
     (384, 150, 168), (386, 150, 168), (388, 150, 168), (390, 151, 167), (392, 152, 164), (394, 153, 163),
     (396, 150, 154), (398, 150, 150)],
    [(441, 133, 133), (444, 130, 147), (446, 130, 147), (448, 129, 148), (450, 128, 148), (452, 128, 147),
     (454, 127, 147), (456, 127, 147), (458, 127, 148), (460, 130, 149), (462, 133, 147), (464, 136, 146),
     (467, 139, 139)],
]
LASH = 5                             # how thick the upper lash is
TRAVEL = 24                          # how far the lid comes down where its mask is full
ELBOW = (640, 560)                   # her left elbow
FOREARM = [(602, 548), (690, 548), (700, 610), (722, 700), (742, 762), (750, 792), (758, 858),
           (674, 858), (650, 804), (650, 766), (635, 738), (628, 700), (621, 650), (611, 600)]
FOREARM_LEN = 290                    # from the elbow to her fingertips
KNOT = (425, 292)                    # where the tie hangs from
TIE_LEN = 325
```

  masks:

```python
# She blinks: in each column of each eye, the lid above comes down so the upper lash lands
# on the lower lid. Stored as how far (over TRAVEL): nothing above the lid, rising over it
# to the full height the eye is open there, held over the lash's resting place on the lower
# lid, and gone within a px or two below it.
blink = np.zeros((H, W), np.float32)
rows = np.arange(H, dtype=np.float32)
for eye in EYELIDS:
    ex, lash, lid = (np.array(c, np.float32) for c in zip(*eye))
    for x in range(int(ex[0]), int(ex[-1]) + 1):
        b, l = np.interp(x, ex, lash), np.interp(x, ex, lid)
        T = l - b
        if T <= 0:
            continue
        top = b - LASH - max(3.0, 0.8 * T)
        ramp = np.clip((rows - top) / (l - LASH - top), 0, 1)
        blink[:, x] = np.maximum(blink[:, x], T / TRAVEL * np.where(rows <= l, ramp, np.clip(1 - (rows - l) / 1.5, 0, 1)))

# Her left forearm bends at the elbow: its sleeve, cuff and hand, reaching out over the air
# beside it but fading out before the coat it lies against, growing from the elbow.
sleeve = shapes([FOREARM])
forearm = blur(sleeve, 3) * smooth(10, 100, np.hypot(xs - ELBOW[0], ys - ELBOW[1]))

# The coat round her legs sways: free toward the hem, still at the waist, less near her
# body, and fading out beside her left forearm, so neither drags the other.
hem = blur(reach(jacket, 2, 44) * smooth(560, 820, ys) * loose * (1 - reach(sleeve, 0, 28)), 8)

# The tie sways from its knot, a little, easing off just above the belt.
tie = opaque & ((hue < 12) | (hue > 340)) & (sat >= 110) & shapes([TORSO]) & (ys > 280)
tie = ndimage.binary_fill_holes(close(tie, 3))
tie = blur(reach(tie, 1, 6), 2) * smooth(300, 430, ys) * (1 - smooth(586, 612, ys))
```

  `maps = [[hold, sway, ripples], [arms[0], arms[1], flutter], [breath, head, blink], [forearm, hem, tie]]`;
  effects: Left arm `wind 2, max 5.8, idle 2.5`; Coat flutter `amount 0.8`; then

```python
    {'kind': 'blink', 'name': 'Blink', 'mask': [2, 2], 'amount': TRAVEL, 'every': 5, 'span': 0.16, 'twice': 0.15, 'dir': 90},
    {'kind': 'swing', 'name': 'Left forearm', 'mask': [3, 0], 'pivot': list(ELBOW), 'length': FOREARM_LEN,
     'gain': 1.2, 'wind': 1, 'hz': 0.5, 'damp': 0.3, 'max': 3.5, 'idle': 2},
    {'kind': 'sway', 'name': 'Coat hem', 'mask': [3, 1], 'gain': 1.8, 'wind': 3.5, 'hz': 0.42, 'damp': 0.32, 'max': 6},
    {'kind': 'swing', 'name': 'Tie', 'hold': False, 'mask': [3, 2], 'pivot': list(KNOT), 'length': TIE_LEN,
     'gain': 1.2, 'wind': 1.2, 'hz': 0.7, 'damp': 0.25, 'max': 2.5},
```

  The script writes the rig with `open(..., 'w', newline='\n')` (Python 3.9 has no
  `write_text(newline=)`).

- [ ] **Step 4: Into the shipped rig, keeping the touched-up masks:** run rigmap.py into a
  scratch copy; copy its `makise-rig-2.png` and `makise-rig-3.png` in; check `-1.png` and
  `-2.png`'s red and green match what's shipped exactly; edit `makise-rig.js` by hand
  (Left arm and Coat flutter settings, the maps list, the four new lines).

- [ ] **Step 5: Run** `node tools/test.js`: the new tests pass; the hold test passes; the
  fold test fails only where it did on main (check with a scratch copy of the fold check
  that lists every fold: none new).

- [ ] **Step 6: Commit** `git add tools/rigmap.py tools/test.js wallpaper/img/makise-rig* && git commit -m "Makise blinks, her left forearm bends, her coat and tie sway"`

### Task 4: See it live and tune

- [ ] In the browser pane (`/tools/preview.html` and `/tools/rig.html`): screenshots of a
  blink shut (K in the editor), the forearm and coat moving (Gust, Flick); console clean.
  Tune settings in `makise-rig.js` (and `rigmap.py`) if anything pulls or looks rubbery;
  re-run the tests; commit.

### Task 5: Docs

- [ ] README: Bringing her to life (she blinks; her left forearm bends a little; the coat
  round her legs sways; the tie), the editor's effects list (Blink; Idle on Sway and
  Swing; K), How it behaves. `workshop/WORKSHOP.md` description: she blinks. Commit
  `git commit -am "Document the blink, the bending arm and the swaying coat"`.
