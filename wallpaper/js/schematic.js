'use strict';
// Schematics: faint drafting figures behind the whole scene, like the technical drawings
// in the opening, in light lines on the dark: dials with ticking rings, dashed orbits,
// compass constructions, nested squares, pendulums, rulers, crosshairs, long construction
// lines and branching worldlines. Each has a life of its own, as figures do in motion
// graphics: it draws itself on, its parts one after another (trim paths, staggered); it
// lives, ticking, turning, sweeping, swinging or sliding in its own way, at its own depth
// and drifting its own way; then it erases itself, and a new one draws itself on in the
// emptiest free spot, so they stay evenly spread and something is always drawing on or
// erasing, one every few seconds. A worldline shift erases them all at once and draws a
// fresh set, like the opening's quick cuts. They're drawn at about half a px per design
// px, so they're soft, and laid over the black with Screen before anything else is drawn.
const Schematic = (() => {
  const { TAU, canvas, rng, clamp, ease, stepped } = Kit;

  const LINE = '226,214,198'; // the lines' light: a pale warm white
  const COUNT = 24;           // figures at a time
  const AGE = 25;             // s a figure stays at least, before it may be erased
  const RULES = 3;            // long construction lines at a time, besides
  const RES = 0.5;            // the layer's px per design px: soft, and the same on any screen
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
      w: 3, R: r => 120 + r() ** 1.6 * 260,
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
      w: 2, R: r => 80 + r() ** 1.4 * 210,
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
      w: 2.5, R: r => 70 + r() ** 1.3 * 180,
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
      w: 1.3, R: r => 70 + r() * 135,
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
      w: 1.5, R: r => 110 + r() * 150,
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
      w: 1.5, R: r => 150 + r() * 270, room: 0.55,
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
      w: 1.3, R: r => 55 + r() * 100,
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
      w: 1.6, R: r => 235 + r() * 235, room: 0.6,
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
      this.retire = null;   // when the next one goes
      this.nextRule = null;
      this.rush = false;    // drawing a fresh set after a worldline shift
      this.last = null;     // the kind drawn last: never drawn twice running
      this.clear = null;    // the middle of the centrepiece, kept clear
      this.layer = null;
    }

    // The layer: about RES px per design px whatever the screen, so the lines look the same
    // on any (between 0.4 and 1 of the screen's own px).
    build(view) {
      this.res = clamp(RES / view.S, 0.4, 1);
      this.layer = canvas(Math.ceil(view.W * this.res), Math.ceil(view.H * this.res));
    }

    // `focus`: the centrepiece's pool of negative space (design px: centre and radii). New
    // figures keep out of the middle half of it.
    keepClear(focus) { this.clear = { x: focus.x, y: focus.y, rx: focus.rx * 0.5, ry: focus.ry * 0.5 }; }

    // How many figures (or lines) aren't being erased yet: as soon as one starts to erase
    // itself, the next may start to draw itself on.
    staying(list, t) { return list.reduce((n, f) => n + (t < f.dies ? 1 : 0), 0); }

    update(t) {
      const r = this.r;
      if (this.next == null) this.boot(t);
      this.figs = this.figs.filter(f => t < f.dies + f.outT);
      this.rules = this.rules.filter(f => t < f.dies + f.outT);
      // Every few seconds the figure that has been there longest (if it has been there a
      // while) erases itself, so they come and go at a steady pace, never in a crowd...
      if (t >= this.retire) {
        let oldest = null;
        for (const f of this.figs) if (f.dies > t && t - f.born > AGE && (!oldest || f.born < oldest.born)) oldest = f;
        if (oldest) oldest.dies = t;
        this.retire = t + 2 + r() * 2.5;
      }
      // ...and another draws itself on.
      if (t >= this.next && this.staying(this.figs, t) < COUNT) {
        this.figs.push(this.figure(t));
        this.next = t + (this.rush ? 0.06 + r() * 0.08 : 0.3 + r() * 0.5);
        if (this.staying(this.figs, t) >= COUNT) this.rush = false;
      }
      if (t >= this.nextRule && this.staying(this.rules, t) < RULES) {
        this.rules.push(this.rule(t));
        this.nextRule = t + (this.rush ? 0.4 : 5 + r() * 10);
      }
    }

    // At the start: a full set already, drawn on over the last minute or so, a few still
    // drawing themselves on.
    boot(t) {
      for (let i = 0; i < COUNT; i++) this.figs.push(this.figure(t, this.r() * 60));
      for (let i = 0; i < RULES; i++) this.rules.push(this.rule(t, this.r()));
      this.next = t;
      this.retire = t + 2;
      this.nextRule = t + 6;
    }

    // A new figure, drawn on `age` s ago. It stays until the field has it erase itself.
    figure(t, age = 0) {
      const r = this.r;
      let kind = pick(r);
      while (kind === this.last) kind = pick(r);
      this.last = kind;
      const k = KINDS[kind], R = k.R(r), room = R * (k.room || 1), seed = Math.floor(r() * 2 ** 31);
      const at = this.spot(room, t), depth = -1.3 + r() * 0.8;
      return {
        kind, R, room, x: at.x, y: at.y, depth, seed,
        w: 0.55 + 0.45 * (depth + 1.3) / 0.8, // the deeper, the fainter
        drift: { ax: 10 + r() * 30, ay: 8 + r() * 24, px: 50 + r() * 70, py: 60 + r() * 80, ph: r() * TAU },
        spin: (r() - 0.5) * 0.004, // how fast it turns as a whole (rad/s)
        p: k.make(rng(seed)),
        born: t - age, inT: this.rush ? 0.9 + r() * 0.7 : 2.5 + r() * 2.5, outT: 2 + r() * 2, dies: Infinity,
      };
    }

    // Where a figure taking up `room` goes at time t: of 120 places tried, the one with
    // the most room to spare, from the figures staying (allowing for theirs) and from the
    // middle of the centrepiece. Figures already erasing themselves don't count, so a new
    // one often draws itself on where an old one is going. It may hang off the edge of the
    // frame, but not lie beyond.
    spot(room, t) {
      const r = this.r, c = this.clear;
      let best = null, most = -Infinity;
      for (let i = 0; i < 120; i++) {
        const x = -130 + r() * 2820, y = -90 + r() * 1620;
        let spare = Infinity;
        for (const f of this.figs) if (t < f.dies) spare = Math.min(spare, Math.hypot(x - f.x, y - f.y) - room - f.room);
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
        // Those not erasing yet start within the next 0.4 s; those erasing already hurry on
        // from where they've got to.
        const outT = 0.5 + r() * 0.4;
        f.dies = f.dies > t ? t + r() * 0.4 : t - clamp((t - f.dies) / f.outT) * outT;
        f.outT = outT;
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
      const g = this.layer.getContext('2d'), k = this.res, s = view.S * k;
      const X = x => (view.ox + x * view.S) * k, Y = y => (view.oy + y * view.S) * k;
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
