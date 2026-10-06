'use strict';
// Atmosphere over the whole frame: dust wandering through the air, lit by the
// centrepiece and by soft light shafts that pan slowly across the scene, very light
// smoke, pools of light, film light leaks sliding along the edges, a grungy textured
// border under the vignette, a soft bloom on everything bright, dust wandering on the
// lens and living film grain over everything; and the texture of a printed key visual,
// a mottled backdrop, patches of halftone screen and a worn print over it all.
const Atmos = (() => {
  const { TAU, canvas, rng, fbm2, pfbm2, smooth } = Kit;

  // ---------- Dust ----------
  // Motes wander slowly every way through still air, rising a little: each drifts its
  // own way and loops about on two slow swirls.
  class Dust {
    constructor(n = 140, seed = 5) {
      const r = rng(seed);
      this.motes = Array.from({ length: n }, () => ({
        x: r() * 2560, y: r() * 1540,
        depth: -0.6 + r() * 1.8,              // some behind the meter, some in front
        size: 0.7 + Math.pow(r(), 3) * 2.8,
        vx: (r() - 0.5) * 5, rise: 0.4 + r() * 2.6, // design px per second
        sway: 14 + r() * 34, phase: r() * TAU, rate: 0.02 + r() * 0.05,
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

    // `light` is the centrepiece in design px: motes near it catch the glow, and so do
    // motes drifting through a light shaft.
    draw(ctx, view, t, light) {
      const P = 42, W = 2660, H = 1540;
      ctx.globalCompositeOperation = 'screen';
      for (const m of this.motes) {
        let x = m.x + t * m.vx + Math.sin(t * m.rate + m.phase) * m.sway
          + Math.sin(t * m.rate * 0.43 + m.phase * 2.1) * m.sway * 0.8 - this.cam.x * P * m.depth;
        let y = m.y - t * m.rise + Math.cos(t * m.rate * 0.77 + m.phase * 1.3) * m.sway * 0.7 - this.cam.y * P * m.depth * 0.7;
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

  // Light shafts fall from a source beyond the frame into the clockwork, and fade well
  // before they reach the centrepiece. The source travels slowly along an arc above the
  // frame, from the right side over the top to beyond the upper left corner and back
  // (twelve minutes there and back), so the shafts and the pool of light they make
  // pan across the scene. Each shaft sways a little and comes and goes on its own.
  const ARC = { x: 1300, y: 700, rx: 2200, ry: 1693, mid: -1.35, amp: 1.1, period: 720 };
  const AIM = { x: 1700, y: 730 }, REACH = 3000;
  const BEAMS = [
    { a: -0.18, w: 110, i: 0.8 }, { a: -0.09, w: 70, i: 1 }, { a: 0, w: 150, i: 0.6 },
    { a: 0.09, w: 60, i: 0.9 }, { a: 0.18, w: 120, i: 0.55 },
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

  // Leak colours, at the edge and at the fringe: mostly warm, now and then magenta.
  const LEAKS = [
    { w: 0.35, stops: ['255,150,70', '220,70,40'] },   // orange
    { w: 0.25, stops: ['245,95,95', '170,30,80'] },    // red
    { w: 0.25, stops: ['250,185,80', '205,100,35'] },  // amber
    { w: 0.15, stops: ['225,100,185', '120,40,150'] }, // magenta
  ];
  const EDGES = ['top', 'right', 'bottom', 'left'];

  // A leak's light: a long band of glow, even along most of its length with long soft
  // ends, falling off either side of its middle line, which lies outside the frame. So
  // inside the frame it is brightest right at the edge, the same all along, and only
  // fades inward, turning from its edge colour toward its fringe colour as it goes.
  function leakSprite(l) {
    const w = 256, h = 64, c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
    const [mid, rim] = l.pal.stops.map(s => s.split(',').map(Number));
    for (let y = 0; y < h; y++) {
      const v = Math.abs((y + 0.5) / h * 2 - 1), across = Math.exp(-((v / 0.55) ** 2)) * (1 - smooth(0.8, 1, v));
      const t = smooth(0, 0.9, v);
      for (let x = 0; x < w; x++) {
        const u = Math.abs((x + 0.5) / w * 2 - 1), i = (y * w + x) * 4;
        for (let ch = 0; ch < 3; ch++) img.data[i + ch] = mid[ch] + (rim[ch] - mid[ch]) * t;
        img.data[i + 3] = 255 * across * (1 - smooth(0.45, 1, u));
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  class Light {
    // `random` drives the leaks and where the light source starts (seed it for
    // repeatable stills).
    constructor(random = Math.random) {
      this.random = random;
      this.flareAt = -1e9;
      this.cam = { x: 0, y: 0 };
      this.leaks = [];
      this.next = null;
      this.lastEdge = null;
      this.arcPh = random() * TAU;
      this.at = null; // the shafts as last worked out, and when
    }

    build(view) {
      const k = 1 / 8, w = Math.ceil(view.W * k), h = Math.ceil(view.H * k), S = view.S * k;
      const X = x => (view.ox + x * view.S) * k, Y = y => (view.oy + y * view.S) * k;
      // Hot spots: light pooling on the clockwork. The main pool follows the shafts
      // (see pool()); these two stay put.
      this.hot = canvas(w, h);
      const g = this.hot.getContext('2d');
      g.globalCompositeOperation = 'lighter';
      glowSpot(g, X(1720), Y(1130), 420 * S, 300 * S, '150,205,215', 0.32);
      glowSpot(g, X(2330), Y(860), 280 * S, 240 * S, '255,176,120', 0.24);
      // Fainter ones on the left, beside the centrepiece: warm up high, cool down low.
      glowSpot(g, X(240), Y(250), 460 * S, 360 * S, '255,176,120', 0.3);
      glowSpot(g, X(120), Y(1250), 380 * S, 320 * S, '150,205,215', 0.24);
      if (!this.spot) {
        this.spot = canvas(64, 64);
        glowSpot(this.spot.getContext('2d'), 32, 32, 32, 32, '255,196,140', 0.55);
      }
      if (!this.shaft) this.shaft = shaftSprite();
    }

    // Where the light comes from at time t (design px), somewhere along its arc.
    sun(t) {
      const th = ARC.mid + ARC.amp * Math.sin(TAU * t / ARC.period + this.arcPh);
      return { x: ARC.x + ARC.rx * Math.cos(th), y: ARC.y + ARC.ry * Math.sin(th) };
    }

    // The pool of light the shafts make on the clockwork, kept off the centrepiece.
    pool(t) {
      const s = this.sun(t);
      return { x: Math.max(1250, s.x + (AIM.x - s.x) * 0.74), y: s.y + (AIM.y - s.y) * 0.74 };
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
      const from = 0.05 + r() * 0.9, travel = (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.4), life = 70 + r() * 50;
      this.lastEdge = edge;
      this.leaks.push({
        edge, pal,
        born: t - at * life, life, fadeIn, fadeOut: 14 + r() * 8,
        from, to: from + travel, len: 1700 + r() * 900, thick: 900 + r() * 400, out: 0.15 + r() * 0.05,
        peak: 0.17 + r() * 0.07, ph: r() * TAU,
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

    // Where the light comes from and each shaft's angle and strength at time t. Asked
    // for many times a frame (by every mote of dust), so worked out once per frame.
    beams(t) {
      if (this.at && this.at.t === t) return this.at;
      const s = this.sun(t), base = Math.atan2(AIM.y - s.y, AIM.x - s.x);
      this.at = {
        t, sun: s,
        list: BEAMS.map((b, i) => ({
          a: base + b.a + 0.015 * Math.sin(t / (41 + 5 * i) + i * 1.7),
          w: b.w,
          i: b.i * (0.55 + 0.45 * Math.sin(t / (29 + 7 * i) + i * 2.3)),
        })),
      };
      return this.at;
    }

    // How strongly the shafts light the point (x, y), 0 to about 1: dust drifting
    // through them catches the light.
    beamAt(x, y, t) {
      const { sun, list } = this.beams(t);
      const dx = x - sun.x, dy = y - sun.y, d = Math.hypot(dx, dy), u = d / REACH;
      if (u <= 0 || u >= 1) return 0;
      const ang = Math.atan2(dy, dx);
      let v = 0;
      for (const b of list) {
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
        const p = this.pool(t), rx = 560 * S, ry = 470 * S;
        ctx.drawImage(this.spot, view.ox + p.x * S - rx + dx, view.oy + p.y * S - ry + dy, rx * 2, ry * 2);
      } else if (pass === 'rays') {
        const { sun, list } = this.beams(t);
        const ox = view.ox + (sun.x - this.cam.x * 42 * 0.5) * S, oy = view.oy + (sun.y - this.cam.y * 42 * 0.35) * S;
        for (const b of list) {
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
  // Seen mostly toward the edges, each speck meandering on its way; a few larger, soft
  // ones float out of focus.
  class LensDust {
    constructor(n = 600, seed = 23) {
      const r = rng(seed);
      this.specks = Array.from({ length: n }, (_, i) => {
        const a = r() * TAU, v = 0.8 + r() * 2.6, big = i < 14;
        return {
          x: r() * 2600, y: r() * 1480, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          size: big ? 3 + r() * 4 : 0.3 + Math.pow(r(), 4) * 1.2, a: big ? 0.05 + r() * 0.06 : 0.1 + r() * 0.35,
          ph: r() * TAU, wob: 14 + r() * 40, rate: 1 / (14 + r() * 20),
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
        let x = s.x + s.vx * t + Math.sin(t * s.rate + s.ph) * s.wob + Math.sin(t * s.rate * 0.53 + s.ph * 1.7) * s.wob * 0.6;
        let y = s.y + s.vy * t + Math.cos(t * s.rate * 0.81 + s.ph) * s.wob + Math.cos(t * s.rate * 0.37 + s.ph * 2.3) * s.wob * 0.5;
        x = ((x % W) + W) % W - 20;
        y = ((y % H) + H) % H - 20;
        const edge = smooth(0.4, 1.05, Math.cbrt(Math.abs(x / 1280 - 1) ** 3 + Math.abs(y / 720 - 1) ** 3));
        const a = s.a * (0.12 + 0.88 * edge) * 0.45 * (0.85 + 0.15 * Math.sin(t / 7 + s.ph * 3));
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
  // Living film grain: a new grain every frame, so it never sits on the screen like dust.
  // A tile of noise is laid at a fresh offset each frame, at half resolution so each
  // grain covers about two pixels, and shaded by where grain shows (the edges and around
  // the glow). Drawn with `difference`: on the dark border it lifts into speckle, on the
  // bright glow it breaks it up a little.
  const AMP = 32, PEAK = 0.6, TILE = 512;
  class Grain {
    constructor(seed = 61) { this.r = rng(seed); }

    // `hot` is where grain thickens around the glow (design px: centre and radii).
    build(view, hot) {
      if (!this.tile) {
        const c = canvas(TILE, TILE), g = c.getContext('2d'), img = g.createImageData(TILE, TILE), d = img.data;
        let s = 0x9e3779b9;
        for (let i = 0; i < d.length; i += 4) {
          s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
          const n = (s >>> 0) / 4294967296, v = n * n * PEAK * AMP;
          d[i] = v; d[i + 1] = v * 0.95; d[i + 2] = v * 0.88; d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        this.tile = c;
      }
      // Where grain shows, at an eighth of the resolution (it varies slowly).
      const k = 1 / 8, w = Math.max(1, Math.ceil(view.W * k)), h = Math.max(1, Math.ceil(view.H * k));
      const m = canvas(w, h), mg = m.getContext('2d'), img = mg.createImageData(w, h), d = img.data;
      const S = view.S * k, hx = view.ox * k + hot.x * S, hy = view.oy * k + hot.y * S;
      for (let y = 0, i = 0; y < h; y++) {
        const ey = Math.abs(y / h * 2 - 1) ** 3, gy = Math.exp(-(((y - hy) / (hot.ry * S)) ** 2));
        for (let x = 0; x < w; x++, i += 4) {
          const edge = smooth(0.55, 1.05, Math.cbrt(Math.abs(x / w * 2 - 1) ** 3 + ey));
          const gx = Math.exp(-(((x - hx) / (hot.rx * S)) ** 2));
          d[i + 3] = 255 * Math.min(1, (0.02 + 0.28 * edge + 0.3 * gx * gy) / PEAK);
        }
      }
      mg.putImageData(img, 0, 0);
      this.mask = m;
      this.work = canvas(Math.ceil(view.W / 2), Math.ceil(view.H / 2));
      this.pat = null;
    }

    draw(ctx, view) {
      const g = this.work.getContext('2d'), w = this.work.width, h = this.work.height;
      if (!this.pat) this.pat = g.createPattern(this.tile, 'repeat');
      const ox = Math.floor(this.r() * TILE), oy = Math.floor(this.r() * TILE);
      g.globalCompositeOperation = 'copy';
      g.setTransform(1, 0, 0, 1, -ox, -oy);
      g.fillStyle = this.pat;
      g.fillRect(ox, oy, w, h);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(this.mask, 0, 0, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = 1;
      ctx.drawImage(this.work, 0, 0, view.W, view.H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------- Bloom: everything bright glows a little, as through a real lens ----------
  // The frame so far is shrunk to an eighth, its darker part is pushed to black so
  // only what is bright is left, and that is blurred (once narrow, once wide) and laid
  // back over the frame with `screen`.
  const BLOOM = { contrast: 2.2, narrow: 3, wide: 10, a: 0.32 };
  class Bloom {
    build(view) {
      const w = Math.max(1, Math.ceil(view.W / 8)), h = Math.max(1, Math.ceil(view.H / 8));
      this.small = canvas(w, h);
      this.soft = canvas(w, h);
    }

    draw(ctx, src, view) {
      const w = this.small.width, h = this.small.height, s = this.small.getContext('2d'), b = this.soft.getContext('2d');
      s.globalCompositeOperation = 'copy';
      s.imageSmoothingQuality = 'high';
      s.drawImage(src, 0, 0, w, h);
      // Blur sizes follow the design scale, so the halo looks the same at any resolution.
      const S = view.S;
      b.globalCompositeOperation = 'copy';
      b.filter = `contrast(${BLOOM.contrast}) blur(${(BLOOM.narrow * S).toFixed(2)}px)`;
      b.drawImage(this.small, 0, 0);
      b.globalCompositeOperation = 'lighter';
      b.globalAlpha = 0.7;
      b.filter = `contrast(${BLOOM.contrast}) blur(${(BLOOM.wide * S).toFixed(2)}px)`;
      b.drawImage(this.small, 0, 0);
      b.filter = 'none';
      b.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = BLOOM.a;
      ctx.drawImage(this.soft, 0, 0, view.W, view.H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
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
        img.data[i + 3] = 255 * Math.min(1, mask * (0.2 + 0.8 * blot) * (0.75 + 0.5 * fine) * 0.75);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------- Backdrop: the dark behind everything, mottled like a sprayed wall ----------
  // An even tone with soft clouds in it and darker spots with ragged edges, as in the key
  // art the wallpaper follows. Two tileable textures at an eighth of the resolution, each
  // wider than the frame, slide slowly past each other, multiplied together, so the spots
  // keep changing shape. It eases off a little toward the centrepiece, which keeps the eye
  // there.
  function mottle(n, seed) {
    const c = canvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n), P = 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n * P, v = y / n * P;
        const wx = pfbm2(u, v, P, seed, 3), wy = pfbm2(u + 5.2, v + 1.3, P, seed + 3, 3);
        const cloud = pfbm2(u + wx * 1.4, v + wy * 1.4, P, seed + 7, 4);
        const spot = smooth(0.57, 0.63, pfbm2(u * 2 + wy * 2, v * 2 + wx * 2, P * 2, seed + 11, 4));
        const val = Math.max(0.05, Math.min(1, 0.75 + 1.1 * (cloud - 0.5))) * (1 - 0.8 * spot);
        const i = (y * n + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * val;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  class Backdrop {
    constructor(seed = 23) { this.seed = seed; this.cam = { x: 0, y: 0 }; }
    // `focus`: the centrepiece's pool of negative space (design px: centre and radii).
    build(view, focus) {
      const k = this.k = 1 / 8, w = Math.ceil(view.W * k), h = Math.ceil(view.H * k);
      this.layer = canvas(w, h);
      if (!this.tiles) this.tiles = [mottle(192, this.seed), mottle(192, this.seed + 1)];
      // How much of it to take away around the centrepiece: some, not all.
      this.calm = canvas(w, h);
      const g = this.calm.getContext('2d'), cx = (view.ox + focus.x * view.S) * k, cy = (view.oy + focus.y * view.S) * k;
      g.setTransform(1, 0, 0, focus.ry / focus.rx, cx, cy);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, focus.rx * 0.75 * view.S * k);
      rg.addColorStop(0, 'rgba(0,0,0,0.45)');
      rg.addColorStop(0.5, 'rgba(0,0,0,0.3)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(-w * 2, -h * 4, w * 4, h * 8);
    }
    // `a`: how strongly it lifts the dark.
    draw(ctx, view, t, a) {
      const g = this.layer.getContext('2d'), w = this.layer.width, h = this.layer.height, s = view.S * this.k;
      // Each texture: how big a tile is and how fast it slides (design px), and how much it
      // drifts with the cursor.
      [[2800, 2.4, -1.1, 0.7], [2000, -1.7, 0.8, 0.9]].forEach(([size, vx, vy, par], i) => {
        const tile = this.tiles[i], pat = g.createPattern(tile, 'repeat');
        pat.setTransform(new DOMMatrix()
          .translate((t * vx + this.cam.x * 42 * par) * s, (t * vy + this.cam.y * 42 * par * 0.7) * s)
          .scale(size * s / tile.width));
        g.globalCompositeOperation = i ? 'multiply' : 'copy';
        g.fillStyle = pat;
        g.fillRect(0, 0, w, h);
      });
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = 'rgb(255,214,188)';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(this.calm, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = a;
      ctx.drawImage(this.layer, 0, 0, view.W, view.H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Print: the texture of a worn, printed key visual, over everything ----------
  // Like the paper and wear of a printed poster: broad blotches where the ink lies heavier
  // or is rubbed thin, softer darker patches and a few fine scratches. Baked once and
  // large, so it reads as a surface rather than detail; it stays put, like paper.

  // The wear, as a soft-light layer: mid grey changes nothing, darker darkens, lighter
  // lightens. It leans dark, so it adds texture without lifting the blacks.
  function wearTile(n, seed) {
    const c = canvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n), P = 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const u = x / n * P, v = y / n * P;
        const wx = pfbm2(u, v, P, seed, 3), wy = pfbm2(u + 3.7, v + 8.1, P, seed + 5, 3);
        const broad = pfbm2(u, v, P, seed + 9, 3) - 0.5;
        const patch = smooth(0.56, 0.64, pfbm2(u * 2 + wx * 2.5, v * 2 + wy * 2.5, P * 2, seed + 13, 3));
        const rub = smooth(0.6, 0.7, pfbm2(u * 2 + wy * 2, v * 2 + wx * 2, P * 2, seed + 17, 3));
        const i = (y * n + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 124 + 56 * broad - 44 * patch + 24 * rub;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  class Print {
    constructor(seed = 47) { this.seed = seed; }

    build(view) {
      const k = 0.5, W = Math.ceil(view.W * k), H = Math.ceil(view.H * k), s = view.S * k, r = rng(this.seed);
      const X = x => (view.ox * k) + x * s, Y = y => (view.oy * k) + y * s;
      if (!this.tile) this.tile = wearTile(384, this.seed);
      this.wear = canvas(W, H);
      const g = this.wear.getContext('2d'), pat = g.createPattern(this.tile, 'repeat');
      pat.setTransform(new DOMMatrix().scale(2200 * s / this.tile.width));
      g.fillStyle = pat;
      g.fillRect(0, 0, W, H);
      // A few long, fine scratches.
      this.scratches = canvas(W, H);
      const f = this.scratches.getContext('2d');
      f.strokeStyle = 'rgb(236,228,216)';
      f.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const x0 = r() * 2560, y0 = r() * 1440, a = r() * TAU, len = 160 + r() * 360, bend = (r() - 0.5) * len * 0.3;
        const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
        f.globalAlpha = 0.12 + r() * 0.2;
        f.lineWidth = Math.max(0.5, (0.5 + r() * 0.6) * s);
        f.beginPath();
        f.moveTo(X(x0), Y(y0));
        f.quadraticCurveTo(X((x0 + x1) / 2 - Math.sin(a) * bend), Y((y0 + y1) / 2 + Math.cos(a) * bend), X(x1), Y(y1));
        f.stroke();
      }
      f.globalAlpha = 1;
    }

    // `wear` and `scratches`: how strong each is.
    draw(ctx, view, { wear, scratches }) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = wear;
      ctx.drawImage(this.wear, 0, 0, view.W, view.H);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = scratches;
      ctx.drawImage(this.scratches, 0, 0, view.W, view.H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Tone: patches of a halftone screen ----------
  // A 45-degree grid of dots laid in a few soft patches, like screentone cut and laid on a
  // printed key visual: the dots are largest in the middle of a patch and shrink to nothing
  // toward its ragged edge. Baked once over the patches' bounds.
  class Tone {
    // `cell`: how far apart the dots are (design px); `color` and `blend`: how they lay
    // over; `res`: the bake's px per screen px.
    constructor({ cell, color, blend, res = 0.5, seed = 61 }) {
      Object.assign(this, { cell, color, blend, res, seed });
    }

    // `patches`: [{ x, y, rx, ry, a }] in design px, `a` how far toward solid the middle
    // of each gets.
    build(view, patches) {
      const { cell } = this, s = view.S * this.res, pad = cell * 2;
      const x0 = Math.min(...patches.map(p => p.x - p.rx)) - pad, x1 = Math.max(...patches.map(p => p.x + p.rx)) + pad;
      const y0 = Math.min(...patches.map(p => p.y - p.ry)) - pad, y1 = Math.max(...patches.map(p => p.y + p.ry)) + pad;
      this.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      this.layer = canvas(Math.ceil(this.box.w * s), Math.ceil(this.box.h * s));
      const g = this.layer.getContext('2d'), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      g.fillStyle = this.color;
      const reach = Math.hypot(this.box.w, this.box.h) / 2 / cell + 2, c = Math.SQRT1_2;
      for (let j = -reach; j <= reach; j++) {
        for (let i = -reach; i <= reach; i++) {
          const x = cx + (i - j) * c * cell, y = cy + (i + j) * c * cell;
          if (x < x0 || x > x1 || y < y0 || y > y1) continue;
          // How dark the screen is here: full in the middle of a patch, fading out, the
          // edge torn by noise.
          const ragged = (fbm2(x / 240 + 3.1, y / 240 + 7.7, this.seed, 3) - 0.5) * 0.55;
          let tone = 0;
          for (const p of patches) tone = Math.max(tone, p.a * (1 - smooth(0, 1, Math.hypot((x - p.x) / p.rx, (y - p.y) / p.ry) + ragged)));
          const rad = cell * 0.5 * Math.pow(tone, 0.75) * s;
          if (rad < 0.25) continue;
          g.beginPath();
          g.arc((x - x0) * s, (y - y0) * s, rad, 0, TAU);
          g.fill();
        }
      }
    }

    // `a`: how strongly it shows; `off`: where it has moved to (design px).
    draw(ctx, view, a, off = { x: 0, y: 0 }) {
      const b = this.box;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = this.blend;
      ctx.globalAlpha = a;
      ctx.drawImage(this.layer, view.ox + (b.x + off.x) * view.S, view.oy + (b.y + off.y) * view.S, b.w * view.S, b.h * view.S);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  return { Dust, Smoke, Light, LensDust, Grain, Bloom, Backdrop, Tone, Print, grunge };
})();
