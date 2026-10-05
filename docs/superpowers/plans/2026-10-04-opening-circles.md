# Circles from the Opening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Let the schematics run on under Makise and fill the space round her.
- Bring the big clock on the right forward.
- Hang a few circles from the opening (pulleys, hourglasses, fans, resting circles) off
  the lines.

**Architecture:**
- `Schematic.Field` gets two inputs in place of `keepClear(focus)`:
  - `centre(focus, { clear, figure })`: where the wipe starts. With `clear` (the meter) it
    also clears the middle. With a `figure` (Makise) only the shapes keep off her.
  - `quiet(faces)`: discs where the drawing grows thinner and takes no shapes.
- The number of growths follows how much of the frame is open.
- Four new kinds join `KINDS`. A growth now and then adds one of them through
  `circle()`, capped and spaced by `disc`, a bounding circle.
- Fills are drawn after strokes, dimmer.
- `main.js` draws the schematics after the scene's pool of dark when Makise is the
  centrepiece.

**Tech Stack:** Plain JS and Canvas 2D, with no build step. Node `vm` tests in
`tools/test.js`, and headless Chrome stills.

## Global Constraints

- No build step. Scripts load in `wallpaper/index.html` order. `portrait.js` and
  `scene.js` load before `main.js`.
- Design space is 2560×1440. All randomness comes from the seeded `Kit.rng`, so stills
  are repeatable.
- The user previews the working tree live, so every saved step must leave
  `wallpaper/js` runnable. Syntax-check with
  `node -e "new (require('vm').Script)(require('fs').readFileSync('<file>','utf8'))"`
  before moving on.
- The schematics should cost under 1 ms a frame on average at 1440p.
- No gears. No diamonds side by side. Three dials at most. Lines carry at least twice the
  ink of shapes.
- The meter centrepiece looks as before, apart from the circles and the clock.
- `node tools/test.js`: the rig test "at its strongest nothing folds over or tears" failed
  before this work and is being fixed elsewhere. Expect `1 failing` unless that fix has
  landed.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: The big clock, brighter

**Files:**
- Modify: `wallpaper/js/scene.js`

**Interfaces:**
- Produces: `Scene.ASTROLABE = { x: 2000, y: 560, r: 820 }` (design px: centre and dial
  radius).

- [ ] **Step 1:** Above `compose()` add:

```js
  // The astrolabe's face (design px: centre and radius): the schematics leave it room to read.
  const ASTROLABE = { x: 2000, y: 560, r: 820 };
```

  Change the astrolabe to:

```js
      // The astrolabe: a giant dial whose rings step against each other, as bright as the
      // half clock so it reads through the schematics drawn across it.
      new A({ x: ASTROLABE.x, y: ASTROLABE.y, depth: -0.6, blur: 0.4, res: 1, alpha: 0.2, rx: 0.22, ry: -0.2, roll: 0.1, seed: 1, hands: 0.7,
        parts: [{ type: 'dial', r: ASTROLABE.r, ring24: true }] }),
```

  Then add `ASTROLABE` to the returned object: `return { Scene, METER, FOCUS, ASTROLABE };`.

- [ ] **Step 2:** Syntax-check `scene.js`, then commit "Bring the big clock forward".

### Task 2: Lines under Makise, fewer over the clock

**Files:**
- Modify: `wallpaper/js/schematic.js`
- Modify: `wallpaper/js/portrait.js`
- Modify: `wallpaper/js/main.js`
- Test: `tools/test.js`

**Interfaces:**
- Consumes: `Scene.ASTROLABE`.
- Produces:
  - `Portrait.FIGURE`: ellipses `{ x, y, rx, ry }`;
  - `field.centre(focus, { clear = false, figure = [] })`;
  - `field.quiet(faces)`;
  - `field.count`: growths at a time;
  - `field.hidden(x, y)`;
  - `field.inFace(x, y)`: from 0 to 1;
  - `Schematic.COUNT`: now the growths for a whole open frame, 70.

