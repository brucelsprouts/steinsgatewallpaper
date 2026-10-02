'use strict';
// Painted overlays in the spirit of mixed-media anime illustration: thrown paint
// splats and flicks, watercolour washes, pen scratches, drafting marks, and a faint
// worldline (attractor field) diagram. All procedural and seeded, baked once.
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

  // Uneven pigment: fractal noise knocks the paint back in blotches, as if it pooled
  // in places and thinned in others. `scale` sets blotch size (higher = finer).
  function mottle(g, hw, hh, seed, strength, scale = 1) {
    const n = 96, c = canvas(n, n), cg = c.getContext('2d'), img = cg.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = Kit.fbm2(x / n * 4 * scale, y / n * 4 * scale, seed, 4);
        img.data[(y * n + x) * 4 + 3] = Kit.smooth(0.32, 0.72, v) * 255;
      }
    }
    cg.putImageData(img, 0, 0);
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = strength;
    g.drawImage(c, -hw, -hh, hw * 2, hh * 2);
    g.restore();
  }

  // A droplet in flight: round when slow, a teardrop with a tail when fast.
  function tadpole(g, x, y, a, s, e) {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.beginPath(); g.ellipse(0, 0, s * e, s, 0, 0, TAU); g.fill();
    if (e > 1.35) {
      g.beginPath();
      g.moveTo(-s * e * 0.5, -s * 0.55);
      g.quadraticCurveTo(-s * e * 1.6, -s * 0.1, -s * e * 2.3, 0);
      g.quadraticCurveTo(-s * e * 1.6, s * 0.1, -s * e * 0.5, s * 0.55);
      g.fill();
    }
    g.restore();
  }

  // Tapered finger of paint leaving the core along angle a, with a bulb at the tip.
  function finger(g, a, base, len, w, r) {
    const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
    const b1 = base + len, bm = base + len * 0.55, neck = w * (0.25 + r() * 0.2);
    g.beginPath();
    g.moveTo(ca * base + nx * w, sa * base + ny * w);
    g.quadraticCurveTo(ca * bm + nx * neck * 1.2, sa * bm + ny * neck * 1.2, ca * b1 + nx * neck, sa * b1 + ny * neck);
    g.lineTo(ca * b1 - nx * neck, sa * b1 - ny * neck);
    g.quadraticCurveTo(ca * bm - nx * neck * 1.2, sa * bm - ny * neck * 1.2, ca * base - nx * w, sa * base - ny * w);
    g.closePath();
    g.fill();
    const free = r() < 0.35 ? len * (0.15 + r() * 0.4) : 0;
    g.beginPath(); g.arc(ca * (b1 + free), sa * (b1 + free), neck * (1.6 + r() * 0.9), 0, TAU); g.fill();
  }

  // Thrown paint: the splash keeps its momentum. The core stretches along `dir`,
  // fingers and beaded spray streaks shoot forward, droplets fly ahead in a cone
  // and trail tails back toward the impact; drips still run straight down.
  function splat(g, R, seed, o = {}) {
    const r = rng(seed);
    const dir = o.dir ?? r() * TAU, sp = o.speed ?? 0.6;
    const r0 = R * (o.core ?? 0.17);
    const stretch = 1 + sp * 0.9, squash = 1 - sp * 0.2;
    const cx = -Math.cos(dir) * R * 0.3 * sp, cy = -Math.sin(dir) * R * 0.3 * sp;
    g.fillStyle = `rgb(${o.color || COLORS.white})`;
    g.strokeStyle = g.fillStyle;
    g.save();
    g.translate(cx, cy);
    g.rotate(dir);
    // In this frame the paint travels toward +x.
    g.save();
    g.scale(stretch, squash);
    g.fill(polyPath(deform(circlePts(14, r0, r, [0.6, 1.4]), 4, 0.14, r)));
    g.restore();
    const edge = a => r0 * 0.85 / Math.hypot(Math.cos(a) / stretch, Math.sin(a) / squash);
    for (let k = 0; k < (o.spikes ?? 18); k++) {
      const fwd = r() < 0.8;
      const a = fwd ? gauss(r) * (0.95 - sp * 0.45) : Math.PI + gauss(r) * 0.8;
      const reach = fwd ? Math.max(0.35, Math.cos(a)) : 0.35;
      finger(g, a, edge(a), r0 * (0.2 + Math.pow(r(), 1.6) * (0.8 + sp * 1.8)) * reach, r0 * (0.05 + r() * 0.08) * (fwd ? 1 : 0.7), r);
    }
    // Spray streaks, breaking into beads as they thin out.
    g.lineCap = 'round';
    for (let k = 0; k < (o.streaks ?? 7); k++) {
      const a = gauss(r) * 0.3 * (1.2 - sp * 0.5), ca = Math.cos(a), sa = Math.sin(a);
      const start = edge(a) + r0 * 0.1, L = r0 * (1.6 + r() * 2.6) * (0.6 + sp);
      let d = start, w = r0 * (0.035 + r() * 0.03);
      while (d < start + L && w > 0.45) {
        const seg = r0 * (0.15 + r() * 0.5);
        g.lineWidth = w;
        g.beginPath(); g.moveTo(ca * d, sa * d); g.lineTo(ca * (d + seg), sa * (d + seg)); g.stroke();
        d += seg + r0 * (0.05 + r() * 0.25) * ((d - start) / L + 0.2);
        w *= 0.8;
      }
      tadpole(g, ca * (d + r0 * 0.2), sa * (d + r0 * 0.2), a, Math.max(0.6, w * 1.2), 1.8);
    }
    for (let k = 0; k < (o.drops ?? 60); k++) {
      const ahead = r() < 0.85;
      const a = ahead ? gauss(r) * (0.35 + (1 - sp) * 0.6) : Math.PI + gauss(r) * 0.9;
      const f = Math.pow(r(), 1.3);
      const d = edge(a) + r0 * (0.4 + f * (ahead ? 2.6 + sp * 2.2 : 1.0));
      const sz = Math.max(0.6, r0 * 0.08 * Math.pow(r(), 1.7) * (1.1 - f * 0.6));
      tadpole(g, Math.cos(a) * d, Math.sin(a) * d, a, sz, 1 + f * 1.8 * sp);
    }
    g.save();
    g.globalAlpha = 0.5;
    for (let k = 0; k < (o.mist ?? 200); k++) {
      const a = gauss(r) * 1.1, d = r0 * (1 + Math.pow(r(), 0.6) * 5), sz = 0.35 + r() * 1.0;
      g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, sz, 0, TAU); g.fill();
    }
    g.restore();
    g.restore();
    // Drips obey gravity whatever the throw direction.
    for (let k = 0; k < (o.drips ?? 0); k++) {
      const x = cx + (r() - 0.5) * r0 * 1.2, y0 = cy + r0 * 0.5, len = r0 * (0.8 + r() * 2.6), w = r0 * (0.035 + r() * 0.04);
      g.beginPath();
      g.moveTo(x - w, y0);
      g.quadraticCurveTo(x - w * 0.55, y0 + len * 0.6, x - w * 0.45, y0 + len);
      g.arc(x, y0 + len, w * 0.5, Math.PI, 0, true);
      g.quadraticCurveTo(x + w * 0.55, y0 + len * 0.6, x + w, y0);
      g.closePath();
      g.fill();
      g.beginPath(); g.arc(x, y0 + len + w * 0.3, w * 0.8, 0, TAU); g.fill();
    }
    mottle(g, R, R, seed * 7 + 1, o.mottle ?? 0.45, 2.2);
    grain(g, R, r, o.grain ?? 1500, 0.35);
  }

  // A flick: paint whipped off a brush, strung along an arc in shrinking beads.
  function flick(g, R, seed, o = {}) {
    const r = rng(seed);
    const rot = o.rot0 ?? r() * TAU, c = Math.cos(rot), s = Math.sin(rot);
    const P = [[-R * 0.85, R * 0.3], [-R * 0.05, -R * 0.55], [R * 0.85, -R * 0.15]]
      .map(([x, y]) => [x * c - y * s, x * s + y * c]);
    const at = t => {
      const u = 1 - t;
      return [u * u * P[0][0] + 2 * u * t * P[1][0] + t * t * P[2][0], u * u * P[0][1] + 2 * u * t * P[1][1] + t * t * P[2][1]];
    };
    g.fillStyle = `rgb(${o.color || COLORS.white})`;
    g.strokeStyle = g.fillStyle;
    const n = o.drops ?? 46;
    let prev = null;
    for (let k = 0; k < n; k++) {
      const t = Math.min(1, Math.pow((k + r() * 0.6) / n, 0.85));
      const [x, y] = at(t), [x2, y2] = at(Math.min(1, t + 0.01));
      const a = Math.atan2(y2 - y, x2 - x), off = gauss(r) * R * 0.03 * (0.3 + t);
      const px = x - Math.sin(a) * off, py = y + Math.cos(a) * off;
      const sz = Math.max(0.6, R * 0.045 * (1 - t * 0.8) * (0.4 + r() * 0.9));
      tadpole(g, px, py, a, sz, 1 + (1 - t) * 1.3 * r());
      // Fine threads of paint between the heavier beads.
      if (prev && sz > R * 0.02 && r() < 0.5) {
        g.globalAlpha = 0.45; g.lineWidth = 0.6;
        g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(px, py); g.stroke();
        g.globalAlpha = 1;
      }
      prev = [px, py];
    }
    mottle(g, R, R, seed * 7 + 3, o.mottle ?? 0.35, 2.5);
    grain(g, R, r, o.grain ?? 600, 0.3);
  }

  // Watercolour: an elongated, lobed stain built from dozens of translucent layers,
  // each a fresh deformation of its lobe. Pigment unevenness is knocked in between
  // layers, then dried edges, backruns and granulation finish it.
  function wash(g, R, seed, color, o = {}) {
    const r = rng(seed);
    const ang = o.angle ?? r() * TAU, asp = o.aspect ?? 1.5 + r() * 0.8;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const lobes = o.lobes ?? 2 + Math.floor(r() * 2);
    const bases = [];
    for (let L = 0; L < lobes; L++) {
      const off = (L - (lobes - 1) / 2) * R * 0.4 * (0.7 + r() * 0.6);
      const rad = R * (0.3 + r() * 0.12);
      const pts = circlePts(10, rad, r, [0.4, 1.7]).map(([x, y, v]) => {
        const X = x * asp * 0.7 + off, Y = y * 0.8 + gauss(r) * R * 0.03;
        return [X * ca - Y * sa, X * sa + Y * ca, v];
      });
      bases.push(deform(pts, 3, 0.3, r));
    }
    const layers = o.layers ?? 30;
    for (let L = 0; L < layers; L++) {
      g.fillStyle = `rgba(${color},${o.alpha ?? 0.035})`;
      g.fill(polyPath(deform(bases[L % lobes], 2, 0.25, r)));
      if (L % 5 === 4) mottle(g, R, R, seed * 7 + L, 0.22, 1.1 + r());
    }
    // Dried edges hold more pigment.
    for (let k = 0; k < lobes + 1; k++) {
      g.strokeStyle = `rgba(${color},0.12)`;
      g.lineWidth = 0.8 + r() * 1.2;
      g.stroke(polyPath(deform(bases[k % lobes], 2, 0.2, r)));
    }
    // Backruns: small cauliflower blooms.
    for (let k = 0; k < (o.blooms ?? 3); k++) {
      const b = bases[k % lobes], [bx, by] = b[Math.floor(r() * b.length)];
      const pts = deform(circlePts(8, R * (0.05 + r() * 0.07), r, [0.8, 2]), 3, 0.3, r).map(([x, y, v]) => [x + bx * 0.6, y + by * 0.6, v]);
      g.strokeStyle = `rgba(${color},0.1)`;
      g.stroke(polyPath(pts));
    }
    grain(g, R, r, o.grain ?? 5000, 0.25, 1.6);
    mottle(g, R, R, seed * 13, 0.35, 3.5);
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
    splat: (g, o) => splat(g, o.r, o.seed, o),
    flick: (g, o) => flick(g, o.r, o.seed, o),
    wash: (g, o) => wash(g, o.r, o.seed, COLORS[o.color] || o.color, o),
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
