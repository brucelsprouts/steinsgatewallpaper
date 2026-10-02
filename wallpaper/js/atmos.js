'use strict';
// Atmosphere over the whole frame: drifting dust lit by the tubes, a grungy textured
// border under the vignette, and film grain over everything.
const Atmos = (() => {
  const { TAU, canvas, rng, fbm2, smooth } = Kit;

  // ---------- Dust ----------
  class Dust {
    constructor(n = 70, seed = 5) {
      const r = rng(seed);
      this.motes = Array.from({ length: n }, () => ({
        x: r() * 2560, y: r() * 1540,
        depth: -0.6 + r() * 1.8,              // some behind the meter, some in front
        size: 0.7 + Math.pow(r(), 3) * 2.8,
        rise: 2 + r() * 5,                     // design px per second
        sway: 5 + r() * 12, phase: r() * TAU, rate: 0.04 + r() * 0.08,
        a: 0.3 + r() * 0.7,
      }));
      this.cam = { x: 0, y: 0 };
    }

    build(S, theme) {
      const dot = rgb => {
        const R = 16, c = canvas(R * 2, R * 2), g = c.getContext('2d');
        const rg = g.createRadialGradient(R, R, 0, R, R, R);
        rg.addColorStop(0, `rgba(${rgb},1)`);
        rg.addColorStop(0.35, `rgba(${rgb},0.45)`);
        rg.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = rg;
        g.fillRect(0, 0, R * 2, R * 2);
        return c;
      };
      this.lit = dot(theme === 'cold' ? '210,224,255' : '255,196,140');
      this.plain = dot('214,208,200');
    }

    // `light` is the meter centre in design px: motes near it catch the glow.
    draw(ctx, view, t, light) {
      const P = 42, W = 2660, H = 1540;
      ctx.globalCompositeOperation = 'screen';
      for (const m of this.motes) {
        let x = m.x + Math.sin(t * m.rate + m.phase) * m.sway - this.cam.x * P * m.depth;
        let y = m.y - t * m.rise - this.cam.y * P * m.depth * 0.7;
        x = ((x + 50) % W + W) % W - 50;
        y = ((y + 50) % H + H) % H - 50;
        const d2 = (x - light.x) ** 2 + ((y - light.y) * 1.6) ** 2;
        const glow = Math.exp(-d2 / (2 * 330 * 330));
        const near = m.depth > 0.8;                // close to the lens: big, soft, faint
        const size = m.size * (near ? 3.2 : 1) * (1 + glow * 0.4);
        const twinkle = 0.75 + 0.25 * Math.sin(t * 0.9 + m.phase * 3);
        ctx.globalAlpha = Math.min(1, m.a * (0.07 + 0.3 * glow) * twinkle * (near ? 0.45 : 1));
        const s = size * 3.2 * view.S;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(glow > 0.15 ? this.lit : this.plain, view.ox + x * view.S - s / 2, view.oy + y * view.S - s / 2, s, s);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Grain: fine speckle, strongest at the edges and around the glow ----------
  // Half resolution, so each grain covers about two pixels. Drawn with `difference`:
  // on the dark border it lifts into speckle, on the bright glow it breaks it up a little.
  const AMP = 40;
  function grain(view, hot, seed = 61) {
    const k = 0.5, w = Math.max(1, Math.ceil(view.W * k)), h = Math.max(1, Math.ceil(view.H * k));
    const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    const S = view.S * k, hx = view.ox * k + hot.x * S, hy = view.oy * k + hot.y * S;
    // Separable terms: the edge falloff and the hot spot, per column and per row.
    const ex = new Float32Array(w), gx = new Float32Array(w), ey = new Float32Array(h), gy = new Float32Array(h);
    for (let x = 0; x < w; x++) { ex[x] = Math.abs(x / w * 2 - 1) ** 3; gx[x] = Math.exp(-(((x - hx) / (hot.rx * S)) ** 2)); }
    for (let y = 0; y < h; y++) { ey[y] = Math.abs(y / h * 2 - 1) ** 3; gy[y] = Math.exp(-(((y - hy) / (hot.ry * S)) ** 2)); }
    let s = seed >>> 0 || 1;
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        const edge = smooth(0.55, 1.05, Math.cbrt(ex[x] + ey[y]));
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        const n = (s >>> 0) / 4294967296;
        const v = n * n * (0.06 + 0.5 * edge + 0.45 * gx[x] * gy[y]) * AMP;
        d[i] = v; d[i + 1] = v * 0.95; d[i + 2] = v * 0.88; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------- Grunge border: blotchy dark texture that thickens toward the edges ----------
  function grunge(view, seed = 31) {
    const k = 0.25, w = Math.max(1, Math.round(view.W * k)), h = Math.max(1, Math.round(view.H * k));
    const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
    const f = 1 / (view.S * k); // noise in design units, so the texture scales with the screen
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = Math.abs(x / w * 2 - 1), v = Math.abs(y / h * 2 - 1);
        const d = Math.pow(Math.pow(u, 3) + Math.pow(v, 3), 1 / 3);
        const mask = smooth(0.6, 1.08, d);
        if (mask <= 0) continue;
        const blot = smooth(0.32, 0.72, fbm2(x * f / 260, y * f / 260, seed, 4));
        const fine = fbm2(x * f / 40, y * f / 40, seed + 9, 3);
        const i = (y * w + x) * 4;
        img.data[i] = 3; img.data[i + 1] = 2; img.data[i + 2] = 2;
        img.data[i + 3] = 255 * Math.min(1, mask * (0.2 + 0.8 * blot) * (0.75 + 0.5 * fine) * 0.85);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  return { Dust, grain, grunge };
})();
