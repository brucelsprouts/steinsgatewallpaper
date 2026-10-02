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

  return { TAU, canvas, hash, rng, noise, clamp, smooth, ease };
})();
