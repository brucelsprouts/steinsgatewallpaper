'use strict';
// Drafted overlays in the spirit of mixed-media anime illustration: drafting marks, baked
// once. Also the organic shape helpers that the living ink (ink.js) is painted with.
const Paint = (() => {
  const { TAU, canvas, rng } = Kit;

  const COLORS = { white: '238,232,222' };

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
    marks: (g, o) => marks(g, o.seed, o),
  };

  // A placed overlay: baked once, drawn each frame with parallax and slow breathing.
  class Overlay {
    constructor(o) {
      Object.assign(this, { x: 0, y: 0, depth: 0, blur: 0, res: 1, alpha: 0.12, rot: 0, op: 'screen', drift: 8, seed: 1, breathe: 0 }, o);
      this.cam = { x: 0, y: 0 };
    }

    // Half-extents of the baked art around its centre.
    bounds() { return [this.spread / 2 + 24, this.spread * 0.35 + 24]; }

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

  return { Overlay, COLORS, gauss, deform, polyPath, circlePts };
})();