- [ ] **Step 1: Tests first.** In `tools/test.js`:
  - `runField(seed, until, each, centre = 'makise')` sets the field up with
    `field.centre(MAKISE_FOCUS, { figure: MAKISE_FIGURE })` (or
    `field.centre(METER_FOCUS, { clear: true })` for `'meter'`), then
    `field.quiet([ASTROLABE])`.
  - The constants copy the wallpaper's values:
    - `MAKISE_FIGURE = [{ x: 620, y: 680, rx: 230, ry: 440 }, { x: 615, y: 1150, rx: 330, ry: 130 }]`;
    - `METER_FOCUS = { x: 560, y: 695, rx: 760, ry: 440 }`;
    - `ASTROLABE = { x: 2000, y: 560, r: 820 }`.
  - Use `field.count` where the tests use `S.COUNT`.
  - Replace the evenness test with one that:
    - counts every block of the frame except those on the clock's face (centre within
      0.8 r), with the same percentiles as before;
    - checks no shape centres lie behind her figure or within the face's radius;
    - checks the blocks on the face hold less than 0.75 of the average.
  - Add a test for the meter: no shapes within 0.25 of its focus, and fewer growths than
    with Makise.
  - Add a test that the count follows the open frame:
    - nothing cleared or quiet: `COUNT`;
    - Makise with the face: between 52 and 60;
    - the meter with the face: between 46 and 54.
  - Run: `node tools/test.js`. Expect the new and changed schematic tests to fail
    (`centre` is not a function).

- [ ] **Step 2: The field.** In `schematic.js`:
  - Change `COUNT` to 70, as "growths for a whole open frame".
  - Add `QUIET = 0.5`, "how much line a quiet face takes, for what anywhere else does".
  - In the constructor, set `this.focus = null; this.clear = null; this.figure = []; this.faces = []; this.count = COUNT;`
    before `this.target()`.
  - Replace `keepClear` with `centre()` and `quiet()`.
  - `target()` multiplies `T` by `1 - (1 - QUIET) * this.inFace(x, y)`, and sums the
    open `T` against the frame's whole (the noise alone) to set
    `this.count = Math.max(1, Math.round(COUNT * open / all))`.
  - Add `hidden()` and `inFace()`, where
    `inFace(x, y) = max over faces of 1 - smooth(0.8, 1, dist / r)`.
  - `room()` is 0 where `hidden(x, y)` or `inFace(x, y) > 0`.
  - `update()`, `boot()` and the rush use `this.count`.
  - `shift()` wipes from `this.focus || { x: W / 2, y: H / 2 }`.

```js
    centre(focus, { clear = false, figure = [] } = {}) {
      this.focus = { x: focus.x, y: focus.y };
      this.clear = clear ? { x: focus.x, y: focus.y, rx: focus.rx, ry: focus.ry } : null;
      this.figure = figure;
      this.target();
    }

    quiet(faces) {
      this.faces = faces;
      this.target();
    }

    hidden(x, y) { return this.figure.some(f => ((x - f.x) / f.rx) ** 2 + ((y - f.y) / f.ry) ** 2 < 1); }

    inFace(x, y) {
      let k = 0;
      for (const f of this.faces) k = Math.max(k, 1 - smooth(0.8, 1, Math.hypot(x - f.x, y - f.y) / f.r));
      return k;
    }
```

- [ ] **Step 3: Her figure.** In `portrait.js`, after `FOCUS`, add the following and
  export `FIGURE`:

```js
  // Roughly where img/makise.webp covers the frame when she's home (design px: ellipses'
  // centres and radii): her head and coat, and the foot of her coat.
  const FIGURE = [{ x: 620, y: 680, rx: 230, ry: 440 }, { x: 615, y: 1150, rx: 330, ry: 130 }];
```

- [ ] **Step 4: Wire it in.** In `main.js`:
  - After the field is made: `drafting.quiet([Scene.ASTROLABE]);`.
  - In `buildSprites()`:
    `drafting.centre(f, makise ? { figure: Portrait.FIGURE } : { clear: true });`.
  - In `render()`: draw the schematics before `scene.drawBehind` for the meter and after
    it for Makise, with a comment saying why.

- [ ] **Step 5:**
  - Run the tests. The schematic tests should pass, apart from the known rig test.
  - Syntax-check the three files.
  - Take a still at 1440p.
  - Commit "Run the schematics on under Makise, and thinner over the big clock".

### Task 3: Circles from the opening

**Files:**
- Modify: `wallpaper/js/schematic.js`
- Test: `tools/test.js`

