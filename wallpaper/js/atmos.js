'use strict';
// Atmosphere over the whole frame: drifting dust lit by the tubes and by soft light
// shafts, very light smoke, hot spots, film light leaks drifting along the edges, a
// grungy textured border under the vignette, dust wandering on the lens and film grain
// over everything.
const Atmos = (() => {
  const { TAU, canvas, rng, fbm2, pfbm2, smooth } = Kit;

  // ---------- Dust ----------
  class Dust {
    constructor(n = 110, seed = 5) {
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
      this.beam = null; // (x, y, t) => how strongly light shafts light that point
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

    // `light` is the meter centre in design px: motes near it catch the glow, and so do
    // motes drifting through a light shaft.
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
        const lit = this.beam ? this.beam(x, y, t) : 0;
        const near = m.depth > 0.8;                // close to the lens: big, soft, faint
        const size = m.size * (near ? 3.2 : 1) * (1 + glow * 0.4 + lit * 0.3);
        const twinkle = 0.75 + 0.25 * Math.sin(t * 0.9 + m.phase * 3);
        ctx.globalAlpha = Math.min(1, m.a * (0.07 + 0.3 * glow + 0.45 * lit) * twinkle * (near ? 0.45 : 1));
        const s = size * 3.2 * view.S;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(glow > 0.15 || lit > 0.2 ? this.lit : this.plain, view.ox + x * view.S - s / 2, view.oy + y * view.S - s / 2, s, s);
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

  // ---------- Light: hot spots on the clockwork, light shafts, and film light leaks ----------
  // All soft gradients, so all drawn from small images.
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

  // Light shafts fall from beyond the upper right corner into the clockwork, and fade
  // well before they reach the tubes. Each sways a little and comes and goes on its own.
  const SUN = { x: 2950, y: -420 }, REACH = 3000;
  const BEAMS = [
    { a: 2.22, w: 110, i: 0.8 }, { a: 2.31, w: 70, i: 1 }, { a: 2.40, w: 150, i: 0.6 },
    { a: 2.49, w: 60, i: 0.9 }, { a: 2.58, w: 120, i: 0.55 },
  ];
  const RAYS = 0.06;
  // Along a shaft (0 at the sun, 1 at its far end) and across it (a fraction of its
  // half-width, which grows with distance).
  const along = u => smooth(0, 0.15, u) * (1 - smooth(0.35, 0.8, u));
  const spread = u => 0.15 + 0.35 * u;

  function shaftSprite() {
    const w = 256, h = 64, c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w, v = (y + 0.5) / h * 2 - 1, i = (y * w + x) * 4;
        img.data[i] = 255; img.data[i + 1] = 222; img.data[i + 2] = 184;
        img.data[i + 3] = 255 * along(u) * Math.exp(-((v / spread(u)) ** 2));
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Leak colours, hot core to fringe: mostly warm, now and then magenta.
  const LEAKS = [
    { w: 0.35, stops: ['255,226,180', '255,150,70', '220,70,40'] },   // orange
    { w: 0.25, stops: ['255,205,170', '245,95,95', '170,30,80'] },    // red
    { w: 0.25, stops: ['255,240,190', '250,185,80', '205,100,35'] },  // amber
    { w: 0.15, stops: ['255,210,235', '225,100,185', '120,40,150'] }, // magenta
  ];
  const EDGES = ['top', 'right', 'bottom', 'left'];

  // A leak's light: a long glow, hot in the middle and turning toward its fringe colour,
  // with a smaller glow off-centre so no two look alike.
  function leakSprite(l) {
    const w = 160, h = 96, c = canvas(w, h), g = c.getContext('2d'), [hot, mid, rim] = l.pal.stops;
    g.globalCompositeOperation = 'lighter';
    const blob = (x, y, rx, ry, a) => {
      g.save();
      g.translate(x, y);
      g.scale(1, ry / rx);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      rg.addColorStop(0, `rgba(${hot},${a})`);
      rg.addColorStop(0.3, `rgba(${mid},${a * 0.7})`);
      rg.addColorStop(0.65, `rgba(${rim},${a * 0.3})`);
      rg.addColorStop(1, `rgba(${rim},0)`);
      g.fillStyle = rg;
      g.fillRect(-rx, -rx, rx * 2, rx * 2);
      g.restore();
    };
    blob(w / 2, h / 2, w / 2, h / 2, 0.85);
    blob(w * l.knot[0], h * l.knot[1], w * l.knot[2], h * l.knot[2] * 1.2, 0.5);
    return c;
  }

  class Light {
    // `random` drives the leaks (seed it for repeatable stills).
    constructor(random = Math.random) {
      this.random = random;
      this.flareAt = -1e9;
      this.cam = { x: 0, y: 0 };
      this.leaks = [];
      this.next = null;
      this.lastEdge = null;
    }

    build(view) {
      const k = 1 / 8, w = Math.ceil(view.W * k), h = Math.ceil(view.H * k), S = view.S * k;
      const X = x => (view.ox + x * view.S) * k, Y = y => (view.oy + y * view.S) * k;
      // Hot spots: light pooling on the clockwork.
      this.hot = canvas(w, h);
      const g = this.hot.getContext('2d');
      g.globalCompositeOperation = 'lighter';
      glowSpot(g, X(2050), Y(430), 560 * S, 470 * S, '255,196,140', 0.55);
      glowSpot(g, X(1720), Y(1130), 420 * S, 300 * S, '150,205,215', 0.32);
      glowSpot(g, X(2330), Y(860), 280 * S, 240 * S, '255,176,120', 0.24);
      if (!this.shaft) this.shaft = shaftSprite();
    }

    // ---- Leaks: light bleeding in past the edge of the film, drifting along it ----

    // One or two at a time, each from a different edge than the last, every half
    // minute or so; one is already there at the start.
    update(t) {
      const r = this.random;
      this.leaks = this.leaks.filter(l => t < l.born + l.life);
      if (this.next == null) { this.add(t, 0.2 + r() * 0.3); this.next = t + 8 + r() * 12; }
      if (t >= this.next) {
        if (this.leaks.length < 2) this.add(t);
        this.next = t + 20 + r() * 25;
      }
    }

    // A new leak, `at` of the way through its life already, fading in over `fadeIn` s.
    add(t, at = 0, fadeIn = 8 + this.random() * 6) {
      const r = this.random, edges = EDGES.filter(e => e !== this.lastEdge);
      const edge = edges[Math.floor(r() * edges.length)];
      let u = r() * LEAKS.reduce((s, p) => s + p.w, 0), pal = LEAKS[0];
      for (const p of LEAKS) if ((u -= p.w) <= 0) { pal = p; break; }
      const from = 0.1 + r() * 0.8, travel = (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.25), life = 55 + r() * 40;
      this.lastEdge = edge;
      this.leaks.push({
        edge, pal, knot: [0.3 + r() * 0.4, 0.35 + r() * 0.3, 0.18 + r() * 0.12],
        born: t - at * life, life, fadeIn, fadeOut: 14 + r() * 8,
        from, to: from + travel, len: 1100 + r() * 700, thick: 650 + r() * 350, out: 0.08 + r() * 0.22,
        peak: 0.14 + r() * 0.08, ph: r() * TAU,
      });
      return this.leaks[this.leaks.length - 1];
    }

    // A worldline shift washes the frame with a burst of leaked light, and brings a new leak.
    flare(t) {
      this.flareAt = t;
      if (this.leaks.length < 3) this.add(t, 0, 2.5);
    }

    // Where a leak is and how bright, at time t: its centre sits a little outside the
    // frame (\`out\` of its thickness) and slides along the edge over its life.
    leakAt(l, t) {
      const age = t - l.born, p = smooth(0, 1, age / l.life), u = l.from + (l.to - l.from) * p;
      const env = smooth(0, l.fadeIn, age) * (1 - smooth(l.life - l.fadeOut, l.life, age));
      const d = l.thick * l.out, side = l.edge === 'top' || l.edge === 'bottom';
      const x = side ? u * 2560 : l.edge === 'left' ? -d : 2560 + d;
      const y = side ? (l.edge === 'top' ? -d : 1440 + d) : u * 1440;
      return { x, y, rot: side ? 0 : Math.PI / 2, a: l.peak * env * (0.85 + 0.15 * Math.sin(t / 13 + l.ph)) };
    }

    // ---- Shafts ----

    // Each shaft's angle and strength at time t.
    beams(t) {
      return BEAMS.map((b, i) => ({
        a: b.a + 0.015 * Math.sin(t / (41 + 5 * i) + i * 1.7),
        w: b.w,
        i: b.i * (0.55 + 0.45 * Math.sin(t / (29 + 7 * i) + i * 2.3)),
      }));
    }

    // How strongly the shafts light the point (x, y), 0 to about 1: dust drifting
    // through them catches the light.
    beamAt(x, y, t) {
      const dx = x - SUN.x, dy = y - SUN.y, d = Math.hypot(dx, dy), u = d / REACH;
      if (u <= 0 || u >= 1) return 0;
      const ang = Math.atan2(dy, dx);
      let v = 0;
      for (const b of this.beams(t)) {
        const across = d * Math.sin(ang - b.a) / (b.w * 1.2);
        v += b.i * Math.exp(-((across / spread(u)) ** 2));
      }
      return Math.min(1, v * along(u));
    }

    // 'hot' and 'rays' go in with the scene; 'leak' goes over everything, past the vignette.
    draw(ctx, view, t, pass) {
      const S = view.S, burst = 1 + 2.2 * Math.exp(-Math.max(0, t - this.flareAt) / 1.3) * (t >= this.flareAt ? 1 : 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      if (pass === 'hot') {
        const dx = -this.cam.x * 42 * 0.6 * S, dy = -this.cam.y * 42 * 0.4 * S;
        ctx.globalAlpha = 0.12 * (0.85 + 0.15 * Math.sin(t / 19));
        ctx.drawImage(this.hot, dx, dy, view.W, view.H);
      } else if (pass === 'rays') {
        const ox = view.ox + (SUN.x - this.cam.x * 42 * 0.5) * S, oy = view.oy + (SUN.y - this.cam.y * 42 * 0.35) * S;
        for (const b of this.beams(t)) {
          const c = Math.cos(b.a) * S, s = Math.sin(b.a) * S, h = b.w * 2.4;
          ctx.setTransform(c, s, -s, c, ox, oy);
          ctx.globalAlpha = Math.min(1, RAYS * b.i * (1 + (burst - 1) * 0.3));
          ctx.drawImage(this.shaft, 0, -h / 2, REACH, h);
        }
      } else {
        for (const l of this.leaks) {
          const p = this.leakAt(l, t);
          if (p.a <= 0) continue;
          if (!l.sprite) l.sprite = leakSprite(l);
          const c = Math.cos(p.rot) * S, s = Math.sin(p.rot) * S;
          ctx.setTransform(c, s, -s, c, view.ox + p.x * S, view.oy + p.y * S);
          ctx.globalAlpha = Math.min(1, p.a * burst);
          ctx.drawImage(l.sprite, -l.len / 2, -l.thick / 2, l.len, l.thick);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Lens dust: fine specks on the glass, drifting slowly about ----------
  // Seen mostly toward the edges, as before, but each speck wanders on its way.
  class LensDust {
    constructor(n = 600, seed = 23) {
      const r = rng(seed);
      this.specks = Array.from({ length: n }, () => {
        const a = r() * TAU, v = 0.6 + r() * 2.4;
        return {
          x: r() * 2600, y: r() * 1480, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          size: 0.3 + Math.pow(r(), 4) * 1.2, a: 0.1 + r() * 0.35, ph: r() * TAU, wob: 4 + r() * 14,
        };
      });
    }

    build() {
      if (this.dot) return;
      const R = 8, c = canvas(R * 2, R * 2), g = c.getContext('2d'), rg = g.createRadialGradient(R, R, 0, R, R, R);
      rg.addColorStop(0, 'rgba(239,228,214,1)');
      rg.addColorStop(0.5, 'rgba(239,228,214,0.55)');
      rg.addColorStop(1, 'rgba(239,228,214,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, R * 2, R * 2);
      this.dot = c;
    }

    draw(ctx, view, t) {
      const W = 2600, H = 1480, px = Math.max(1.4, view.S * 2.8);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      for (const s of this.specks) {
        let x = s.x + s.vx * t + Math.sin(t / 17 + s.ph) * s.wob, y = s.y + s.vy * t + Math.cos(t / 23 + s.ph) * s.wob;
        x = ((x % W) + W) % W - 20;
        y = ((y % H) + H) % H - 20;
        const edge = smooth(0.4, 1.05, Math.cbrt(Math.abs(x / 1280 - 1) ** 3 + Math.abs(y / 720 - 1) ** 3));
        const a = s.a * (0.06 + 0.94 * edge) * 0.35 * (0.85 + 0.15 * Math.sin(t / 7 + s.ph * 3));
        if (a < 0.004) continue;
        const d = s.size * px * 3.2;
        ctx.globalAlpha = a;
        ctx.drawImage(this.dot, view.ox + x * view.S - d / 2, view.oy + y * view.S - d / 2, d, d);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
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

  return { Dust, Smoke, Light, LensDust, grain, grunge };
})();
