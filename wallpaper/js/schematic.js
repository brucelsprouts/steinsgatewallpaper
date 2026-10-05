'use strict';
// Schematics: one faint drafting drawing behind the whole scene, like the technical
// drawings in the opening, in light lines on the black. It grows like a crystal (bismuth,
// say): straight lines in formations, each square to itself but set at its own angle to
// the others. A formation starts with a line at an angle of its own where the drawing is
// barest, and grows off its lines: runs at right angles to them (now and then at 60°),
// steps off them and on beside them, and three sides of a frame, like a crystal's
// terraces. Some long lines are broken. Small shapes hang off the lines: circles strung
// along a line; rings, diamonds, crosshairs and now and then a small dial where lines
// cross; ruler ticks and hatching along them; compass arcs from one crossing through
// another; links to the next line over; and a ring or a dot where a line turns or sets
// off. A few bigger circles from the opening's drawings hang off them too: pulley rings and
// compass fans where lines cross, hourglass circles on them, and circles resting on them.
// It slowly redraws itself, as if being drafted: every few seconds the oldest growth
// erases itself, its shapes first, and a new one grows where the drawing wants it, drawn
// as one stroke, its shapes appearing as the pen passes them (trim paths, staggered).
// Glints run along the lines, now and then turning where they cross; the dials tick and the
// hourglasses turn. It runs on behind Makise, but keeps a clear middle round the meter,
// and grows thinner over the big clock so the clock reads first. A worldline shift wipes it
// outward from the centrepiece and grows a new one. What has settled is drawn once into a
// cached sheet and only what moves is drawn each frame, on a layer at about half a px per
// design px, so it's soft. The layer is laid over the black with Screen.
const Schematic = (() => {
  const { TAU, canvas, clamp, smooth, ease, stepped, fbm2 } = Kit;

  const LINE = '226,214,198'; // the lines' light: a pale warm white
  const W = 2560, H = 1440;   // the design frame
  const M = 140;              // the sheet's margin round the frame: the parallax never shows its edge
  const COUNT = 70;           // growths for a whole open frame: a run of lines drawn as one stroke, and its shapes
  const AGE = 100;            // s a growth stays at least, before it may be erased
  const RES = 0.5;            // the layer's px per design px: soft, and the same on any screen
  const P = 42;               // parallax travel in design px per unit of depth
  const DEPTH = -1;           // the drawing's depth: deep, with the backdrop
  const HOLE = 0.7;           // how far out the clear middle fades, in the centrepiece's radii
  const QUIET = 0.5;          // how much line a quiet face takes, for what anywhere else does
  const CELL = 80;            // the density grid's cells (design px)
  const STEP = 16;            // how far apart the density samples lie along a stroke (design px)
  const TAIL = 110;           // a glint's length (design px)
  const APART = 45;           // the closest two lines running the same way may lie (design px)
  const BIG = 0.1;            // the most of the drawing one formation may hold before it stops growing
  const CIRCLES = 10;         // the most circles from the opening at a time
  const FILL = 0.45;          // how bright a filled shape is, for its lines
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

  // Rings round e's centre, swept round one after another as by a compass, and a dot in
  // the middle if it has one.
  function rings(g, e, on, off) {
    const n = e.radii.length;
    e.radii.forEach((R, j) => arcPath(g, e.x, e.y, R, e.a0 + j * 0.9, TAU, stagger(off, j, n), stagger(on, j, n)));
    if (e.dot) dot(g, e.x, e.y, 2.4, on, off);
  }

  // ---------- Broken lines ----------
  // A line's breaks are gaps along it, sorted [from, to] fractions of its length.

  const solid = (e, u) => !e.gaps.some(([a, b]) => u > a && u < b);

  // Each visible stretch of line e from `a` to `b`, leaving out its breaks.
  function pieces(e, a, b, each) {
    let from = a;
    for (const [g0, g1] of e.gaps) {
      if (g1 <= from) continue;
      if (g0 >= b) break;
      if (g0 > from) each(from, g0);
      from = g1;
    }
    if (b > from) each(from, b);
  }

  // One to three breaks, 25 to 110 px wide, apart from one another and from the ends.
  function breaks(len, r) {
    const out = [];
    for (let i = 1 + Math.floor(r() * 3); i > 0; i--) {
      const w = (25 + r() * 85) / len, a = 0.15 + r() * (0.7 - w);
      if (out.every(([p, q]) => a > q + 0.05 || a + w < p - 0.05)) out.push([a, a + w]);
    }
    return out.sort((p, q) => p[0] - q[0]);
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
  // erased `off` of the way; `fill`, if it has any, adds what's filled in, dimmer; `pts`,
  // points along it for the density; `live`, if it moves while it stays, so it's drawn
  // every frame and never into the sheet.
  const RINGS = { path: (g, e, t, on, off) => rings(g, e, on, off), pts: e => e.radii.flatMap(R => around(e.x, e.y, R)) };

  // Where an hourglass points at time t: a step of 45° now and then, eased, like the clocks.
  const turned = (e, t) => e.a + stepped(t, e.every, 0.6, e.dir * Math.PI / 4, e.ph);

  const KINDS = {
    // A line, drawn on from its start and trimmed off outward from `cut`: from its start
    // (0) when it's erased, from nearest the centrepiece when a shift wipes it. Its breaks
    // stay empty.
    line: {
      path(g, e, t, on, off) {
        const c = e.cut, a = c - off * c, b = c + off * (1 - c), put = (u0, u1) => seg(g, e.x0, e.y0, e.x1, e.y1, u0, u1);
        pieces(e, 0, Math.min(on, a), put);
        pieces(e, b, on, put);
      },
      pts: e => alongLine(e.x0, e.y0, e.x1, e.y1).filter((p, i, all) => solid(e, i / (all.length - 1))),
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
    ring: RINGS,

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

    // ---- Circles from the opening's drawings, a few at a time ----

    // Pulley rings where two lines cross: an outer ring and an inner one about a third its
    // size, sometimes one between, swept round one after another, and sometimes a dot in
    // the middle. The lines run through them.
    pulley: RINGS,

    // An hourglass circle, as in the opening and the official art: a small ring, sometimes
    // with another round it, and two opposite wedges filled in, along or across its line.
    // Its rings are swept round, then its wedges open out (and close first as it goes).
    // Like the clocks, it turns a step now and then.
    hourglass: {
      live: true,
      angle: turned,
      path(g, e, t, on, off) {
        const n = e.radii.length;
        e.radii.forEach((R, j) => arcPath(g, e.x, e.y, R, e.a0 + j * 0.9, TAU, stagger(off, j + 1, n + 1), stagger(on, j, n + 1)));
      },
      fill(g, e, t, on, off) {
        const n = e.radii.length, w = e.half * stagger(on, n, n + 1) * (1 - stagger(off, 0, n + 1));
        if (w < 0.01) return;
        const a = turned(e, t);
        for (const s of [a, a + Math.PI]) {
          g.moveTo(e.x, e.y);
          g.arc(e.x, e.y, e.radii[0], s - w, s + w);
          g.closePath();
        }
      },
      pts: e => e.radii.flatMap(R => around(e.x, e.y, R)),
    },

    // A compass fan where two lines cross: an arc between them, swept round with the
    // compass's arm showing, then ruler ticks along it (every fifth longer), then sometimes
    // an inner arc and a small ring at the centre. Its two straight sides are the lines.
    fan: {
      path(g, e, t, on, off) {
        const q = i => [stagger(off, i, 3), stagger(on, i, 3)], [a, b] = q(0), [c, d] = q(1), [p, w] = q(2);
        arcPath(g, e.x, e.y, e.R, e.a0, e.sweep, a, b);
        if (b < 1 && off <= 0) {
          const s = e.a0 + e.sweep * b;
          seg(g, e.x, e.y, e.x + Math.cos(s) * e.R, e.y + Math.sin(s) * e.R, 0, Math.min(1, b * 8));
        }
        for (let i = 0; i <= e.n; i++) {
          const u = i / e.n;
          if (d <= 0 || c >= 1 || u < c || u > d) continue;
          const s = e.a0 + e.sweep * u, cs = Math.cos(s), sn = Math.sin(s), r0 = e.R - (i % 5 ? 7 : 13);
          g.moveTo(e.x + cs * r0, e.y + sn * r0);
          g.lineTo(e.x + cs * e.R, e.y + sn * e.R);
        }
        if (e.inner) arcPath(g, e.x, e.y, e.R * e.inner, e.a0, e.sweep, p, w);
        if (e.hub) arcPath(g, e.x, e.y, e.hub, e.a0, TAU, p, w);
      },
      pts: e => alongArc(e.x, e.y, e.R, e.a0, e.sweep).concat(e.inner ? alongArc(e.x, e.y, e.R * e.inner, e.a0, e.sweep) : []),
    },

    // A circle resting on a line: swept round from where it touches, then its radius drawn
    // out to there, and a dot popping in at its centre.
    rest: {
      path(g, e, t, on, off) {
        const [a, b] = [stagger(off, 0, 2), stagger(on, 0, 2)], [c, d] = [stagger(off, 1, 2), stagger(on, 1, 2)];
        arcPath(g, e.x, e.y, e.R, e.a0, e.dir * TAU, a, b);
        seg(g, e.x, e.y, e.px, e.py, c, d);
        dot(g, e.x, e.y, 2.4, d, c);
      },
      pts: e => around(e.x, e.y, e.R),
    },
  };
  const SHAPES = Object.keys(KINDS).filter(k => k !== 'line');

  // ---------- Geometry ----------

  const inFrame = (x, y, pad = 0) => x >= pad && x <= W - pad && y >= pad && y <= H - pad;

  // How much of the room for shapes is left at x: in the right third, where the clockwork
  // is busiest, half.
  const busy = x => 1 - 0.5 * smooth(1500, 1900, x);

  // Where lines a and b cross: how far along each (0 to 1), and where; null if they don't.
  function cross(a, b) {
    const dx = a.x1 - a.x0, dy = a.y1 - a.y0, ex = b.x1 - b.x0, ey = b.y1 - b.y0, den = dx * ey - dy * ex;
    if (den * den < 1e-12 * (dx * dx + dy * dy) * (ex * ex + ey * ey)) return null;
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

  // ---------- The drawing ----------
  class Field {
    // `random` makes the drawing (seed it for repeatable stills).
    constructor(random = Math.random) {
      this.r = random;
      this.cam = { x: 0, y: 0 };
      this.items = [];      // every line and shape there, until it has erased itself
      this.growths = [];    // in the order they came: { id, born, dies, items }
      this.lines = [];      // the lines staying (not erasing), each with where it crosses the others
      this.glints = [];
      this.ids = 0;
      this.forms = 0;       // formations started so far
      this.next = null;     // when the next growth may come
      this.retire = null;   // when the next one goes
      this.nextGlint = null;
      this.rush = false;    // growing a fresh drawing after a worldline shift
      this.focus = null;    // the middle of the centrepiece, where a shift's wipe starts
      this.clear = null;    // the centrepiece's pool of negative space, if it's kept clear
      this.figure = [];     // ellipses Makise covers: no shapes go there
      this.faces = [];      // faces the drawing leaves room to read
      this.count = COUNT;   // growths at a time, for how much of the frame is open
      this.vary = Math.floor(random() * 1e4);
      this.ink = new Float32Array(COLS * ROWS); // the line in each cell (px, times brightness)
      this.T = new Float32Array(COLS * ROWS);   // what each cell should hold, relative to the rest
      this.target();
      this.sheet = this.layer = this.hole = null;
      this.stale = true;    // the sheet needs drawing afresh
      this.pending = [];    // settled since the sheet was drawn: to add to it
      this.redraws = 0;     // how often the sheet has had to be drawn afresh
      this.retired = 0;     // how many growths have been erased
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

    // The centrepiece. A shift wipes the drawing outward from the middle of `focus`, its pool
    // of negative space (design px: centre and radii). With `clear` (the meter), no shapes
    // go in its core, less line goes near it and the drawing fades out toward its middle.
    // Without (Makise), the drawing runs on behind her, and only shapes keep off `figure`,
    // the ellipses she covers, where she'd hide them.
    centre(focus, { clear = false, figure = [] } = {}) {
      this.focus = { x: focus.x, y: focus.y };
      this.clear = clear ? { x: focus.x, y: focus.y, rx: focus.rx, ry: focus.ry } : null;
      this.figure = figure;
      this.target();
    }

    // Faces the drawing leaves room to read (design px: centres and radii): it grows thinner
    // over them, and no shapes go on them.
    quiet(faces) {
      this.faces = faces;
      this.target();
    }

    // Whether x, y lies behind Makise.
    hidden(x, y) { return this.figure.some(f => ((x - f.x) / f.rx) ** 2 + ((y - f.y) / f.ry) ** 2 < 1); }

    // How far x, y lies within a quiet face: 1 well inside, easing to 0 at its rim.
    inFace(x, y) {
      let k = 0;
      for (const f of this.faces) k = Math.max(k, 1 - smooth(0.8, 1, Math.hypot(x - f.x, y - f.y) / f.r));
      return k;
    }

    // What each cell should hold, relative to the rest: nothing in the centrepiece's core
    // if it's kept clear, rising to all of it a little way out; less over a quiet face; and
    // a little more or less here and there. How many growths there are follows how much of
    // the frame is open, so the drawing is as full wherever it goes.
    target() {
      const c = this.clear;
      let open = 0, all = 0;
      this.open = [];
      for (let j = 0; j < ROWS; j++) {
        for (let i = 0; i < COLS; i++) {
          const x = (i + 0.5) * CELL - M, y = (j + 0.5) * CELL - M, n = j * COLS + i;
          const d = c ? Math.hypot((x - c.x) / c.rx, (y - c.y) / c.ry) : 9, v = 0.75 + 0.5 * fbm2(x / 700, y / 700, this.vary, 3);
          this.T[n] = smooth(0.3, 0.75, d) * (1 - (1 - QUIET) * this.inFace(x, y)) * v;
          if (!inFrame(x, y)) continue;
          all += v;
          if (this.T[n] > 0.05) { this.open.push(n); open += this.T[n]; }
        }
      }
      this.count = Math.max(1, Math.round(COUNT * open / all));
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

    // Whether shapes may go at x, y at all: not in the clear core, behind Makise or on a
    // quiet face.
    allowed(x, y) {
      const c = this.cell(x, y);
      return c >= 0 && this.T[c] >= 0.05 && !this.hidden(x, y) && this.inFace(x, y) === 0;
    }

    // How much room there is for a shape at x, y, from 0 (none) to 1: none where shapes may
    // not go, less where it's full, and half as much in the right third.
    room(x, y, lvl) {
      if (!this.allowed(x, y)) return 0;
      const c = this.cell(x, y), full = lvl > 0 ? this.ink[c] / (this.T[c] * lvl * 1.2) : 0;
      return clamp(1 - full) * busy(x);
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
      // What has erased itself goes, letting go of the lines it grew from or hung off, so
      // nothing long gone is kept.
      if (this.items.some(e => t >= e.dies + e.outT)) {
        this.items = this.items.filter(e => {
          if (t < e.dies + e.outT) return true;
          e.from = null;
          e.deps = e.xs = [];
          return false;
        });
        this.growths = this.growths.filter(c => c.items.some(e => t < e.dies + e.outT));
      }
      // Every few seconds the oldest growth, if it has been there a while, erases itself...
      if (t >= this.retire) {
        const old = this.growths.find(c => c.dies === Infinity && t - c.born > AGE);
        if (old) this.erase(old, t);
        this.retire = t + 4 + r() * 3;
      }
      // ...and something new grows where the drawing wants it.
      if (t >= this.next && this.staying() < this.count) {
        this.add(this.growth(t));
        this.next = t + (this.rush ? 0.06 + r() * 0.06 : 0.5 + r() * 0.8);
        if (this.staying() >= this.count) this.rush = false;
      }
      this.glide(t);
      this.settle(t);
    }

    // How many growths aren't being erased: as soon as one starts to go, the next may come.
    staying() { return this.growths.reduce((n, c) => n + (c.dies === Infinity ? 1 : 0), 0); }

    // At the start: a whole drawing already, grown over the last few minutes, its newest
    // growth still being drawn.
    boot(t) {
      const r = this.r;
      for (let i = 0; i < this.count; i++) this.add(this.growth(t, (this.count - 1 - i) * 5.5 + r() * 3 - 1.5));
      this.next = t + 2;
      this.retire = t + 2 + r() * 3;
      this.nextGlint = t + 1 + r() * 2;
    }

    // A new growth, born `ago` s before t: of 24 tried, the one adding most where the
    // drawing wants it, drawn as one stroke, line after line, and the shapes that grow on
    // it as the pen passes them.
    growth(t, ago = 0) {
      const r = this.r, path = this.grow();
      if (!path) return null;
      const id = ++this.ids, fast = this.rush ? 3.5 : 1, born = t - ago, k = 0.45 + 0.55 * r() ** 1.5, lw = 1.2 + r() * 0.8;
      const form = path.form ?? ++this.forms, lines = [];
      let at = born;
      for (const s of path.segs) {
        const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0), ux = (s.x1 - s.x0) / len, uy = (s.y1 - s.y0) / len;
        const L = this.item({
          kind: 'line', ...s, len, ux, uy, nx: -uy, ny: ux, k, lw, born: at, form, from: lines.length ? lines[lines.length - 1] : path.parent,
          gaps: len > 350 && r() < 0.35 ? breaks(len, r) : [], inT: clamp(len / (350 + r() * 250), 0.5, 4.5) / fast,
        }, id);
        lines.push(L);
        at += L.inT + (0.05 + r() * 0.1) / fast;
      }
      const made = [], lvl = this.level(), most = 1 + Math.floor(r() * 4) + (lines.length > 1 ? 1 : 0);
      for (const L of lines) this.attach(L, r, made, most, lvl);
      // Now and then a small ring, or a dot in one, where it sets off from a line and where
      // it turns.
      for (const L of lines) {
        if (L.from && r() < 0.3 && this.room(L.x0, L.y0, lvl) > 0 && !this.near(L.x0, L.y0, 30, made)) {
          made.push({ kind: 'ring', x: L.x0, y: L.y0, u: 0, deps: [L, L.from], radii: [3 + r() * 6], a0: r() * TAU, dot: r() < 0.5, inT: 0.4 });
        }
      }
      // Now and then a circle from the opening.
      if (r() < 0.4) this.circle(lines, r, made);
      // Shapes are a little fainter and finer than their lines; the circles from the opening
      // are drawn with the same pen as them.
      for (const e of made) {
        const L = e.deps[0];
        e.k = e.disc ? k : k * (0.7 + r() * 0.3);
        e.lw = e.disc ? lw : 1 + r() * 0.5;
        e.born = L.born + L.inT * reach(e.u) + (0.05 + r() * 0.25) / fast;
        e.inT /= fast;
      }
      return { id, born, dies: Infinity, items: [...lines, ...made.map(e => this.item(e, id))] };
    }

    // Line or shape e, of growth `cl`, staying until it's erased. Its brightness and width
    // are rounded, so the sheet can draw alike ones together and they look the same there.
    item(e, cl) {
      return Object.assign(e, {
        id: ++this.ids, cl, k: Math.round(e.k * 8) / 8, lw: Math.round(e.lw * 4) / 4, gaps: e.gaps || [],
        dies: Infinity, outT: 1, cut: 0, leaving: false, inSheet: false, cells: null, deps: e.deps || [], xs: [],
      });
    }

    // The growth to add. What it is comes first, so the drawing keeps its make-up: a new
    // formation (a long line at an angle of its own, a third of them right across the
    // sheet) a little over a fifth of the time, else a run off a line, a step off one or a
    // frame. Then, of 24 tried, the one adding most where the drawing wants it, with none
    // of it alongside a line its way. Half are tried toward the barest places, from the
    // nearest line, half off any line; never off a formation that already holds BIG of
    // the drawing.
    grow() {
      const r = this.r, lvl = this.level(), bare = this.barest(lvl), held = new Map();
      let all = 0;
      for (const l of this.lines) { held.set(l.form, (held.get(l.form) || 0) + l.len); all += l.len; }
      const lines = this.lines.filter(l => held.get(l.form) <= all * BIG), u = r();
      const kind = !lines.length || u < 0.22 ? 'seed' : u < 0.52 ? 'run' : u < 0.78 ? 'step' : 'frame', across = r() < 0.35;
      let best = null, top = -Infinity;
      for (let i = 0; i < 24; i++) {
        const path = kind === 'seed' ? this.seed(bare, across, r)
          : r() < 0.5 ? this.toward(bare[Math.floor(r() * bare.length)][0], lines, kind, r)
          : this.branch(lines[Math.floor(r() * lines.length)], r, { kind });
        if (!path) continue;
        const v = this.score(path, lvl);
        if (v > top) { top = v; best = path; }
      }
      return best;
    }

    // The six barest places: the cells whose block of 3x3 wants the most line.
    barest(lvl) {
      const out = [];
      for (const c of this.open) {
        const i = c % COLS, j = Math.floor(c / COLS);
        let w = 0;
        for (let b = Math.max(0, j - 1); b <= Math.min(ROWS - 1, j + 1); b++) {
          for (let a = Math.max(0, i - 1); a <= Math.min(COLS - 1, i + 1); a++) w += this.T[b * COLS + a] * lvl - this.ink[b * COLS + a];
        }
        out.push([c, w]);
      }
      return out.sort((a, b) => b[1] - a[1]).slice(0, 6);
    }

    // A new formation: a line at an angle of its own through one of the barest places,
    // right across the sheet, or else a long way.
    seed(bare, across, r) {
      let x = r() * W, y = r() * H;
      if (bare.length) {
        const c = bare[Math.floor(r() * bare.length)][0];
        x = (c % COLS + r()) * CELL - M;
        y = (Math.floor(c / COLS) + r()) * CELL - M;
      }
      const s = span(x, y, r() * Math.PI);
      if (!s) return null;
      const dx = s.x1 - s.x0, dy = s.y1 - s.y0, L = Math.hypot(dx, dy), h = Math.min(1, (across ? L : 700 + r() * 1300) / L) / 2;
      const mid = clamp(((x - s.x0) * dx + (y - s.y0) * dy) / (L * L), h, 1 - h), [a, b] = r() < 0.5 ? [mid - h, mid + h] : [mid + h, mid - h];
      return { segs: [{ x0: s.x0 + dx * a, y0: s.y0 + dy * a, x1: s.x0 + dx * b, y1: s.y0 + dy * b }], parent: null };
    }

    // A growth of the given kind into bare cell c (somewhere in it), off the nearest of
    // `lines` (within 600 px) from the point on it nearest c: a run reaching into it and a
    // little past, a frame reaching it, or a step toward it. Null if no line is that near.
    toward(c, lines, kind, r) {
      const x = (c % COLS + r()) * CELL - M, y = (Math.floor(c / COLS) + r()) * CELL - M;
      let P = null, near = 600;
      for (const l of lines) {
        const d = distTo(l, x, y);
        if (d < near) { near = d; P = l; }
      }
      if (!P) return null;
      const u = clamp(((x - P.x0) * P.ux + (y - P.y0) * P.uy) / P.len, 0.05, 0.95);
      const px = P.x0 + P.ux * P.len * u, py = P.y0 + P.uy * P.len * u, d = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
      const side = (x - px) * P.nx + (y - py) * P.ny < 0 ? -1 : 1;
      return this.branch(P, r, { u, side, kind, len: kind === 'run' ? d + 60 + r() * 240 : kind === 'frame' ? d + r() * 100 : undefined });
    }

    // A growth off line P, from a solid part of it, of the given kind: a run square to it
    // (now and then at 60°, setting off a formation of its own) that often stops where it
    // meets another line; a step off it and on beside it, sometimes twice; or three sides
    // of a frame, out, along and back toward it. Where along P (`u`), which side and how
    // far out (`len`) are chosen at random unless given.
    branch(P, r, o) {
      const u = o.u ?? 0.05 + r() * 0.9;
      if (!solid(P, u)) return null;
      const side = o.side ?? (r() < 0.5 ? -1 : 1), along = r() < 0.5 ? -1 : 1, segs = [];
      const out = [P.nx * side, P.ny * side], on = [P.ux * along, P.uy * along];
      const go = (x0, y0, [dx, dy], len) => { const g = { x0, y0, x1: x0 + dx * len, y1: y0 + dy * len }; segs.push(g); return g; };
      let s = { x1: P.x0 + (P.x1 - P.x0) * u, y1: P.y0 + (P.y1 - P.y0) * u }, form = P.form;
      if (o.kind === 'run') {
        const tilt = o.len == null && r() < 0.2 ? (r() < 0.5 ? -1 : 1) * Math.PI / 6 : 0, c = Math.cos(tilt), sn = Math.sin(tilt);
        if (tilt) form = null;
        const d = [out[0] * c - out[1] * sn, out[0] * sn + out[1] * c];
        go(s.x1, s.y1, d, o.len ?? this.runTo(s.x1, s.y1, d, 200 + r() * 900, r));
      } else if (o.kind === 'step') {
        for (let i = r() < 0.3 ? 2 : 1; i > 0; i--) {
          s = go(s.x1, s.y1, out, APART + 5 + r() * 90);
          s = go(s.x1, s.y1, on, 200 + r() * 700);
        }
      } else {
        const reach = o.len ?? 100 + r() * 350;
        s = go(s.x1, s.y1, out, reach);
        s = go(s.x1, s.y1, on, 150 + r() * 450);
        go(s.x1, s.y1, [-out[0], -out[1]], reach * (0.5 + r() * 0.45));
      }
      return { segs, parent: P, form };
    }

    // How far a run from x, y heading d goes: `len`, or half the time to the first line it
    // meets beyond 40% of that, and a little past.
    runTo(x, y, d, len, r) {
      if (r() < 0.5) return len;
      const ray = { x0: x, y0: y, x1: x + d[0] * len * 1.5, y1: y + d[1] * len * 1.5 };
      let hit = Infinity;
      for (const o of this.lines) {
        const c = cross(ray, o), at = c ? c.u * len * 1.5 : 0;
        if (at > len * 0.4 && at < hit) hit = at;
      }
      return hit < Infinity ? hit + 6 + r() * 14 : len;
    }

    // How good a growth: the ink the drawing wants along it, on average, where it's in the
    // frame; far worse if any of it runs alongside a line its way, closer than APART.
    score(path, lvl) {
      let v = 0, n = 0;
      for (const s of path.segs) {
        const dx = s.x1 - s.x0, dy = s.y1 - s.y0, k = Math.max(1, Math.round(Math.sqrt(dx * dx + dy * dy) / STEP));
        for (let i = 0; i <= k; i++) {
          const x = s.x0 + dx * i / k, y = s.y0 + dy * i / k;
          if (inFrame(x, y)) { v += this.want(x, y, lvl); n++; }
        }
      }
      if (!n) return -Infinity;
      v /= n;
      for (const s of path.segs) {
        const dx = s.x1 - s.x0, dy = s.y1 - s.y0, len = Math.hypot(dx, dy);
        for (const o of this.lines) {
          if (Math.abs(dx * o.uy - dy * o.ux) / len >= 0.03) continue;
          if (Math.min(distTo(o, s.x0, s.y0), distTo(o, s.x1, s.y1), distTo(s, o.x0, o.y0), distTo(s, o.x1, o.y1)) < APART) v -= 1e4;
        }
      }
      return v;
    }

    // The shapes on new line L, while there are fewer than `most` in `made`: at some of the
    // crossings it makes (not in a break) and along stretches of it, where there's room.
    attach(L, r, made, most, lvl) {
      const xs = [];
      for (const o of this.lines) {
        const c = cross(L, o);
        if (c && inFrame(c.x, c.y, 30) && solid(L, c.u) && solid(o, c.v)) xs.push({ ...c, o });
      }
      xs.sort((a, b) => a.u - b.u);
      for (const c of xs) {
        if (made.length >= most) break;
        if (r() > 0.5 * this.room(c.x, c.y, lvl) || this.near(c.x, c.y, 40, made)) continue;
        made.push(this.onCrossing(L, c, xs, made, r));
      }
      for (let i = 0; i < 2 && made.length < most; i++) {
        const u = 0.04 + r() * 0.92, x = L.x0 + (L.x1 - L.x0) * u, y = L.y0 + (L.y1 - L.y0) * u;
        if (!inFrame(x, y, 30) || r() > this.room(x, y, lvl) || this.near(x, y, 60, made)) continue;
        const e = this.onStretch(L, u, r);
        if (e && !L.gaps.some(([a, b]) => b > u && a < u + e.ext)) made.push(e);
      }
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
          kind: 'ticks', ...base, n, step, len: 6 + r() * 8, ext: (n - 1) * step / L.len,
          lo: side > 0 ? 0 : side < 0 ? -1 : -0.5, hi: side > 0 ? 1 : side < 0 ? 0 : 0.5, inT: 0.5 + n * 0.04,
        };
      }
      if (v < 0.62) {
        const gap = 7 + r() * 8, n = Math.min(5 + Math.floor(r() * 9), Math.floor(left / gap)), most = 16 + r() * 40;
        if (n < 4) return null;
        // Streaks hang straight down (or up) from a line that isn't upright, and slant
        // from one that is.
        const sgn = r() < 0.5 ? -1 : 1, [dx, dy] = Math.abs(L.uy) < 0.8 ? [0, sgn] : [sgn * Math.SQRT1_2, Math.SQRT1_2];
        return {
          kind: 'hatch', ...base, n, gap, dx, dy, ext: (n - 1) * gap / L.len,
          lens: Array.from({ length: n }, () => most * (0.45 + 0.55 * r())), inT: 0.5 + n * 0.05,
        };
      }
      if (v < 0.82) {
        const gap = 22 + r() * 30, n = Math.min(3 + Math.floor(r() * 6), Math.floor(left / gap) + 1);
        if (n < 2) return null;
        return { kind: 'beads', ...base, n, gap, rad: 4 + r() * 7, ext: (n - 1) * gap / L.len, inT: 0.4 + n * 0.12 };
      }
      const a = Math.atan2(L.uy, L.ux) + [1, -1, 0.5, -0.5, 1.5, -1.5][Math.floor(r() * 6)] * Math.PI / 2;
      const ray = { x0: x, y0: y, x1: x + Math.cos(a) * 420, y1: y + Math.sin(a) * 420 };
      let hit = null;
      for (const o of this.lines) {
        const c = cross(ray, o);
        if (c && c.u * 420 > 60 && (!hit || c.u < hit.u)) hit = { ...c, o };
      }
      if (!hit) return null;
      return { kind: 'link', ...base, x0: x, y0: y, x1: hit.x, y1: hit.y, deps: [L, hit.o], ext: 0, inT: 0.3 + hit.u * 0.6 };
    }

    // Now and then a circle from the opening on new lines `lines`. What it is comes first:
    // where one crosses a line staying, a pulley's rings, a fan or an hourglass; along one
    // (or if none crosses another), a circle resting on it or an hourglass strung on it.
    // Then, of up to six tried, the first with room for it (see roomFor).
    circle(lines, r, made) {
      if (this.circles(made) >= CIRCLES) return;
      const xs = [];
      for (const L of lines) {
        for (const o of this.lines) {
          const c = cross(L, o);
          if (c && inFrame(c.x, c.y, 60) && solid(L, c.u) && solid(o, c.v) && this.allowed(c.x, c.y)) xs.push({ ...c, L, o });
        }
      }
      const v = r(), kind = xs.length && v < 0.62 ? (v < 0.32 ? 'pulley' : v < 0.55 ? 'fan' : 'hourglass') : r() < 0.75 ? 'rest' : 'hourglass';
      const at = xs.length && v < 0.62;
      for (let i = 0; i < 6; i++) {
        let e = null;
        if (at) {
          const c = xs[Math.floor(r() * xs.length)], L = c.L, base = { x: c.x, y: c.y, u: c.u, deps: [L, c.o] };
          e = kind === 'pulley' ? this.pulley(base, r) : kind === 'fan' ? this.fan(L, c, base, r) : this.hourglass(base, r() < 0.5 ? L : c.o, r);
        } else {
          // Somewhere along one that's solid, well in the frame and where shapes may go.
          const L = lines[Math.floor(r() * lines.length)], u = 0.08 + r() * 0.84, x = L.x0 + (L.x1 - L.x0) * u, y = L.y0 + (L.y1 - L.y0) * u;
          if (!solid(L, u) || !inFrame(x, y, 60) || !this.allowed(x, y)) continue;
          const base = { x, y, u, deps: [L] };
          e = kind === 'rest' ? this.rest(L, base, r) : this.hourglass(base, L, r);
        }
        if (e && this.roomFor(e.disc, made, r)) { made.push(e); return; }
      }
    }

    // Each circle from the opening carries `disc`, a circle round all of it, to keep it
    // apart from the others and where it may go.

    pulley(base, r) {
      const R = 36 + r() * 74, radii = [R, ...(r() < 0.3 ? [R * (0.6 + r() * 0.1)] : []), R * (0.28 + r() * 0.14)];
      return { kind: 'pulley', ...base, radii, a0: r() * TAU, dot: r() < 0.5, inT: 0.8 + 0.35 * radii.length, disc: { x: base.x, y: base.y, R } };
    }

    // Its wedges point along line L, or across it.
    hourglass(base, L, r) {
      const R = 16 + r() * 28, radii = r() < 0.35 ? [R, R * (1.35 + r() * 0.2)] : [R];
      return {
        kind: 'hourglass', ...base, radii, a0: r() * TAU, a: Math.atan2(L.uy, L.ux) + (r() < 0.5 ? 0 : Math.PI / 2), half: 0.45 + r() * 0.15,
        every: 5 + r() * 6, dir: r() < 0.5 ? -1 : 1, ph: r(), inT: 1.1, disc: { x: base.x, y: base.y, R: radii[radii.length - 1] },
      };
    }

    // Between L and the line it crosses at c, out along each one way: a fan 80 to 220 px
    // across that both reach past (where they're solid), at 23° to 126°. Of the four ways
    // round the crossing, the first that fits, from one at random.
    fan(L, c, base, r) {
      const o = c.o, want = 80 + r() * 140, k = Math.floor(r() * 4), inner = r() < 0.4 ? 0.5 + r() * 0.12 : 0, hub = r() < 0.6 ? 6 + r() * 5 : 0;
      for (let i = 0; i < 4; i++) {
        const sL = (k + i) % 2 ? 1 : -1, sO = (k + i) % 4 < 2 ? 1 : -1;
        const far = Math.min(sL > 0 ? (1 - c.u) * L.len : c.u * L.len, sO > 0 ? (1 - c.v) * o.len : c.v * o.len) * 0.95;
        const R = Math.min(want, far), a0 = Math.atan2(L.uy * sL, L.ux * sL);
        const sweep = ((Math.atan2(o.uy * sO, o.ux * sO) - a0 + 3 * Math.PI) % TAU) - Math.PI, h = Math.abs(sweep) / 2, mid = a0 + sweep / 2;
        if (R < 80 || h < 0.2 || h > 1.1 || !solid(L, c.u + sL * R / L.len) || !solid(o, c.v + sO * R / o.len)) continue;
        return {
          kind: 'fan', ...base, R, a0, sweep, n: Math.max(4, Math.round(h * 2 * R / 16)), inner, hub, inT: 1.4 + R / 400,
          disc: { x: base.x + Math.cos(mid) * R / 2, y: base.y + Math.sin(mid) * R / 2, R: R * Math.sqrt(Math.max(0.25, 1.25 - Math.cos(h))) },
        };
      }
      return null;
    }

    // Touching L where `base` is, on either side.
    rest(L, base, r) {
      const R = 28 + r() * 62, side = r() < 0.5 ? -1 : 1;
      if (Math.min(base.u, 1 - base.u) * L.len < R * 0.6) return null;
      const x = base.x + L.nx * side * R, y = base.y + L.ny * side * R;
      return {
        ...base, kind: 'rest', x, y, px: base.x, py: base.y, R, a0: Math.atan2(base.y - y, base.x - x), dir: r() < 0.5 ? -1 : 1,
        inT: 1 + R / 120, disc: { x, y, R },
      };
    }

    // How many circles from the opening there are, staying or among those `made`.
    circles(made) { return made.concat(this.items).filter(e => e.disc && !e.leaving).length; }

    // Whether there's room for a circle from the opening round `d`: in the frame, where
    // shapes may go (half the time in the right third), no more than a third of the way in
    // behind Makise, short of a quiet face's numerals (its outer tenth), and at least 80 px
    // from the other circles.
    roomFor(d, made, r) {
      const { x, y, R } = d, pad = 20;
      if (x - R < pad || x + R > W - pad || y - R < pad || y + R > H - pad || !this.allowed(x, y) || r() > busy(x)) return false;
      if (this.figure.some(f => ((x - f.x) / (f.rx + R / 3)) ** 2 + ((y - f.y) / (f.ry + R / 3)) ** 2 < 1)) return false;
      if (this.faces.some(f => Math.hypot(x - f.x, y - f.y) < f.r * 0.9 + R)) return false;
      return !made.concat(this.items).some(e => e.disc && !e.leaving && Math.hypot(e.disc.x - x, e.disc.y - y) < e.disc.R + R + 80);
    }

    add(c) {
      if (!c) return;
      for (const e of c.items) this.tally(e, 1);
      this.items.push(...c.items);
      this.growths.push(c);
      this.link(c.items.filter(e => e.kind === 'line'));
    }

    // Erase growth c from t: its shapes, and the shapes of other growths hanging off its
    // lines, one after another; then its lines, one after another, each trimmed off from
    // its start.
    erase(c, t) {
      const r = this.r, lines = c.items.filter(e => e.kind === 'line');
      const shapes = this.items.filter(e => e.kind !== 'line' && !e.leaving && (e.cl === c.id || e.deps.some(d => lines.includes(d))));
      c.dies = t;
      this.retired++;
      shapes.forEach((e, i) => this.leave(e, t + Math.min(0.9, i * 0.12) + r() * 0.15, 0.5 + r() * 0.5));
      lines.forEach((e, i) => this.leave(e, t + 0.9 + i * 0.25 + r() * 0.2, clamp(e.len / (900 + r() * 500), 0.5, 2.6)));
      this.unlink();
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

    // Lines coming: where each crosses or meets those staying, and each other.
    link(added) {
      for (const a of added) {
        a.xs = [];
        for (const b of this.lines) {
          const c = cross(a, b);
          if (!c) continue;
          a.xs.push({ u: c.u, v: c.v, x: c.x, y: c.y, o: b });
          b.xs.push({ u: c.v, v: c.u, x: c.x, y: c.y, o: a });
        }
        this.lines.push(a);
      }
    }

    // Lines going: once they start to erase they no longer count, nor where they cross.
    unlink() {
      if (!this.lines.some(l => l.leaving)) return;
      this.lines = this.lines.filter(l => !l.leaving);
      for (const l of this.lines) l.xs = l.xs.filter(c => !c.o.leaving);
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

    // Glints: every few seconds one sets off from an end of a long settled line, at its own
    // pace, and where the line crosses or meets another it sometimes turns onto that one.
    glide(t) {
      const r = this.r;
      if (t >= this.nextGlint) {
        this.nextGlint = t + 3 + r() * 5;
        const ok = this.lines.filter(l => l.inSheet && l.len > 300);
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
        const turn = gl.turns > 0 ? passed.find(c => c.o.inSheet && !c.o.leaving && solid(gl.L, c.u) && solid(c.o, c.v) && r() < 0.35) : null;
        if (turn) {
          gl.turns--;
          gl.path.push({ L: turn.o, u: turn.v, x: turn.x, y: turn.y });
          gl.L = turn.o;
          gl.u = gl.from = turn.v;
          gl.dir = turn.v < 0.02 ? 1 : turn.v > 0.98 ? -1 : r() < 0.5 ? 1 : -1;
        } else gl.u = u1;
        if (gl.u < 0 || gl.u > 1) gl.done = true;
      }
      this.glints = this.glints.filter(gl => !gl.done);
    }

    // A worldline shift: the drawing is wiped outward from the centrepiece within about a
    // second, lines from their nearest point to it, and a new one grows quickly.
    shift(t) {
      const r = this.r, c = this.focus || { x: W / 2, y: H / 2 };
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
      for (const gr of this.growths) gr.dies = Math.min(gr.dies, t);
      this.glints = [];
      this.unlink();
      this.rush = true;
      this.next = t + 0.9;
    }

    // `a`: how bright the lines are (Screen's opacity, 0 to 1). `m`: how far the
    // centrepiece is from its home this frame (design px), so the clear middle stays on it.
    draw(ctx, view, t, a, m = { x: 0, y: 0 }) {
      if (!this.layer || a <= 0) return;
      const q = this.q, s = this.sheet.getContext('2d'), g = this.layer.getContext('2d');
      for (const c of [s, g]) { c.strokeStyle = c.fillStyle = `rgb(${LINE})`; c.lineCap = c.lineJoin = 'round'; }
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
          const fills = es.filter(e => KINDS[e.kind].fill);
          if (!fills.length) continue;
          s.globalAlpha = es[0].k * FILL;
          s.beginPath();
          for (const e of fills) KINDS[e.kind].fill(s, e, t, 1, 0);
          s.fill();
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
        if (!KINDS[e.kind].fill) continue;
        g.globalAlpha = e.k * FILL;
        g.beginPath();
        KINDS[e.kind].fill(g, e, t, on, off);
        g.fill();
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
          pieces(L, lo, hi, (p, q) => seg(g, L.x0, L.y0, L.x1, L.y1, p, q));
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

  return { Field, KINDS, SHAPES, COUNT, AGE, CIRCLES, FILL, stagger, phase, reach, cross };
})();
