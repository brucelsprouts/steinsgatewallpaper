'use strict';
// Atmosphere over the whole frame: drifting dust lit by the tubes, very light smoke,
// hot spots and film light leaks, a grungy textured border under the vignette, dust
// on the lens and film grain over everything.
const Atmos = (() => {
  const { TAU, canvas, rng, fbm2, pfbm2, smooth } = Kit;

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

  // ---------- Smoke: very light haze drifting through the scene ----------
  // Two tileable wisps at an eighth of the resolution, scrolled different ways so the
  // smoke seems to curl. Lit warm near the tubes, grey elsewhere, thinning upward.
  function wisp(n, seed) {
    const c = canvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n), P = 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n * P, v = y / n * P;
        const wx = pfbm2(u, v, P, seed, 3), wy = pfbm2(u + 1.7, v + 9.2, P, seed + 5, 3);
        const i = (y * n + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = smooth(0.45, 0.8, pfbm2(u + wx * 2, v + wy * 2, P, seed + 9, 4)) * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  class Smoke {
    constructor(seed = 17) { this.seed = seed; this.cam = { x: 0, y: 0 }; }

    // `light` is the meter centre in design px.
    build(view, light) {
      const k = 1 / 8, w = Math.ceil(view.W * k), h = Math.ceil(view.H * k);
      this.k = k;
      this.layer = canvas(w, h);
      if (!this.tiles) this.tiles = [wisp(160, this.seed), wisp(160, this.seed + 1)];
      const tint = canvas(w, h), g = tint.getContext('2d');
      g.fillStyle = 'rgb(150,146,140)';
      g.fillRect(0, 0, w, h);
      const mx = (view.ox + light.x * view.S) * k, my = (view.oy + light.y * view.S) * k;
      const rg = g.createRadialGradient(mx, my, 0, mx, my, 760 * view.S * k);
      rg.addColorStop(0, 'rgba(255,170,100,0.9)');
      rg.addColorStop(1, 'rgba(255,170,100,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
      const vg = g.createLinearGradient(0, 0, 0, h);
      vg.addColorStop(0, 'rgba(0,0,0,0.3)');
      vg.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-in';
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);
      this.tint = tint;
    }

    draw(ctx, view, t) {
      const g = this.layer.getContext('2d'), w = this.layer.width, h = this.layer.height;
      const par = 42 * 0.6 * view.S * this.k;
      const layers = [[0.6, -0.25, 1.6, 1], [-0.4, -0.35, 2.3, 0.7]];
      layers.forEach(([vx, vy, sc, a], i) => {
        const pat = g.createPattern(this.tiles[i], 'repeat');
        pat.setTransform(new DOMMatrix().translate(t * vx - this.cam.x * par * (1 + i * 0.4), t * vy - this.cam.y * par * 0.7).scale(sc));
        g.globalCompositeOperation = i ? 'lighter' : 'copy';
        g.globalAlpha = a;
        g.fillStyle = pat;
        g.fillRect(0, 0, w, h);
      });
      g.globalCompositeOperation = 'source-in';
      g.globalAlpha = 1;
      g.drawImage(this.tint, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.07;
      ctx.drawImage(this.layer, 0, 0, view.W, view.H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Light: soft hot spots on the clockwork, and film light leaks ----------
  // Both at an eighth of the resolution: they are nothing but soft gradients.
  function glowSpot(g, x, y, rx, ry, rgb, a) {
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    rg.addColorStop(0, `rgba(${rgb},${a})`);
    rg.addColorStop(0.45, `rgba(${rgb},${a * 0.45})`);
    rg.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = rg;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  }

  class Light {
    constructor() { this.flareAt = -1e9; this.cam = { x: 0, y: 0 }; }

    build(view) {
      const k = 1 / 8, w = Math.ceil(view.W * k), h = Math.ceil(view.H * k), S = view.S * k;
      const X = x => (view.ox + x * view.S) * k, Y = y => (view.oy + y * view.S) * k;
      const make = fn => { const c = canvas(w, h), g = c.getContext('2d'); g.globalCompositeOperation = 'lighter'; fn(g); return c; };
      // Hot spots: light pooling on the clockwork.
      this.hot = make(g => {
        glowSpot(g, X(2050), Y(430), 560 * S, 470 * S, '255,196,140', 0.55);
        glowSpot(g, X(1720), Y(1130), 420 * S, 300 * S, '150,205,215', 0.32);
        glowSpot(g, X(2380), Y(930), 300 * S, 260 * S, '255,176,120', 0.3);
      });
      // Leaks: warm light bleeding in past the edge of the film, one on each side.
      this.leaks = [
        make(g => {
          glowSpot(g, X(2600), Y(260), 620 * S, 900 * S, '255,128,60', 0.75);
          glowSpot(g, X(2560), Y(120), 300 * S, 520 * S, '255,214,150', 0.6);
        }),
        make(g => {
          glowSpot(g, X(-60), Y(1380), 700 * S, 520 * S, '228,70,96', 0.6);
          glowSpot(g, X(160), Y(1440), 360 * S, 260 * S, '255,150,110', 0.45);
        }),
      ];
    }

    // A worldline shift washes the frame with a burst of leaked light.
    flare(t) { this.flareAt = t; }

    // 'hot' goes in with the scene; 'leak' goes over everything, past the vignette.
    draw(ctx, view, t, pass) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      if (pass === 'hot') {
        const dx = -this.cam.x * 42 * 0.6 * view.S, dy = -this.cam.y * 42 * 0.4 * view.S;
        ctx.globalAlpha = 0.12 * (0.85 + 0.15 * Math.sin(t / 19));
        ctx.drawImage(this.hot, dx, dy, view.W, view.H);
      } else {
        const burst = 1 + 2.2 * Math.exp(-Math.max(0, t - this.flareAt) / 1.3) * (t >= this.flareAt ? 1 : 0);
        this.leaks.forEach((c, i) => {
          const breathe = 0.5 + 0.5 * Math.sin(t / (47 + i * 14) + i * 2.1);
          ctx.globalAlpha = Math.min(1, 0.12 * (0.25 + 0.75 * breathe) * burst);
          ctx.drawImage(c, Math.sin(t / (71 + i * 9)) * 30 * view.S, 0, view.W, view.H);
        });
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Lens dust: fine specks sitting on the glass ----------
  // Sparse, mostly toward the edges; drawn with `screen` over everything.
  function lensDust(view, seed = 23) {
    const k = 0.5, w = Math.ceil(view.W * k), h = Math.ceil(view.H * k), S = view.S * k;
    const c = canvas(w, h), g = c.getContext('2d'), r = rng(seed);
    const edge = (x, y) => smooth(0.4, 1.05, Math.cbrt(Math.abs(x / w * 2 - 1) ** 3 + Math.abs(y / h * 2 - 1) ** 3));
    g.fillStyle = '#efe4d6';
    for (let i = 0; i < 900; i++) {
      const x = r() * w, y = r() * h;
      if (r() > 0.06 + 0.94 * edge(x, y)) continue;
      g.globalAlpha = 0.1 + r() * 0.35;
      g.beginPath();
      g.arc(x, y, (0.3 + Math.pow(r(), 4) * 1.2) * Math.max(0.7, S * 2), 0, TAU);
      g.fill();
    }
    return c;
  }

  // ---------- Grain: fine speckle, strongest at the edges and around the glow ----------
  // Half resolution, so each grain covers about two pixels. Drawn with `difference`:
  // on the dark border it lifts into speckle, on the bright glow it breaks it up a little.
  const AMP = 32;
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
        const v = n * n * (0.02 + 0.28 * edge + 0.3 * gx[x] * gy[y]) * AMP;
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

  return { Dust, Smoke, Light, lensDust, grain, grunge };
})();
