'use strict';
// Painted overlays in the spirit of mixed-media anime illustration: white paint
// splatter with drips, watercolour blooms, dry-brush strokes, pen scratches, and a
// faint worldline (attractor field) diagram. All procedural and seeded, baked once.
const Paint = (() => {
  const { TAU, canvas, rng } = Kit;

  const COLORS = {
    white: '238,232,222',
    teal: '70,160,172',
    crimson: '176,46,66',
    violet: '132,84,170',
    rose: '206,128,146',
    amber: '200,142,74',
  };

  // Standard normal sample from a uniform rng.
  const gauss = r => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(TAU * r());

  // Recursive midpoint displacement: each edge gains a jittered midpoint, scaled by
  // the edge length and a per-vertex "wetness" so some edges bleed more than others.
  function deform(pts, depth, variance, r) {
    for (let d = 0; d < depth; d++) {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        out.push(a);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const v = (a[2] + b[2]) / 2 * (0.85 + r() * 0.3);
        const sd = len * variance * v;
        out.push([(a[0] + b[0]) / 2 + gauss(r) * sd, (a[1] + b[1]) / 2 + gauss(r) * sd, v]);
      }
      pts = out;
    }
    return pts;
  }

  function polyPath(pts) {
    const p = new Path2D();
    pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  }

  function circlePts(n, rad, r, wet = [0.5, 1.5]) {
    return Array.from({ length: n }, (_, i) => {
      const a = i / n * TAU;
      return [Math.cos(a) * rad, Math.sin(a) * rad, wet[0] + r() * (wet[1] - wet[0])];
    });
  }

  // Punch tiny holes so paint reads as dry and grainy rather than vector-flat.
  function grain(g, R, r, count, alpha, size = 1.4) {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = `rgba(0,0,0,${alpha})`;
    for (let i = 0; i < count; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * R, s = 0.4 + r() * size;
      g.fillRect(Math.cos(a) * d, Math.sin(a) * d, s, s);
    }
    g.restore();
  }

  // Paint splatter: a fractal-edged core, short fingers ending in bulbs, droplets
  // thrown along the fingers, fine mist, and optional drips.
  function splatter(g, R, seed, o = {}) {
    const r = rng(seed);
    const r0 = R * (o.core ?? 0.22);
    g.fillStyle = `rgb(${o.color || COLORS.white})`;
    g.fill(polyPath(deform(circlePts(14, r0, r, [0.6, 1.4]), 4, 0.13, r)));
    const fingers = [];
    for (let k = 0; k < (o.spikes ?? 22); k++) {
      const a = r() * TAU;
      const len = r0 * (0.12 + Math.pow(r(), 2.2) * (o.reach ?? 1.1));
      const w = r0 * (0.045 + r() * 0.07);
      fingers.push(a);
      const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
      const b0 = r0 * 0.8, b1 = r0 * 0.8 + len, bm = b0 + len * 0.55;
      const neck = w * (0.25 + r() * 0.2);
      g.beginPath();
      g.moveTo(ca * b0 + nx * w, sa * b0 + ny * w);
      g.quadraticCurveTo(ca * bm + nx * neck * 1.2, sa * bm + ny * neck * 1.2, ca * b1 + nx * neck, sa * b1 + ny * neck);
      g.lineTo(ca * b1 - nx * neck, sa * b1 - ny * neck);
      g.quadraticCurveTo(ca * bm - nx * neck * 1.2, sa * bm - ny * neck * 1.2, ca * b0 - nx * w, sa * b0 - ny * w);
      g.closePath();
      g.fill();
      // Bulb at the tip; sometimes it has already broken free.
      const free = r() < 0.35 ? len * (0.15 + r() * 0.4) : 0;
      g.beginPath(); g.arc(ca * (b1 + free), sa * (b1 + free), neck * (1.6 + r() * 0.9), 0, TAU); g.fill();
    }
    // Droplets: mostly flung along the fingers, smaller and more stretched further out.
    for (let k = 0; k < (o.drops ?? 70); k++) {
      const a = r() < 0.65 ? fingers[Math.floor(r() * fingers.length)] + gauss(r) * 0.12 : r() * TAU;
      const f = Math.pow(r(), 1.5);
      const d = r0 * (1.3 + f * (o.spread ?? 3));
      const sz = Math.max(0.6, r0 * 0.075 * Math.pow(r(), 1.8) * (1.1 - f * 0.7));
      const e = 1 + f * 1.8 * r();
      g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, sz * e, sz, a, 0, TAU); g.fill();
    }
    g.save();
    g.globalAlpha = 0.55;
    for (let k = 0; k < (o.mist ?? 220); k++) {
      const a = r() * TAU, d = r0 * (1.1 + Math.pow(r(), 0.7) * 4), sz = 0.35 + r() * 1.1;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, sz, 0, TAU); g.fill();
    }
    g.restore();
    for (let k = 0; k < (o.drips ?? 0); k++) {
      const x = (r() - 0.5) * r0 * 1.2, y0 = r0 * 0.6, len = r0 * (0.8 + r() * 2.6), w = r0 * (0.035 + r() * 0.04);
      g.beginPath();
      g.moveTo(x - w, y0);
      g.quadraticCurveTo(x - w * 0.55, y0 + len * 0.6, x - w * 0.45, y0 + len);
      g.arc(x, y0 + len, w * 0.5, Math.PI, 0, true);
      g.quadraticCurveTo(x + w * 0.55, y0 + len * 0.6, x + w, y0);
      g.closePath();
      g.fill();
      g.beginPath(); g.arc(x, y0 + len + w * 0.3, w * 0.8, 0, TAU); g.fill();
    }
    grain(g, R, r, o.grain ?? 1200, 0.35);
  }

  // Watercolour: dozens of translucent layers, each a fresh deformation of one
  // fractal base shape, granulated between batches. Edges bleed; the middle pools.
  function wash(g, R, seed, color, o = {}) {
    const r = rng(seed);
    const base = deform(circlePts(10, R * 0.5, r, [0.4, 1.6]), 3, 0.32, r);
    const layers = o.layers ?? 36;
    for (let L = 0; L < layers; L++) {
      g.fillStyle = `rgba(${color},${o.alpha ?? 0.04})`;
      g.fill(polyPath(deform(base, 3, 0.22, r)));
      if (L % 6 === 5) grain(g, R * 0.9, r, 400, 0.06, 18);
    }
    grain(g, R, r, o.grain ?? 2200, 0.12);
  }

  // A broad brush sweep: tapered ribbon with ragged edges, dragged dry at the tail.
  function brush(g, seed, o) {
    const r = rng(seed);
    const [p0, p1, p2, p3] = o.path, W = o.width;
    const at = t => {
      const u = 1 - t;
      return [
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ];
    };
    const N = 220, left = [], right = [], frames = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, [x, y] = at(t);
      const [x1, y1] = at(Math.min(1, t + 1 / N)), [x0, y0] = at(Math.max(0, t - 1 / N));
      const tl = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / tl, ny = (x1 - x0) / tl;
      const w = W * (0.18 + 0.82 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.55)) * (1 + 0.12 * (Kit.noise(t * 9, 3) - 0.5));
      const jl = (Kit.noise(t * 60, 1) - 0.5) * W * 0.08, jr = (Kit.noise(t * 60, 2) - 0.5) * W * 0.08;
      left.push([x + nx * (w / 2 + jl), y + ny * (w / 2 + jl)]);
      right.push([x - nx * (w / 2 + jr), y - ny * (w / 2 + jr)]);
      frames.push([x, y, nx, ny, w]);
    }
    g.fillStyle = `rgb(${o.color || COLORS.white})`;
    g.fill(polyPath([...left, ...right.reverse()]));
    // Dry streaks: bristle gaps along the stroke, more of them toward the tail.
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.lineCap = 'round';
    for (let k = 0; k < (o.bristles ?? 90); k++) {
      const off = r() - 0.5, start = r() * 0.9, len = 0.05 + r() * 0.45;
      g.strokeStyle = `rgba(0,0,0,${0.5 + r() * 0.5})`;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      let first = true;
      for (let i = Math.floor(start * N); i <= Math.min(N, Math.floor((start + len) * N)); i++) {
        const [x, y, nx, ny, w] = frames[i];
        const px = x + nx * off * w, py = y + ny * off * w;
        if (!first && r() < 0.3 + (i / N) * 0.3) { g.moveTo(px, py); continue; }
        first ? g.moveTo(px, py) : g.lineTo(px, py);
        first = false;
      }
      g.stroke();
    }
    g.restore();
    grain(g, Math.max(...o.path.map(p => Math.hypot(p[0], p[1]))) + W, r, 3000, 0.25);
  }

  // Quick pen scratches: jittery hatching like a sketch left in the margin.
  function scratches(g, seed, o) {
    const r = rng(seed);
    g.strokeStyle = `rgb(${o.color || COLORS.white})`;
    g.lineCap = 'round';
    for (let k = 0; k < (o.count ?? 14); k++) {
      const a = (o.angle ?? -0.5) + (r() - 0.5) * 0.25;
      const len = o.len * (0.4 + r() * 0.6);
      const x = (r() - 0.5) * o.spread, y = (r() - 0.5) * o.spread * 0.6;
      g.lineWidth = 0.6 + r() * 0.9;
      g.globalAlpha = 0.4 + r() * 0.6;
      g.beginPath();
      g.moveTo(x, y);
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        g.lineTo(x + Math.cos(a) * len * t + (r() - 0.5) * 2, y + Math.sin(a) * len * t + (r() - 0.5) * 2);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // Attractor field: worldlines that braid and pinch together at attractor points.
  function worldlines(g, seed, o) {
    const r = rng(seed);
    const W = o.width, H = o.height, n = o.lines ?? 13;
    const pinches = o.pinches ?? [0.22, 0.58, 0.86];
    g.strokeStyle = `rgb(${o.color || COLORS.white})`;
    g.fillStyle = g.strokeStyle;
    for (let i = 0; i < n; i++) {
      const lane = (i / (n - 1) - 0.5) * H;
      const ph = r() * TAU, fq = 2 + r() * 3;
      g.lineWidth = i === Math.floor(n / 2) ? 1.6 : 0.8;
      g.globalAlpha = i === Math.floor(n / 2) ? 1 : 0.35 + r() * 0.45;
      g.beginPath();
      for (let x = 0; x <= W; x += 6) {
        const u = x / W;
        let env = 1;
        for (const p of pinches) env *= 1 - 0.85 * Math.exp(-((u - p) ** 2) / 0.0035);
        const y = lane * env + Math.sin(u * fq * TAU + ph) * H * 0.04 * env;
        x ? g.lineTo(x - W / 2, y) : g.moveTo(x - W / 2, y);
      }
      g.stroke();
    }
    // Attractor nodes and tiny annotations.
    g.globalAlpha = 0.9;
    g.font = `${o.font ?? 13}px "Consolas", "Courier New", monospace`;
    g.textBaseline = 'bottom';
    const labels = o.labels ?? ['α  0.571024', 'β  1.130205', '1.048596'];
    pinches.forEach((p, k) => {
      const x = p * W - W / 2;
      g.beginPath(); g.arc(x, 0, 3.2, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(x, -H * 0.62); g.lineTo(x, -H * 0.12); g.stroke();
      if (labels[k]) g.fillText(labels[k], x + 6, -H * 0.5);
    });
    g.globalAlpha = 1;
  }

  // Registration marks, crosshairs and a dotted arc: the instrument-drawing layer.
  function marks(g, seed, o) {
    const r = rng(seed);
    g.strokeStyle = `rgb(${o.color || COLORS.white})`;
    g.lineWidth = 1;
    for (let k = 0; k < (o.count ?? 5); k++) {
      const x = (r() - 0.5) * o.spread, y = (r() - 0.5) * o.spread * 0.7, s = 6 + r() * 8;
      g.globalAlpha = 0.5 + r() * 0.5;
      g.beginPath(); g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke();
      if (r() < 0.5) { g.beginPath(); g.arc(x, y, s * 0.6, 0, TAU); g.stroke(); }
    }
    g.globalAlpha = 0.6;
    g.setLineDash([2, 7]);
    g.beginPath(); g.arc(0, 0, o.spread * 0.42, -2.4, -0.4); g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }

  const KINDS = {
    splatter: (g, o) => splatter(g, o.r, o.seed, o),
    wash: (g, o) => wash(g, o.r, o.seed, COLORS[o.color] || o.color, o),
    brush: (g, o) => brush(g, o.seed, o),
    scratches: (g, o) => scratches(g, o.seed, o),
    worldlines: (g, o) => worldlines(g, o.seed, o),
    marks: (g, o) => marks(g, o.seed, o),
  };

  // A placed overlay: baked once, drawn each frame with parallax and slow breathing.
  class Overlay {
    constructor(o) {
      Object.assign(this, { x: 0, y: 0, depth: 0, blur: 0, res: 1, alpha: 0.12, rot: 0, op: 'screen', drift: 8, seed: 1, breathe: 0 }, o);
      this.cam = { x: 0, y: 0 };
    }

    // Half-extents of the baked art around its centre, per kind.
    bounds() {
      switch (this.kind) {
        case 'brush': {
          const xs = this.path.map(p => Math.abs(p[0])), ys = this.path.map(p => Math.abs(p[1]));
          return [Math.max(...xs) + this.width, Math.max(...ys) + this.width];
        }
        case 'worldlines': return [this.width / 2 + 130, this.height * 0.7 + 20];
        case 'scratches': case 'marks': return [this.spread / 2 + 24, this.spread * 0.35 + 24];
        default: return [this.r, this.r];
      }
    }

    build(S) {
      const [hw0, hh0] = this.bounds(), pad = this.blur * 3 + 4, k = S * this.res;
      const hw = hw0 + pad, hh = hh0 + pad;
      const c = canvas(hw * 2 * k, hh * 2 * k), g = c.getContext('2d');
      g.setTransform(k, 0, 0, k, hw * k, hh * k);
      KINDS[this.kind](g, { ...this, color: COLORS[this.color] || this.color });
      let out = c;
      if (this.blur > 0) {
        out = canvas(c.width, c.height);
        const bg = out.getContext('2d');
        bg.filter = `blur(${this.blur * k}px)`;
        bg.drawImage(c, 0, 0);
      }
      this.sp = { c: out, hw, hh };
    }

    draw(ctx, view, t) {
      const P = 42;
      const dx = Math.sin(t / 89 + this.seed) * this.drift - this.cam.x * P * this.depth;
      const dy = Math.cos(t / 107 + this.seed * 2) * this.drift * 0.7 - this.cam.y * P * this.depth * 0.7;
      const a = this.alpha * (1 + this.breathe * Math.sin(t / 37 + this.seed * 5));
      const S = view.S, c = Math.cos(this.rot), s = Math.sin(this.rot);
      ctx.globalCompositeOperation = this.op;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.setTransform(S * c, S * s, -S * s, S * c, view.ox + (this.x + dx) * S, view.oy + (this.y + dy) * S);
      ctx.drawImage(this.sp.c, -this.sp.hw, -this.sp.hh, this.sp.hw * 2, this.sp.hh * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  return { Overlay, COLORS };
})();