**Interfaces:**
- Produces:
  - `KINDS.pulley`, `KINDS.hourglass` (live, with `fill` and `angle(e, t)`), `KINDS.fan`
    and `KINDS.rest`. Each circle carries `disc = { x, y, R }`.
  - `CIRCLES = 10` and `FILL = 0.45`, exported.

- [ ] **Step 1: Tests first.**
  - Extend "every shape lies on its lines": a `rest` circle's contact point `(px, py)` lies
    on its line, and its centre is `R` from it.
  - Add a test for the circles over 20 minutes. At every half second:
    - at most `CIRCLES` of them;
    - discs at least 80 px apart;
    - none behind her figure or on the face, and all inside the frame.
  - Over the run:
    - on average 5 to 10 at a time;
    - all four kinds seen.
  - Add a test that hourglasses turn only in steps: `KINDS.hourglass.angle(e, t)` holds
    still most of the time and moves by multiples of 45°.
  - Run them and expect them to fail.

- [ ] **Step 2: The kinds.**
  - Pull the ring sweeping into `rings(g, e, on, off)`, shared by `ring` and `pulley`.
  - Add `hourglass`: a live ring or two, plus wedges filled at `FILL` of its brightness. It
    turns by `stepped(t, e.every, 0.6, e.dir * Math.PI / 4, e.ph)`.
  - Add `fan`: an arc with the compass arm, ruler ticks (every fifth longer), an optional
    inner arc and a centre ring, each in turn.
  - Add `rest`: a circle swept round from its contact point, then its radius, then a dot.
  - Add `fill` handling in the sheet and the layer: after the strokes, a fill pass at
    `k * FILL`.

- [ ] **Step 3: Placing them.**
  - In `growth()`, after the corner rings: `if (r() < 0.35) this.circle(lines, r, made, lvl);`.
  - `circle()` picks a new line at random.
    - 60% of the time it uses one of the line's solid crossings with a staying line:
      - a pulley (outer radius 36–110 px, inner 0.28–0.42 of it, a middle ring 30% of
        the time, a dot half the time);
      - a fan (radius 110–260 px, at most 0.95 of either half-line, sweep at most 126°,
        about 16 px between ticks, an inner arc 40% of the time, a centre ring 60% of the
        time);
      - an hourglass (radius 16–44 px, a second ring 35% of the time, its axis along
        either line).
    - Otherwise it uses a solid point along the line:
      - a resting circle (radius 28–90 px);
      - or an hourglass strung on it.
  - Accept a circle only if `roomFor(disc, made, r, lvl)` holds:
    - the disc lies in the frame, 20 px in;
    - `r() < room` at its centre;
    - it's clear of her figure (each ellipse grown by R);
    - it's not within `face.r + R / 2` of a face;
    - it's at least 80 px from the other discs;
    - fewer than `CIRCLES` are staying.
  - Brightness: `k * (0.7–1.0) * e.dim`, with `dim` 0.8 for pulleys, fans and resting
    circles.

- [ ] **Step 4:**
  - Run the tests.
  - Syntax-check.
  - Take stills: the whole frame and close-ups.
  - Commit "Hang circles from the opening off the schematics".

### Task 4: Tune by eye, and docs

**Files:**
- Modify: `wallpaper/js/schematic.js` (numbers only), `README.md`,
  `workshop/WORKSHOP.md`, and the spec's "As built" notes.

- [ ] **Step 1: Stills.**
  - Take stills at 1440p, 1080p and 4K, with both centrepieces, the clock before and after,
    and the circles close up.
  - Tune the circles' count, sizes and dimming, and `QUIET`, until:
    - the clock reads first on the right;
    - the space round Makise is filled as evenly as elsewhere;
    - the circles are noticeable but quieter than the lines' crossings.
- [ ] **Step 2: Frame cost.** Measure the frame cost in the browser before and after. The
  target is under 1 ms a frame for the schematics.
- [ ] **Step 3: Docs.**
  - `README.md`:
    - the schematics bullet (circles, under Makise, the clock);
    - performance, if it changed.
  - `workshop/WORKSHOP.md`: the features bullet.
- [ ] **Step 4:** Run the tests, then commit "Document the circles from the opening".
