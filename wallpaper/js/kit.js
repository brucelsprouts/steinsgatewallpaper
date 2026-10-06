'use strict';
// Small shared helpers: canvases, deterministic noise, easing.
const Kit = (() => {
  const TAU = Math.PI * 2;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // Stateless integer hash -> [0, 1).
  function hash(a, b = 0) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x9e3779b9, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Smooth 1D value noise in [0, 1).
  function noise(x, seed = 0) {
    const i = Math.floor(x), f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = hash(i, seed), b = hash(i + 1, seed);
    return a + (b - a) * u;
  }

  // Smooth 2D value noise in [0, 1), and a few octaves of it.
  function noise2(x, y, seed = 0) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const h = (a, b) => hash(a * 374761393 + b * 668265263, seed);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm2(x, y, seed = 0, octaves = 4) {
    let v = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < octaves; o++) { v += amp * noise2(x * f, y * f, seed + o * 17); norm += amp; amp *= 0.5; f *= 2.03; }
    return v / norm;
  }

  // Tileable versions: the lattice wraps every P cells, and each octave doubles both
  // frequency and period, so a tile of P cells repeats seamlessly.
  function pnoise2(x, y, P, seed = 0) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const w = n => ((n % P) + P) % P;
    const h = (a, b) => hash(w(a) * 374761393 + w(b) * 668265263, seed);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function pfbm2(x, y, P, seed = 0, octaves = 4) {
    let v = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < octaves; o++) { v += amp * pnoise2(x * f, y * f, P * f, seed + o * 17); norm += amp; amp *= 0.5; f *= 2; }
    return v / norm;
  }

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const ease = {
    inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: t => 1 - Math.pow(1 - t, 3),
    // Mechanical tick: fast move, small overshoot, settle.
    tick: t => {
      const c = 1.4;
      t = clamp(t);
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    },
  };

  // Stepped motion: `amount` every `period` s, each step eased over `dur` s, like a
  // clock's hand ticking.
  function stepped(t, period, dur, amount, offset = 0) {
    const u = t / period + offset, n = Math.floor(u);
    return amount * (n + ease.inOut(clamp((u - n) * period / dur)));
  }

  return { TAU, canvas, hash, rng, noise, noise2, fbm2, pnoise2, pfbm2, clamp, smooth, ease, stepped };
})();
