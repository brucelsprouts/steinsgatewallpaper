'use strict';
// Living ink: coloured watercolour that forms on its own. A bead of pigment lands,
// spreads with a wet front, dries, rests for a few minutes and then dissolves while
// new blooms form elsewhere. Each bloom is painted once into a sprite, a few steps
// per frame; forming and fading only mask that sprite with a small field of arrival
// times, so a frame costs a couple of image draws.
const Ink = (() => {
  const { TAU, canvas, rng, hash, fbm2, smooth } = Kit;
  const { deform, polyPath, circlePts, gauss } = Paint;

  // Where blooms may form (design px): clear of the meter and inside the vignette.
  // Two sit in front of the clockwork; the rest are far behind it.
  const ZONES = [
    { x: 2000, y: 330, R: [380, 500], depth: -0.95 },  // upper right, behind the astrolabe
    { x: 2150, y: 1150, R: [320, 420], depth: -0.9 },  // lower right
    { x: 700, y: 180, R: [300, 400], depth: -0.95 },   // above the meter
    { x: 1300, y: 1250, R: [280, 360], depth: -0.85 }, // bottom centre
    { x: 620, y: 1250, R: [240, 320], depth: -0.8 },   // below the meter
    { x: 1500, y: 170, R: [220, 300], depth: 0.45 },   // top centre, over the clockwork
    { x: 2300, y: 720, R: [260, 340], depth: 0.5 },    // right, over the clockwork
  ];
  // Light, pastel inks: on near-black they read as luminous paint rather than mud.
  const INKS = {
    teal: '110,196,200', crimson: '222,92,112', violet: '168,128,214',
    rose: '236,158,176', amber: '232,176,104', blue: '112,146,228',
  };
  const HUES = Object.keys(INKS);
  // Neighbouring colours that bleed into each other while wet.
  const BLEED = {
    teal: ['blue', 'violet'], crimson: ['rose', 'violet'], violet: ['blue', 'crimson'],
    rose: ['amber', 'crimson'], amber: ['rose', 'crimson'], blue: ['teal', 'violet'],
  };

  const MAX = 4;         // blooms alive at once (a worldline shift may add one)
  const GAP = [35, 95];  // seconds between new blooms
  const PREP = 0.4;      // seconds to paint a bloom before it starts to form
  const DRY = 6;         // seconds for the wet sheen to go
  const RES = 0.5;       // sprite resolution relative to the screen
  const STEPS = 2;       // painting steps per frame
  const FRONT = 0.05;    // softness of the spreading edge, in field time
  const TINT = 0.3;      // how strongly a bloom stains the linework under it

  // ---------- Textures shared by every bloom ----------

  // Large soft blotches, knocked out of the paint between layers.
  const blotches = [];
  function blotch(i) {
    if (blotches[i]) return blotches[i];
    const n = 128, c = canvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n);
    const sc = 2.5 + (i % 3) * 1.2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) img.data[(y * n + x) * 4 + 3] = smooth(0.3, 0.72, fbm2(x / n * sc, y / n * sc, 900 + i, 4)) * 255;
    }
    g.putImageData(img, 0, 0);
    return (blotches[i] = c);
  }

  // Remove pigment through a randomly turned blotch texture that covers the whole box.
  function knock(g, box, r, strength) {
    const t = blotch(Math.floor(r() * 6));
    const size = Math.hypot(box.x1 - box.x0, box.y1 - box.y0) * (1.05 + r() * 0.5);
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = strength;
    g.translate((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2);
    g.rotate(r() * TAU);
    g.drawImage(t, -size / 2, -size / 2, size, size);
    g.restore();
  }

  // Value noise that wraps every P lattice cells, so the paper tile repeats seamlessly.
  function pnoise(x, y, P, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const h = (a, b) => hash(((a % P) + P) % P * 374761393 + ((b % P) + P) % P * 668265263, seed);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  // Paper tooth: speckle clustered by the grain of the paper.
  let toothTile = null;
  function tooth() {
    if (toothTile) return toothTile;
    const n = 256, c = canvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n), r = rng(404);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = 0.5 * pnoise(x / 8, y / 8, 32, 7) + 0.5 * r();
        img.data[(y * n + x) * 4 + 3] = smooth(0.5, 0.95, v) * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return (toothTile = c);
  }

  // ---------- Painting ----------

  // A swept wash, as if laid with one loaded brush: blunt and full where the brush
  // landed, bending as it travels and thinning as the brush runs dry. One side bled
  // into wet paper, the other dried crisp. Also the drops that start it (where the
  // brush landed, then further along), how much faster ink runs along it than across
  // it, and its box.
  const SAMPLES = 20;
  function layout(b) {
    const r = rng(b.seed), ca = Math.cos(b.angle), sa = Math.sin(b.angle);
    const rot = (u, v) => [u * ca - v * sa, u * sa + v * ca];
    const len = b.R * (1.6 + r() * 0.8), bend = (r() - 0.5) * b.R * 0.9, wide = b.R * (0.22 + r() * 0.1);
    const n1 = r() * 100, n2 = r() * 100, wet = r() < 0.5 ? 1 : -1;
    const spine = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const s = i / SAMPLES, u = (s - 0.5) * len, v = bend * (1 - 4 * (s - 0.5) ** 2);
      const tv = -8 * bend * (s - 0.5), tl = Math.hypot(len, tv);
      const env = (0.45 + 0.55 * smooth(0, 0.2, s)) * Math.pow(1 - s, 0.45) * (0.85 + 0.35 * Math.exp(-((s - 0.25) ** 2) / 0.04));
      const hL = wide * env * (0.7 + 0.6 * Kit.noise(s * 6 + n1, 3)), hR = wide * env * (0.7 + 0.6 * Kit.noise(s * 6 + n2, 4));
      spine.push({ s, u, v, nu: -tv / tl, nv: len / tl, h: (hL + hR) / 2, hL, hR });
    }
    const vary = side => (side === wet ? 1 + r() * 0.8 : 0.3 + r() * 0.5);
    const outline = [];
    for (const p of spine) outline.push([...rot(p.u + p.nu * p.hL, p.v + p.nv * p.hL), vary(1)]);
    for (let i = SAMPLES; i >= 0; i--) {
      const p = spine[i];
      outline.push([...rot(p.u - p.nu * p.hR, p.v - p.nv * p.hR), vary(-1)]);
    }
    // A rounded cap where the brush landed, bulging back behind the start.
    const p0 = spine[0], h0 = (p0.hL + p0.hR) / 2;
    for (let i = 1; i < 6; i++) {
      const a = i / 6 * Math.PI, across = -Math.cos(a) * h0, back = Math.sin(a) * h0 * 0.9;
      outline.push([...rot(p0.u + p0.nu * across - p0.nv * back, p0.v + p0.nv * across + p0.nu * back), 0.8 + r() * 0.6]);
    }
    const at = s => spine[Math.round(s * SAMPLES)];
    const [fx, fy] = rot(at(0.2).u, at(0.2).v);
    const lobes = [{ pts: deform(outline, 2, 0.1, r), cx: fx, cy: fy, w: 1 }];
    for (let L = 0; L < b.bulges; L++) {
      const p = at(0.15 + r() * 0.5), side = r() < 0.5 ? -1 : 1, o = p.h * (0.45 + r() * 0.3) * side;
      const [cx, cy] = rot(p.u + p.nu * o, p.v + p.nv * o);
      const pts = circlePts(10, p.h * (0.5 + r() * 0.35), r, [0.5, 1.5]).map(([x, y, v]) => [x + cx, y + cy, v]);
      lobes.push({ pts: deform(pts, 3, 0.18, r), cx, cy, w: 0.6 + r() * 0.4 });
    }
    // The first drop lands where the brush did; any others further along the stroke.
    const drops = [];
    for (let d = 0; d < b.drops; d++) {
      const p = at(Math.min(0.85, 0.12 + d * (0.3 + r() * 0.1)));
      const [x, y] = rot(p.u, p.v);
      drops.push({ x: x + gauss(r) * b.R * 0.03, y: y + gauss(r) * b.R * 0.03, delay: d ? 0.25 + r() * 0.45 : 0 });
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of lobes) {
      for (const [x, y] of l.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    const m = b.R * 0.14, flow = Math.min(3, Math.max(1.4, len / (2.2 * wide)));
    return { r, rot, spine, lobes, drops, flow, box: { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m } };
  }

  // A random point inside the wash between s0 and s1 along it, up to between f0 and
  // f1 of the way out to its edge.
  function inside(geo, f0, f1, s0 = 0.05, s1 = 0.9) {
    const r = geo.r, p = geo.spine[Math.round((s0 + r() * (s1 - s0)) * SAMPLES)];
    const f = (f0 + r() * (f1 - f0)) * (r() < 0.5 ? -1 : 1);
    return geo.rot(p.u + p.nu * p.h * f, p.v + p.nv * p.h * f);
  }

  const blob = (cx, cy, rad, r) => deform(circlePts(8, rad, r, [0.6, 1.8]), 3, 0.3, r).map(([x, y, v]) => [x + cx, y + cy, v]);

  // A canvas the size of the sprite, in the same design-unit frame.
  function layer(geo, k) {
    const { x0, y0, x1, y1 } = geo.box, c = canvas((x1 - x0) * k, (y1 - y0) * k), g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    return [c, g];
  }

  // A line that follows the stroke at fraction f of its half-width, from s0 to s1,
  // with alpha(s) and width(spine point) per segment.
  function streak(g, geo, f, s0, s1, alpha, width) {
    const sp = geo.spine;
    for (let i = Math.ceil(s0 * SAMPLES); i < Math.min(SAMPLES, s1 * SAMPLES); i++) {
      const p = sp[i], q = sp[i + 1];
      g.globalAlpha = alpha(p.s);
      g.lineWidth = width(p);
      const [x0, y0] = geo.rot(p.u + p.nu * p.h * f, p.v + p.nv * p.h * f);
      const [x1, y1] = geo.rot(q.u + q.nu * q.h * f, q.v + q.nv * q.h * f);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }

  // Bristle marks: faint lines of denser pigment dragged along the stroke.
  function bristles(g, b, geo) {
    const r = geo.r;
    g.save();
    g.strokeStyle = `rgb(${INKS[b.color]})`;
    for (let n = 0, count = 4 + Math.floor(r() * 5); n < count; n++) {
      const f = (r() * 2 - 1) * 0.8, s0 = 0.08 + r() * 0.3, s1 = s0 + 0.3 + r() * 0.5, a = 0.04 + r() * 0.06, w = 0.03 + r() * 0.05;
      streak(g, geo, f, s0, s1, s => a * smooth(s0, s0 + 0.1, s) * (1 - smooth(s1 - 0.15, s1, s)), p => Math.max(0.6, p.h * w));
    }
    g.restore();
  }

  // Dry brush: toward the tail the brush runs out and skips across the paper.
  function dryBrush(g, geo) {
    const r = geo.r;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.strokeStyle = '#000';
    for (let n = 0, count = 5 + Math.floor(r() * 5); n < count; n++) {
      const f = (r() * 2 - 1) * 0.85, w = 0.08 + r() * 0.16, s0 = 0.45 + r() * 0.3;
      streak(g, geo, f, s0, 1, s => 0.9 * smooth(s0, 1, s), p => Math.max(0.6, p.h * w));
    }
    g.restore();
  }

  // Wet-in-wet: a neighbouring colour creeps into part of the stain.
  function bleed(g, b, geo, k) {
    const r = geo.r, [c, cg] = layer(geo, k), [cx, cy] = inside(geo, 0, 0.8), rad = b.R * (0.35 + r() * 0.3);
    const col = INKS[b.color2], rg = cg.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rg.addColorStop(0, `rgba(${col},0.9)`);
    rg.addColorStop(0.55, `rgba(${col},0.4)`);
    rg.addColorStop(1, `rgba(${col},0)`);
    cg.fillStyle = rg;
    cg.fillRect(geo.box.x0, geo.box.y0, geo.box.x1 - geo.box.x0, geo.box.y1 - geo.box.y0);
    knock(cg, geo.box, r, 0.8);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.5 + r() * 0.3;
    g.drawImage(c, 0, 0);
    g.restore();
  }

  // Drying: pigment migrates to the rims. Lifting paint in proportion to a blurred copy
  // of itself thins the evenly dense interior and leaves every edge denser.
  function dry(g, b, k, strength) {
    const c = g.canvas, soft = canvas(c.width, c.height), sg = soft.getContext('2d');
    sg.filter = `blur(${Math.max(1, b.R * 0.045 * k)}px)`;
    sg.drawImage(c, 0, 0);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = strength;
    g.drawImage(soft, 0, 0);
    g.restore();
  }

  // Paper tooth: pigment settles unevenly into the grain of the paper.
  function granulate(g, r) {
    const c = g.canvas;
    g.save();
    g.setTransform(1, 0, 0, 1, -r() * 256, -r() * 256);
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = 0.5;
    g.fillStyle = g.createPattern(tooth(), 'repeat');
    g.fillRect(0, 0, c.width + 256, c.height + 256);
    g.restore();
  }

  // Thinning along the stroke: the brush carries less paint the further it travels.
  function thin(g, geo, strength) {
    const a = geo.spine[0], z = geo.spine[SAMPLES], [x0, y0] = geo.rot(a.u, a.v), [x1, y1] = geo.rot(z.u, z.v);
    const lg = g.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, 'rgba(0,0,0,0)');
    lg.addColorStop(0.35, `rgba(0,0,0,${strength * 0.3})`);
    lg.addColorStop(1, `rgba(0,0,0,${strength})`);
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = lg;
    g.fillRect(geo.box.x0, geo.box.y0, geo.box.x1 - geo.box.x0, geo.box.y1 - geo.box.y0);
    g.restore();
  }

  function* paint(g, b, geo, k) {
    const { r, lobes, box } = geo, col = INKS[b.color];
    // Wet halo: the first wash spreads wider and soft, into damp paper.
    const [hc, hg] = layer(geo, k);
    for (let L = 0; L < 10 * lobes.length; L++) {
      const l = lobes[L % lobes.length];
      hg.fillStyle = `rgba(${col},${(0.045 * l.w).toFixed(4)})`;
      hg.fill(polyPath(deform(l.pts, 2, 0.26, r)));
    }
    knock(hg, box, r, 0.35);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.filter = `blur(${Math.max(1, b.R * 0.025 * k)}px)`;
    g.drawImage(hc, 0, 0);
    g.restore();
    yield;
    // Body: dozens of translucent deformations of the stroke. Texture knocked out
    // between layers leaves the pigment pooled in places and thin in others.
    for (let L = 0, n = 20 * lobes.length; L < n; L++) {
      const l = lobes[L % lobes.length];
      g.fillStyle = `rgba(${col},${(0.05 * l.w).toFixed(4)})`;
      g.fill(polyPath(deform(l.pts, 2, 0.14, r)));
      if (L % 10 === 9) { knock(g, box, r, 0.3); yield; }
    }
    thin(g, geo, 0.55);
    // Pools: pigment that settled, mostly near where the brush landed.
    for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) {
      const [cx, cy] = inside(geo, 0, 0.6, 0.05, 0.7), base = blob(cx, cy, b.R * (0.04 + r() * 0.09), r);
      g.fillStyle = `rgba(${col},${(0.03 + r() * 0.05).toFixed(3)})`;
      for (let L = 0; L < 7; L++) g.fill(polyPath(deform(base, 2, 0.25, r)));
    }
    knock(g, box, r, 0.25);
    yield;
    bristles(g, b, geo);
    bleed(g, b, geo, k);
    dry(g, b, k, 0.8);
    dryBrush(g, geo);
    yield;
    granulate(g, r);
    // Double the stain's opacity: the passes set how strong it is when drawn.
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(g.canvas, 0, 0);
    g.restore();
  }

  // ---------- Arrival field: when the spreading ink reaches each cell ----------

  // Minimal binary heap of (time, cell) for the arrival field.
  class Heap {
    constructor() { this.t = []; this.k = []; }
    get size() { return this.t.length; }
    push(t, k) {
      const T = this.t, K = this.k;
      let i = T.length;
      T.push(t); K.push(k);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (T[p] <= t) break;
        T[i] = T[p]; K[i] = K[p]; i = p;
      }
      T[i] = t; K[i] = k;
    }
    pop() {
      const T = this.t, K = this.k, top = [T[0], K[0]], t = T.pop(), k = K.pop();
      if (T.length) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= T.length) break;
          if (c + 1 < T.length && T[c + 1] < T[c]) c++;
          if (T[c] >= t) break;
          T[i] = T[c]; K[i] = K[c]; i = c;
        }
        T[i] = t; K[i] = k;
      }
      return top;
    }
  }

  // Ink runs fast along channels in the paper and along the stain's long axis, so the
  // front fingers outward and fills in behind. Times are normalised: 0 where a drop
  // lands, 1 at the last painted cell. D orders the dissolve: thin pigment lifts first.
  function makeField(b, geo, sprite) {
    const { x0, y0, x1, y1 } = geo.box, w = x1 - x0, h = y1 - y0;
    const cs = Math.max(8, w / 120, h / 120), gw = Math.ceil(w / cs), gh = Math.ceil(h / cs), N = gw * gh;
    const dc = canvas(gw, gh), dg = dc.getContext('2d');
    dg.imageSmoothingQuality = 'high';
    dg.drawImage(sprite, 0, 0, w / cs, h / cs);
    const px = dg.getImageData(0, 0, gw, gh).data, dens = new Float32Array(N);
    let dmax = 1e-6;
    for (let k = 0; k < N; k++) { dens[k] = px[k * 4 + 3] / 255; dmax = Math.max(dmax, dens[k]); }
    const ns = b.seed % 100000, speed = new Float32Array(N), D = new Float32Array(N);
    for (let j = 0, k = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++, k++) {
        const x = x0 + (i + 0.5) * cs, y = y0 + (j + 0.5) * cs;
        const n = smooth(0.3, 0.72, fbm2(x / (b.R * 0.28), y / (b.R * 0.28), ns, 3));
        speed[k] = dens[k] > 0.02 ? 0.25 + 1.6 * n * n : 0.12;
        D[k] = 0.55 * dens[k] / dmax + 0.45 * smooth(0.3, 0.72, fbm2(x / (b.R * 0.2), y / (b.R * 0.2), ns + 7, 3));
      }
    }
    const T = new Float64Array(N).fill(Infinity), heap = new Heap();
    for (const d of geo.drops) {
      const i = Math.min(gw - 1, Math.max(0, Math.floor((d.x - x0) / cs)));
      const j = Math.min(gh - 1, Math.max(0, Math.floor((d.y - y0) / cs)));
      const t0 = d.delay * b.R;
      if (t0 < T[j * gw + i]) { T[j * gw + i] = t0; heap.push(t0, j * gw + i); }
    }
    const ca = Math.cos(b.angle), sa = Math.sin(b.angle), steps = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const u = (di * ca + dj * sa) * cs, v = (-di * sa + dj * ca) * cs;
      steps.push([di, dj, Math.hypot(u / geo.flow, v)]);
    }
    while (heap.size) {
      const [tk, k] = heap.pop();
      if (tk > T[k]) continue;
      const i = k % gw, j = (k - i) / gw;
      for (const [di, dj, len] of steps) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue;
        const kk = jj * gw + ii, nt = tk + len * 2 / (speed[k] + speed[kk]);
        if (nt < T[kk]) { T[kk] = nt; heap.push(nt, kk); }
      }
    }
    let tmax = 1e-6;
    for (let k = 0; k < N; k++) if (dens[k] > 0.02) tmax = Math.max(tmax, T[k]);
    const Tn = new Float32Array(N);
    for (let k = 0; k < N; k++) Tn[k] = Math.min(1.5, T[k] / tmax);
    const mask = canvas(gw, gh), boost = canvas(gw, gh);
    return {
      gw, gh, cs, T: Tn, D, mask, boost,
      mImg: mask.getContext('2d').createImageData(gw, gh), bImg: boost.getContext('2d').createImageData(gw, gh),
    };
  }

  // Forming: `mask` reveals the paint behind the front; `boost` adds the wet, dense
  // pigment at the front and in the fresh drop, both fading as the ink slows.
  function formMasks(f, p) {
    const tau = (1 + FRONT) * (1 - Math.pow(1 - p, 1.5));
    const band = 0.9 * Math.pow(1 - p, 0.8), core = 1.2 * (1 - smooth(0, 0.7, p)), coreR = 0.04 + 0.4 * tau;
    const m = f.mImg.data, o = f.bImg.data, T = f.T;
    for (let k = 0, i = 3; k < T.length; k++, i += 4) {
      const d = tau - T[k], rev = smooth(-FRONT, FRONT, d);
      m[i] = rev * 255;
      o[i] = Math.min(1, rev * (band * Math.exp(-d * d / 0.004) + core * Math.exp(-T[k] / coreR))) * 255;
    }
    f.mask.getContext('2d').putImageData(f.mImg, 0, 0);
    f.boost.getContext('2d').putImageData(f.bImg, 0, 0);
  }

  // Fading: a rising level dissolves the stain in blotches, thinnest pigment first.
  function fadeMask(f, p) {
    const W = 0.12, lvl = -W + (1 + 2 * W) * p, m = f.mImg.data, D = f.D;
    for (let k = 0, i = 3; k < D.length; k++, i += 4) m[i] = smooth(lvl - W, lvl + W, D[k]) * 255;
    f.mask.getContext('2d').putImageData(f.mImg, 0, 0);
  }

  // The sprite seen through a field mask, into a canvas kept while the bloom animates.
  function through(b, mask, out) {
    const { c, k } = b.sp, f = b.field;
    if (!out) out = canvas(c.width, c.height);
    const g = out.getContext('2d');
    g.globalCompositeOperation = 'copy';
    g.drawImage(c, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(mask, 0, 0, f.gw * f.cs * k, f.gh * f.cs * k);
    return out;
  }

  // Paints the sprite (and the field, once) a step at a time.
  function* paintJob(b, S) {
    const geo = layout(b), k = S * RES, [c, g] = layer(geo, k);
    yield* paint(g, b, geo, k);
    if (!b.field) { b.field = makeField(b, geo, c); yield; }
    const { x0, y0, x1, y1 } = geo.box;
    b.sp = { c, k, x0, y0, w: x1 - x0, h: y1 - y0 };
  }

  // ---------- Blooms and their schedule ----------

  const PHASES = [['forming', 'form'], ['drying', 'dry'], ['resting', 'rest'], ['fading', 'fade']];

  class Bloom {
    constructor(o) { Object.assign(this, o); }

    get end() { return this.born + this.form + this.dry + this.rest + this.fade; }

    // [name, progress]: prep, forming, drying, resting, fading, gone.
    phase(t) {
      let u = t - this.born;
      if (u < 0) return ['prep', 0];
      for (const [name, span] of PHASES) {
        if (u < this[span]) return [name, u / this[span]];
        u -= this[span];
      }
      return ['gone', 1];
    }

    // Cut the rest short so the dissolve starts at t.
    fadeFrom(t) { this.rest = Math.max(0, t - this.born - this.form - this.dry); }
  }

  class Field {
    // `random` drives every choice (seed it for repeatable stills); `target` is the
    // scene's parallax target, so a new bloom starts where the camera already is.
    constructor(random, target, o = {}) {
      this.random = random;
      this.target = target;
      this.restRange = o.rest || [140, 380];
      this.blooms = [];
      this.next = null;
      this.S = 0;
    }

    // A new bloom in a free zone, in a colour no living bloom is using.
    spawn(t) {
      const r = this.random;
      const zones = ZONES.map((_, i) => i).filter(i => !this.blooms.some(b => b.zone === i));
      if (!zones.length) return null;
      const zone = zones[Math.floor(r() * zones.length)], z = ZONES[zone];
      const hues = HUES.filter(h => !this.blooms.some(b => b.color === h));
      const color = hues[Math.floor(r() * hues.length)], friends = BLEED[color];
      const [rest0, rest1] = this.restRange;
      const b = new Bloom({
        zone, depth: z.depth, color, color2: friends[Math.floor(r() * friends.length)],
        x: z.x + (r() - 0.5) * 160, y: z.y + (r() - 0.5) * 120,
        R: z.R[0] + r() * (z.R[1] - z.R[0]), angle: (r() < 0.5 ? -1 : 1) * (0.2 + r() * 0.8),
        bulges: Math.floor(r() * 3), drops: 1 + Math.floor(r() * 3), alpha: 0.25 + r() * 0.08,
        seed: Math.floor(r() * 1e9),
        born: t + PREP, form: 9 + r() * 4, dry: DRY, rest: rest0 + r() * (rest1 - rest0), fade: 22 + r() * 12,
        cam: { x: this.target.x, y: this.target.y },
      });
      this.blooms.push(b);
      return b;
    }

    // Start with three dry blooms part-way through their rest; a fourth forms soon.
    boot(t) {
      const r = this.random;
      for (let i = 0; i < 3; i++) {
        const b = this.spawn(t);
        b.born = t - b.form - b.dry - b.rest * (0.1 + r() * 0.6);
        if (this.S) this.finish(b);
      }
      this.next = t + 3 + r() * 3;
    }

    // A worldline shift: the oldest resting bloom dissolves and a fresh one forms.
    shift(t) {
      if (this.next == null) return;
      const resting = this.blooms.filter(b => b.phase(t)[0] === 'resting').sort((a, b) => a.born - b.born);
      if (resting.length && this.blooms.length >= MAX) resting[0].fadeFrom(t);
      this.spawn(t);
      this.next = Math.max(this.next, t + GAP[0]);
    }

    update(t) {
      if (this.next == null) this.boot(t);
      this.blooms = this.blooms.filter(b => t < b.end);
      if (t >= this.next) {
        if (this.blooms.length < MAX) this.spawn(t);
        this.next = t + GAP[0] + this.random() * (GAP[1] - GAP[0]);
      }
      this.work();
    }

    // Paint waiting blooms, a bounded number of steps per frame.
    work() {
      if (!this.S) return;
      let steps = STEPS;
      for (const b of this.blooms) {
        if (b.sp) continue;
        if (!b.job) b.job = paintJob(b, this.S);
        while (steps > 0 && b.job) { steps--; if (b.job.next().done) b.job = null; }
        if (!steps) return;
      }
    }

    finish(b) {
      if (!b.job) b.job = paintJob(b, this.S);
      while (!b.job.next().done);
      b.job = null;
    }

    build(S) {
      if (S === this.S) return;
      this.S = S;
      for (const b of this.blooms) { b.sp = b.live = null; b.job = null; this.finish(b); }
    }

    // This frame's image of each forming or dissolving bloom, masked once for both passes.
    frame(t) {
      for (const b of this.blooms) {
        if (!b.sp) continue;
        const [ph, p] = (b.now = b.phase(t));
        const live = b.live || {};
        if (ph === 'forming') {
          formMasks(b.field, p);
          b.live = { reveal: through(b, b.field.mask, live.reveal), boost: through(b, b.field.boost, live.boost) };
        } else if (ph === 'fading') {
          fadeMask(b.field, p);
          b.live = { reveal: through(b, b.field.mask, live.reveal) };
        } else b.live = null;
      }
    }

    // Two passes. 'glow' lays the ink's own colour over the dark ('screen'); 'tint'
    // stains whatever was drawn before it in the ink's hue ('color'), the way washes
    // colour the linework of a painted key visual. `pick(bloom)` selects the blooms.
    draw(ctx, view, t, pass, pick) {
      const P = 42, S = view.S;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = pass === 'tint' ? 'color' : 'screen';
      for (const b of this.blooms) {
        if (!b.sp || !b.now || !pick(b)) continue;
        const [ph, p] = b.now;
        if (ph === 'prep' || ph === 'gone') continue;
        const a1 = hash(b.seed, 1) * TAU, a2 = hash(b.seed, 2) * TAU;
        const dx = Math.sin(t / 89 + a1) * 8 - b.cam.x * P * b.depth;
        const dy = Math.cos(t / 107 + a2) * 5.6 - b.cam.y * P * b.depth * 0.7;
        const box = [view.ox + (b.x + b.sp.x0 + dx) * S, view.oy + (b.y + b.sp.y0 + dy) * S, b.sp.w * S, b.sp.h * S];
        // Wet paint is a little more intense and dries lighter; dissolving thins it.
        const fadeIn = smooth(0, 0.04, p);
        const level = ph === 'forming' ? 1.2 * fadeIn
          : ph === 'drying' ? 1 + 0.2 * (1 - smooth(0, 1, p))
          : ph === 'fading' ? 1 - 0.3 * p : 1;
        const A = (pass === 'tint' ? TINT : b.alpha) * level * (1 + 0.06 * Math.sin(t / 41 + a1));
        ctx.globalAlpha = Math.min(1, A);
        ctx.drawImage(b.live ? b.live.reveal : b.sp.c, ...box);
        if (pass === 'glow' && ph === 'forming') {
          ctx.globalAlpha = Math.min(1, b.alpha * fadeIn);
          ctx.drawImage(b.live.boost, ...box);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  return { Field, ZONES, MAX };
})();
