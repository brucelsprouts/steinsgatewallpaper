'use strict';
// Living ink. Every few seconds a new element of colour forms on its own: an ink
// blot spreading out from the drops that start it, a patch of grungy texture like a
// photo laid over in overlay mode, a splash and the drops it threw, or now and then a
// dry-brush stroke. It never settles: it keeps spreading and thinning, floats as if
// it lay on water (drifting, turning a little, growing), its pigment keeps flowing,
// and then it dissolves while others form. Each element is painted once, a few steps
// per frame; a frame only masks that painting with a small field of arrival times
// (when the spreading ink reaches each cell) and moves it.
const Ink = (() => {
  const { TAU, canvas, rng, hash, fbm2, pnoise2, pfbm2, smooth } = Kit;
  const { deform, polyPath, circlePts, gauss } = Paint;

  // Where elements may form (design px): around the meter and inside the vignette.
  // Three sit in front of the clockwork; the rest are far behind it. Overlay shows most
  // where something is lit, so zones over the clockwork are picked more often (\`w\`).
  const ZONES = [
    { x: 2000, y: 330, R: [380, 500], depth: -0.95, w: 1 },     // upper right, behind the astrolabe
    { x: 2150, y: 1150, R: [320, 420], depth: -0.9, w: 1 },     // lower right
    { x: 700, y: 170, R: [300, 400], depth: -0.95, w: 0.7 },    // above the meter
    { x: 1300, y: 1250, R: [280, 360], depth: -0.85, w: 0.8 },  // bottom centre
    { x: 560, y: 1240, R: [240, 320], depth: -0.8, w: 0.6 },    // below the meter
    { x: 1640, y: 640, R: [260, 340], depth: -0.7, w: 1 },      // in the astrolabe
    { x: 1180, y: 360, R: [220, 300], depth: -0.8, w: 0.9 },    // between the meter and the astrolabe
    { x: 160, y: 520, R: [220, 300], depth: -0.9, w: 0.5 },     // far left
    { x: 360, y: 930, R: [200, 280], depth: -0.85, w: 0.5 },    // left, under the meter
    { x: 1500, y: 170, R: [220, 300], depth: 0.45, w: 1 },      // top centre, over the clockwork
    { x: 2300, y: 720, R: [260, 340], depth: 0.5, w: 1 },       // right, over the clockwork
    { x: 1820, y: 1300, R: [240, 320], depth: 0.4, w: 1 },      // bottom right, over the clockwork
  ];
  // Light, pastel inks: on near-black they read as luminous paint rather than mud.
  const INKS = {
    teal: '110,196,200', crimson: '222,92,112', violet: '168,128,214',
    rose: '236,158,176', amber: '232,176,104', blue: '112,146,228',
  };
  const HUES = Object.keys(INKS);
  // Light inks (amber, rose, teal) are drawn a little weaker than dark ones (crimson),
  // so no colour jumps out more than another.
  const LEVEL = {};
  for (const h of HUES) {
    const [r, g, b] = INKS[h].split(',').map(v => v / 255);
    LEVEL[h] = 0.55 / (0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  // Neighbouring colours that bleed into each other while wet.
  const BLEED = {
    teal: ['blue', 'violet'], crimson: ['rose', 'violet'], violet: ['blue', 'crimson'],
    rose: ['amber', 'crimson'], amber: ['rose', 'crimson'], blue: ['teal', 'violet'],
  };

  // Kinds of element: how often each appears, its size against its zone, seconds to
  // form, how much further it spreads after forming (in field time), how much it grows
  // as it floats and how strongly it is drawn. Blots and grit take their outline from
  // the spreading field and dry with a rim; splashes and strokes take theirs from their
  // painting, so they only grow.
  const KINDS = {
    blot: { weight: 0.42, size: [0.45, 0.7], form: [8, 13], spread: [0.35, 0.5], grow: [0.04, 0.08], alpha: [0.38, 0.5], field: true },
    grit: { weight: 0.22, size: [0.45, 0.65], form: [6, 10], spread: [0.25, 0.4], grow: [0.05, 0.09], alpha: [0.28, 0.38], field: true },
    splash: { weight: 0.2, size: [0.5, 0.65], form: [1.2, 2], spread: [0, 0], grow: [0.08, 0.14], alpha: [0.3, 0.4] },
    stroke: { weight: 0.16, size: [0.9, 1], form: [4, 6], spread: [0, 0], grow: [0.05, 0.1], alpha: [0.26, 0.34] },
  };

  const MAX = 6;           // elements at once, not counting ones dissolving (a shift may add one)
  const MIN = 4;           // fewer than this and a new one comes within seconds
  const GAP = [10, 24];    // seconds between new elements
  const REST = [50, 110];  // seconds an element lives on, spreading and floating, before it dissolves
  const FADE = [25, 40];   // seconds it takes to dissolve
  const DRIFT = [0.35, 0.8];        // how fast it floats, design px per second
  const SPIN = [0.0003, 0.0008];    // how fast it turns, radians per second
  const NEAR = 700;        // design px: the same colour never forms closer than this to itself
  const PREP = 0.4;        // seconds to paint an element before it starts to form
  const DRY = 6;           // seconds for the wet sheen to go
  const RES = 0.5;         // sprite resolution relative to the screen
  const STEPS = 2;         // painting steps per frame
  const FRONT = 0.05;      // softness of the spreading edge, in field time
  const EDGE = 0.07;       // softness of the edge once it has dried
  const TINT = 0.3;        // how strongly an element stains the linework under it
  const SHIMMER = 0.4;     // how much the pigment keeps flowing once formed
  const GAIN = 0.62;       // overall strength of the ink (the preview can change it)
  // Overlay only shows where something is lit, so in that style the ink goes on thick
  // over the clockwork and the glow, and only a thin wash of it stays over the dark.
  const OVERLAY = { over: 2.5, wash: 0.45 };

  // ---------- Textures shared by every element ----------

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

  // Paper tooth: speckle clustered by the grain of the paper.
  let toothTile = null;
  function tooth() {
    if (toothTile) return toothTile;
    const n = 256, c = canvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n), r = rng(404);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = 0.5 * pnoise2(x / 8, y / 8, 32, 7) + 0.5 * r();
        img.data[(y * n + x) * 4 + 3] = smooth(0.5, 0.95, v) * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return (toothTile = c);
  }

  // Shimmer: tileable noise, sampled drifting, that keeps formed pigment moving.
  const SH = 64, SH_CELL = 24; // tile size in samples; design px per sample
  let shimmerTile = null;
  function shimmer(x, y) {
    if (!shimmerTile) {
      shimmerTile = new Float32Array(SH * SH);
      for (let j = 0; j < SH; j++) {
        for (let i = 0; i < SH; i++) shimmerTile[j * SH + i] = smooth(0.25, 0.75, pfbm2(i / 16, j / 16, 4, 12, 3));
      }
    }
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const x0 = ((ix % SH) + SH) % SH, y0 = ((iy % SH) + SH) % SH, x1 = (x0 + 1) % SH, y1 = (y0 + 1) % SH;
    const a = shimmerTile[y0 * SH + x0], b = shimmerTile[y0 * SH + x1], c = shimmerTile[y1 * SH + x0], d = shimmerTile[y1 * SH + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // ---------- Painting helpers ----------

  const blob = (cx, cy, rad, r) => deform(circlePts(8, rad, r, [0.6, 1.8]), 3, 0.3, r).map(([x, y, v]) => [x + cx, y + cy, v]);

  // A canvas the size of the sprite, in the same design-unit frame.
  function layer(geo, k) {
    const { x0, y0, x1, y1 } = geo.box, c = canvas((x1 - x0) * k, (y1 - y0) * k), g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    return [c, g];
  }

  // Wet-in-wet: a neighbouring colour creeps into part of the element around (cx, cy).
  function bleed(g, b, geo, k, [cx, cy]) {
    const r = geo.r, [c, cg] = layer(geo, k), rad = b.R * (0.35 + r() * 0.3);
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
  function granulate(g, r, strength = 0.5) {
    const c = g.canvas;
    g.save();
    g.setTransform(1, 0, 0, 1, -r() * 256, -r() * 256);
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = strength;
    g.fillStyle = g.createPattern(tooth(), 'repeat');
    g.fillRect(0, 0, c.width + 256, c.height + 256);
    g.restore();
  }

  // ---------- Blot and grit: outline from the spreading field ----------

  // A box big enough for the blot to keep spreading into whichever way it runs, the drops
  // that start it, and how the ink runs: along an axis, in fingers, sometimes downhill.
  function blotPlan(b, r) {
    const asp = 1 + r() * 1.1, ang = r() * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang);
    const A = b.R * 2.1 * Math.sqrt(asp), B = b.R * 2.1 / Math.sqrt(asp);
    const hx = Math.hypot(A * ca, B * sa), hy = Math.hypot(A * sa, B * ca);
    const drops = [];
    for (let d = 0; d < b.drops; d++) {
      const a = r() * TAU, dist = d ? b.R * (0.3 + r() * 0.4) : b.R * 0.1 * r();
      drops.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist, delay: d ? 0.15 + r() * 0.35 : 0 });
    }
    return {
      r, drops, area: Math.PI * b.R * b.R,
      box: { x0: -hx, y0: -hy, x1: hx, y1: hy },
      run: { angle: ang, flow: asp, scale: b.R * (0.12 + r() * 0.22), finger: 2 + r() * 1.5, fall: r() < 0.35 ? 0.3 + r() * 0.5 : 0, outside: 1 },
    };
  }

  // Fibres: ink run out along the paper, wandering away from each drop.
  function fibres(g, b, geo, col) {
    const r = geo.r;
    g.save();
    g.strokeStyle = `rgb(${col})`;
    g.lineCap = 'round';
    for (const d of geo.drops) {
      for (let i = 0, n = 26 + Math.floor(r() * 30); i < n; i++) {
        let a = r() * TAU, x = d.x, y = d.y;
        const step = b.R * (0.4 + r() * 0.9) / 14;
        g.globalAlpha = 0.05 + r() * 0.06;
        g.lineWidth = 0.6 + r() * 1.6;
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 14; s++) { a += gauss(r) * 0.18; x += Math.cos(a) * step; y += Math.sin(a) * step; g.lineTo(x, y); }
        g.stroke();
      }
    }
    g.restore();
  }

  // An ink blot: an even wash over the whole box, thinned in broad blotches, densest
  // where the drops landed and run out along the paper. The field decides how much
  // of it shows, so the outline is whatever shape the spreading ink takes.
  function* paintBlot(g, b, geo, k) {
    const { r, box } = geo, col = INKS[b.color], W = box.x1 - box.x0, H = box.y1 - box.y0;
    g.fillStyle = `rgba(${col},0.75)`;
    g.fillRect(box.x0, box.y0, W, H);
    for (let i = 0; i < 4; i++) knock(g, box, r, 0.25 + r() * 0.2);
    yield;
    for (const d of geo.drops) {
      const rg = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, b.R * (0.5 + r() * 0.4));
      rg.addColorStop(0, `rgba(${col},0.5)`);
      rg.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = rg;
      g.fillRect(box.x0, box.y0, W, H);
    }
    fibres(g, b, geo, col);
    for (let i = 0, n = 2 + Math.floor(r() * 4); i < n; i++) {
      const d = geo.drops[Math.floor(r() * geo.drops.length)], a = r() * TAU, dist = b.R * r() * 0.7;
      const base = blob(d.x + Math.cos(a) * dist, d.y + Math.sin(a) * dist, b.R * (0.06 + r() * 0.12), r);
      g.fillStyle = `rgba(${col},${(0.05 + r() * 0.04).toFixed(3)})`;
      for (let L = 0; L < 7; L++) g.fill(polyPath(deform(base, 2, 0.25, r)));
    }
    knock(g, box, r, 0.2);
    yield;
    bleed(g, b, geo, k, [geo.drops[0].x + gauss(r) * b.R * 0.3, geo.drops[0].y + gauss(r) * b.R * 0.3]);
    granulate(g, r);
  }

  // Grit: eroded, stained texture like an overlay photograph of old plaster or rusted
  // metal, in the ink's colour: crisp-edged stains, a network of fine cracks and pits.
  // Its structure is worked out at a little under the sprite's resolution and
  // sharpened with grime and the paper's tooth.
  function* paintGrit(g, b, geo) {
    const { r, box } = geo, col = INKS[b.color], W = box.x1 - box.x0, H = box.y1 - box.y0;
    const w = Math.ceil(280 * Math.min(1, W / H)), h = Math.ceil(280 * Math.min(1, H / W));
    const c = canvas(w, h), cg = c.getContext('2d'), img = cg.createImageData(w, h), d = img.data;
    const [cr, cgr, cb] = col.split(',').map(Number);
    const s = Math.floor(r() * 1000), sc = 3 + r() * 3, lo = 0.4 + r() * 0.08, warp = 1.2 + r() * 0.8;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w * sc * Math.max(1, W / H), v = y / h * sc * Math.max(1, H / W);
        const wx = fbm2(u + 3.1, v, s, 3), wy = fbm2(u, v + 7.7, s + 5, 3);
        const stain = smooth(lo, lo + 0.14, fbm2(u + wx * warp, v + wy * warp, s + 11, 4));
        const ridge = 1 - Math.abs(2 * fbm2(u * 2.2 + wx, v * 2.2 + wy, s + 31, 3) - 1);
        const crack = Math.pow(smooth(0.84, 0.97, ridge), 1.5);
        let a = stain * (0.4 + 0.6 * fbm2(u * 7, v * 7, s + 23, 2)) + crack * 0.35 * (1 - stain * 0.5);
        if (hash(x * 7919 + y * 104729, s) < 0.12 * smooth(0.5, 0.7, fbm2(u * 4, v * 4, s + 41, 2))) a *= 0.25; // pits, in clusters
        const i = (y * w + x) * 4;
        d[i] = cr; d[i + 1] = cgr; d[i + 2] = cb;
        d[i + 3] = Math.min(1, a) * 255;
      }
      if (y % 30 === 29) yield;
    }
    cg.putImageData(img, 0, 0);
    g.save();
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, box.x0, box.y0, W, H);
    g.restore();
    // Grime: specks of every size, mostly tiny.
    g.fillStyle = `rgba(${col},0.7)`;
    for (let i = 0; i < 260; i++) {
      g.beginPath();
      g.arc(box.x0 + r() * W, box.y0 + r() * H, 0.6 + Math.pow(r(), 3) * 3.5, 0, TAU);
      g.fill();
    }
    granulate(g, r, 0.6);
  }

  // ---------- Splash: a blot and the drops it threw ----------

  function splashPlan(b, r) {
    const core = b.R * 0.45, dir = r() * TAU, spread = 0.7 + r() * 1.6;
    const blot = deform(circlePts(12, core, r, [0.5, 1.4]), 3, 0.2, r);
    const spray = [];
    for (let i = 0, n = 24 + Math.floor(r() * 36); i < n; i++) {
      const a = dir + gauss(r) * spread, f = Math.pow(r(), 1.5), dist = core * (1.1 + f * 2.3);
      spray.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist, rad: Math.max(1.4, core * 0.17 * Math.pow(r(), 2) * (1.2 - f * 0.7)) });
    }
    let ext = core * 1.35;
    for (const d of spray) ext = Math.max(ext, Math.hypot(d.x, d.y) + d.rad * 2);
    const m = b.R * 0.06;
    return {
      r, blot, spray, drops: [{ x: 0, y: 0, delay: 0 }],
      box: { x0: -ext - m, y0: -ext - m, x1: ext + m, y1: ext + m },
      run: { angle: dir, flow: 1, scale: b.R * 0.3, finger: 0.5, fall: 0, outside: 1 },
    };
  }

  function* paintSplash(g, b, geo, k) {
    const { r, box } = geo, col = INKS[b.color];
    // Where it landed: translucent layers of one outline.
    for (let L = 0; L < 24; L++) {
      g.fillStyle = `rgba(${col},0.07)`;
      g.fill(polyPath(deform(geo.blot, 2, 0.12, r)));
      if (L % 8 === 7) { knock(g, box, r, 0.22); yield; }
    }
    // The drops it threw: round, a little irregular.
    for (const d of geo.spray) {
      g.fillStyle = `rgba(${col},${(0.4 + r() * 0.45).toFixed(3)})`;
      g.fill(polyPath(deform(circlePts(8, d.rad, r, [0.3, 0.9]), 2, 0.1, r).map(([x, y, v]) => [x + d.x, y + d.y, v])));
    }
    // Mist: the finest spray, mostly between the blot and the drops.
    for (let i = 0; i < 180; i++) {
      const s = geo.spray[Math.floor(r() * geo.spray.length)], f = 0.3 + r() * 0.9;
      g.fillStyle = `rgba(${col},${(0.25 + r() * 0.4).toFixed(3)})`;
      g.beginPath();
      g.arc(s.x * f + gauss(r) * b.R * 0.08, s.y * f + gauss(r) * b.R * 0.08, 0.5 + r() * 1.3, 0, TAU);
      g.fill();
    }
    yield;
    bleed(g, b, geo, k, [gauss(r) * b.R * 0.15, gauss(r) * b.R * 0.15]);
    dry(g, b, k, 0.7);
    granulate(g, r);
  }

  // ---------- Stroke: a swept dry-brush wash ----------

  // Blunt and full where the brush landed, bending as it travels and thinning as the
  // brush runs dry. One side bled into wet paper, the other dried crisp. The drops
  // that start it run along it, faster along than across.
  const SAMPLES = 20;
  function strokePlan(b, r) {
    const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
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
    const lobes = [{ pts: deform(outline, 2, 0.1, r), w: 1 }];
    for (let L = 0; L < b.bulges; L++) {
      const p = at(0.15 + r() * 0.5), side = r() < 0.5 ? -1 : 1, o = p.h * (0.45 + r() * 0.3) * side;
      const [cx, cy] = rot(p.u + p.nu * o, p.v + p.nv * o);
      const pts = circlePts(10, p.h * (0.5 + r() * 0.35), r, [0.5, 1.5]).map(([x, y, v]) => [x + cx, y + cy, v]);
      lobes.push({ pts: deform(pts, 3, 0.18, r), w: 0.6 + r() * 0.4 });
    }
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
    const m = b.R * 0.14;
    return {
      r, rot, spine, lobes, drops,
      box: { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m },
      run: { angle: b.angle, flow: Math.min(3, Math.max(1.4, len / (2.2 * wide))), scale: b.R * 0.28, finger: 2, fall: 0, outside: 0.12 },
    };
  }

  // A random point inside the stroke between s0 and s1 along it, up to between f0 and
  // f1 of the way out to its edge.
  function inside(geo, f0, f1, s0 = 0.05, s1 = 0.9) {
    const r = geo.r, p = geo.spine[Math.round((s0 + r() * (s1 - s0)) * SAMPLES)];
    const f = (f0 + r() * (f1 - f0)) * (r() < 0.5 ? -1 : 1);
    return geo.rot(p.u + p.nu * p.h * f, p.v + p.nv * p.h * f);
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

  function* paintStroke(g, b, geo, k) {
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
    // Body: dozens of translucent deformations of the stroke, knocked back between
    // layers so the pigment pools in places and thins in others.
    for (let L = 0, n = 20 * lobes.length; L < n; L++) {
      const l = lobes[L % lobes.length];
      g.fillStyle = `rgba(${col},${(0.05 * l.w).toFixed(4)})`;
      g.fill(polyPath(deform(l.pts, 2, 0.14, r)));
      if (L % 10 === 9) { knock(g, box, r, 0.3); yield; }
    }
    thin(g, geo, 0.55);
    for (let i = 0, n = 3 + Math.floor(r() * 3); i < n; i++) {
      const [cx, cy] = inside(geo, 0, 0.6, 0.05, 0.7), base = blob(cx, cy, b.R * (0.04 + r() * 0.09), r);
      g.fillStyle = `rgba(${col},${(0.03 + r() * 0.05).toFixed(3)})`;
      for (let L = 0; L < 7; L++) g.fill(polyPath(deform(base, 2, 0.25, r)));
    }
    knock(g, box, r, 0.25);
    yield;
    bristles(g, b, geo);
    bleed(g, b, geo, k, inside(geo, 0, 0.8));
    dry(g, b, k, 0.8);
    dryBrush(g, geo);
    yield;
    granulate(g, r);
    // Double the stroke's opacity: the passes set how strong it is when drawn.
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(g.canvas, 0, 0);
    g.restore();
  }

  const PLANS = { blot: blotPlan, grit: blotPlan, splash: splashPlan, stroke: strokePlan };
  const PAINTERS = { blot: paintBlot, grit: paintGrit, splash: paintSplash, stroke: paintStroke };

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

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // Ink runs fast along channels in the paper, along the element's axis and, for some
  // blots, downhill, so the front fingers outward and fills in behind. Times are
  // normalised: a blot's outline (time 1) is where it has covered its area; a painted
  // element is complete when its last painted cell is reached. D orders the dissolve:
  // thin pigment lifts first.
  function makeField(b, geo, sprite) {
    const { x0, y0, x1, y1 } = geo.box, w = x1 - x0, h = y1 - y0, run = geo.run;
    const cs = Math.max(5, w / 170, h / 170), gw = Math.ceil(w / cs), gh = Math.ceil(h / cs), N = gw * gh;
    const dc = canvas(gw, gh), dg = dc.getContext('2d');
    dg.imageSmoothingQuality = 'high';
    dg.drawImage(sprite, 0, 0, w / cs, h / cs);
    const px = dg.getImageData(0, 0, gw, gh).data, dens = new Float32Array(N);
    let dmax = 1e-6;
    for (let k = 0; k < N; k++) { dens[k] = px[k * 4 + 3] / 255; dmax = Math.max(dmax, dens[k]); }
    const ns = b.seed % 100000, edge = Math.min(gw, gh), speed = new Float32Array(N), D = new Float32Array(N);
    for (let j = 0, k = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++, k++) {
        const x = x0 + (i + 0.5) * cs, y = y0 + (j + 0.5) * cs;
        const n = smooth(0.3, 0.72, fbm2(x / run.scale, y / run.scale, ns, 3));
        let s = (0.25 + 1.6 * Math.pow(n, run.finger)) * (0.75 + 0.5 * Kit.noise2(x / (cs * 2.5), y / (cs * 2.5), ns + 3));
        // A blot slows near the edge of its box, so it never runs into a straight cut.
        if (geo.area) s *= 0.06 + 0.94 * smooth(0, 0.16, Math.min(i, j, gw - 1 - i, gh - 1 - j) / edge);
        else if (dens[k] <= 0.02) s = run.outside;
        speed[k] = s;
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
    const ca = Math.cos(run.angle), sa = Math.sin(run.angle), steps = [];
    for (const [di, dj] of DIRS) {
      const u = (di * ca + dj * sa) * cs, v = (-di * sa + dj * ca) * cs;
      steps.push([di, dj, Math.hypot(u / run.flow, v) / (1 + run.fall * Math.max(0, dj) / Math.hypot(di, dj))]);
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
    let unit = 1e-6;
    if (geo.area) {
      unit = Float64Array.from(T).sort()[Math.min(N - 1, Math.round(geo.area / (cs * cs)))];
    } else {
      for (let k = 0; k < N; k++) if (dens[k] > 0.02) unit = Math.max(unit, T[k]);
    }
    // Normalise, then soften cell-to-cell noise so outlines come out smooth when the
    // mask is scaled up.
    const Tn = new Float32Array(N);
    for (let j = 0, k = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++, k++) {
        let sum = 0, cnt = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue;
            sum += Math.min(2, T[jj * gw + ii] / unit); cnt++;
          }
        }
        Tn[k] = sum / cnt;
      }
    }
    const mask = canvas(gw, gh), boost = canvas(gw, gh);
    return {
      gw, gh, cs, T: Tn, D, mask, boost,
      mImg: mask.getContext('2d').createImageData(gw, gh), bImg: boost.getContext('2d').createImageData(gw, gh),
    };
  }

  // How an element floats, as if the paint lay on water: drifting, turning a little
  // and growing from the moment it lands.
  function motion(b, t) {
    const u = Math.max(0, t - b.born), grown = 1 - Math.exp(-u / 80);
    return {
      x: b.vx * u + Math.sin(u / 23 + b.ph) * 6,
      y: b.vy * u + Math.cos(u / 29 + b.ph) * 4,
      s: 1 + b.grow * grown,
      a: b.spin * u,
    };
  }

  // What the masks need at time t (null when nothing shows). `tau` is how far the
  // front has got (it keeps spreading, ever slower, after the element has formed);
  // `band` the wet pigment at a moving front, `rim` the dried tideline, `core` the
  // fresh drop; `level` the dissolve; (sx, sy) and (fx, fy) where the two layers of
  // flowing pigment have drifted; `glow` thins as the ink spreads. `busy` while it
  // forms, when its masks change every frame.
  function state(b, t) {
    const [ph, p] = b.phase(t);
    if (ph === 'prep' || ph === 'gone') return null;
    const field = KINDS[b.kind].field, v = Math.max(0, t - b.born - b.form), wet = Math.exp(-v / 45);
    const st = {
      tau: 1 + FRONT + b.spread * (1 - wet), soft: EDGE, band: field ? 0.3 * wet : 0, rim: field ? 0.9 : 0,
      core: 0, coreR: 0.1, level: null,
      sx: t * b.drift[0], sy: t * b.drift[1], fx: t * b.drift[2], fy: t * b.drift[3],
      fadeIn: 1, glow: 1 - 0.25 * smooth(0, b.dry + b.rest, v), busy: false, move: motion(b, t),
    };
    if (ph === 'forming') {
      st.tau = (1 + FRONT) * (1 - Math.pow(1 - p, 1.6));
      st.soft = EDGE + (FRONT - EDGE) * (1 - smooth(0.6, 1, p));
      st.band = 0.9 * Math.pow(1 - p, 0.7) + (field ? 0.3 * smooth(0.5, 1, p) : 0);
      st.rim *= smooth(0.3, 1, p);
      st.core = 1.1 * (1 - smooth(0, 0.7, p));
      st.coreR = 0.04 + 0.4 * st.tau;
      st.fadeIn = smooth(0, 0.04, p);
      st.glow = 1.2 * st.fadeIn;
      st.busy = true;
    } else if (ph === 'drying') {
      st.glow *= 1 + 0.2 * (1 - smooth(0, 1, p));       // wet paint dries lighter
    } else if (ph === 'fading') {
      st.level = -0.12 + 1.24 * p;
      st.rim *= 1 - p;
      st.glow *= 1 - 0.3 * p;
    }
    return st;
  }

  // This frame's masks: what shows (front, dissolve, two layers of flowing pigment, one
  // broad and one finer, drifting different ways) and the extra pigment at fronts,
  // rims and fresh drops.
  function masks(f, st) {
    const m = f.mImg.data, o = f.bImg.data, T = f.T, D = f.D, step = f.cs / SH_CELL, W = 0.12;
    for (let j = 0, k = 0, i4 = 3; j < f.gh; j++) {
      for (let i = 0; i < f.gw; i++, k++, i4 += 4) {
        const d = st.tau - T[k];
        let a = smooth(-st.soft, st.soft, d);
        if (a > 0 && st.level != null) a *= smooth(st.level - W, st.level + W, D[k]);
        if (a > 0) a *= 1 - SHIMMER * (0.6 * shimmer(i * step + st.sx, j * step + st.sy) + 0.4 * shimmer(i * step * 2.6 + st.fx, j * step * 2.6 + st.fy));
        m[i4] = a * 255;
        const extra = st.band * Math.exp(-d * d / 0.004) + st.rim * Math.exp(-((d - 0.06) ** 2) / 0.0018) + st.core * Math.exp(-T[k] / st.coreR);
        o[i4] = Math.min(1, a * extra) * 255;
      }
    }
    f.mask.getContext('2d').putImageData(f.mImg, 0, 0);
    f.boost.getContext('2d').putImageData(f.bImg, 0, 0);
  }

  // The sprite seen through a field mask, into a canvas kept while the element lives.
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
    const geo = PLANS[b.kind](b, rng(b.seed)), k = S * RES, [c, g] = layer(geo, k);
    yield* PAINTERS[b.kind](g, b, geo, k);
    if (!b.field) { b.field = makeField(b, geo, c); yield; }
    const { x0, y0, x1, y1 } = geo.box;
    b.sp = { c, k, x0, y0, w: x1 - x0, h: y1 - y0 };
  }

  // ---------- Elements and their schedule ----------

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
    // scene's parallax target, so a new element starts where the camera already is.
    constructor(random, target, o = {}) {
      this.random = random;
      this.target = target;
      this.restRange = o.rest || REST;
      this.blooms = [];
      this.next = null;
      this.lastKind = null;
      this.S = 0;
      this.tick = 0;
      this.count = 0;
      this.style(o);
    }

    // How the ink meets the scene. 'overlay' (the default) mostly colours what is lit
    // (the clockwork, the glow), like a texture laid over a key visual in overlay mode,
    // with a thin wash over the dark; 'screen' lays it over the dark as luminous paint.
    // `gain` scales its strength.
    style({ blend = 'overlay', gain = GAIN } = {}) {
      this.blend = blend === 'screen' ? 'screen' : 'overlay';
      this.gain = Math.max(0, Number(gain) || 0);
    }

    // A kind by weight, never the same twice running.
    pickKind() {
      const kinds = Object.keys(KINDS).filter(k => k !== this.lastKind);
      let u = this.random() * kinds.reduce((s, k) => s + KINDS[k].weight, 0);
      for (const k of kinds) if ((u -= KINDS[k].weight) <= 0) return k;
      return kinds[kinds.length - 1];
    }

    // A colour that no living element uses within NEAR of (x, y), or null.
    pickHue(x, y) {
      const free = HUES.filter(h => this.blooms.every(b => b.color !== h || Math.hypot(b.x - x, b.y - y) >= NEAR));
      return free.length ? free[Math.floor(this.random() * free.length)] : null;
    }

    // A new element in a free zone, in a colour not used close by, floating its own way.
    spawn(t, kind = this.pickKind()) {
      const r = this.random;
      const zones = ZONES.map((_, i) => i).filter(i => !this.blooms.some(b => b.zone === i));
      if (!zones.length) return null;
      let u = r() * zones.reduce((s, i) => s + ZONES[i].w, 0), zone = zones[zones.length - 1];
      for (const i of zones) if ((u -= ZONES[i].w) <= 0) { zone = i; break; }
      const z = ZONES[zone], K = KINDS[kind];
      const x = z.x + (r() - 0.5) * 320, y = z.y + (r() - 0.5) * 240, color = this.pickHue(x, y);
      if (!color) return null;
      const friends = BLEED[color], span = ([a, c]) => a + r() * (c - a);
      const dir = r() * TAU, speed = span(DRIFT);
      const b = new Bloom({
        zone, kind, depth: z.depth, color, color2: friends[Math.floor(r() * friends.length)], x, y,
        R: span(z.R) * span(K.size), angle: (r() < 0.5 ? -1 : 1) * (0.2 + r() * 0.8),
        bulges: Math.floor(r() * 3), drops: 1 + Math.floor(r() * 3),
        alpha: 0, spread: span(K.spread), grow: span(K.grow),
        vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed * 0.8, spin: (r() < 0.5 ? -1 : 1) * span(SPIN), ph: r() * TAU,
        drift: [(r() - 0.5) * 0.5, (r() - 0.5) * 0.5, (r() - 0.5) * 0.9, (r() - 0.5) * 0.9],
        seed: Math.floor(r() * 1e9), slot: this.count++ % 3,
        born: t + PREP, form: span(K.form), dry: DRY, rest: span(this.restRange), fade: span(FADE),
        cam: { x: this.target.x, y: this.target.y },
      });
      // Big elements are thinner, so none of them takes over the frame.
      b.alpha = span(K.alpha) * LEVEL[color] * Math.min(1, Math.pow(200 / b.R, 0.35));
      this.lastKind = kind;
      this.blooms.push(b);
      return b;
    }

    // Start with MIN dry elements part-way through their lives; another forms soon.
    boot(t) {
      const r = this.random;
      for (let i = 0; i < MIN; i++) {
        const b = this.spawn(t);
        if (!b) continue;
        b.born = t - b.form - b.dry - b.rest * (0.05 + r() * 0.9);
        if (this.S) this.finish(b);
      }
      this.next = t + 2 + r() * 3;
    }

    // A worldline shift throws a splash (the preview may ask for any kind), and the
    // oldest resting element dissolves to make room. Returns the new element, or null
    // when every zone or colour is still taken.
    shift(t, kind = 'splash') {
      if (this.next == null) return null;
      const resting = this.blooms.filter(b => b.phase(t)[0] === 'resting').sort((a, b) => a.born - b.born);
      if (resting.length && this.active(t) >= MAX) resting[0].fadeFrom(t);
      const b = this.spawn(t, kind);
      this.next = Math.max(this.next, t + GAP[0]);
      return b;
    }

    // Elements not yet dissolving: new ones are planned around these, so a fresh one
    // can start forming while an old one fades.
    active(t) { return this.blooms.filter(b => b.phase(t)[0] !== 'fading').length; }

    update(t) {
      if (this.next == null) this.boot(t);
      this.blooms = this.blooms.filter(b => t < b.end);
      const active = this.active(t);
      if (active < MIN && this.next > t + 6) this.next = t + 2 + this.random() * 4;
      if (t >= this.next) {
        if (active < MAX) this.spawn(t);
        this.next = t + GAP[0] + this.random() * (GAP[1] - GAP[0]);
      }
      this.work();
    }

    // Paint waiting elements, a bounded number of steps per frame.
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

    // Mask this frame's image of every element once, for every pass. Once formed, an
    // element changes slowly, so its masks are redone every third frame, in turns.
    frame(t) {
      this.tick = (this.tick + 1) % 3;
      for (const b of this.blooms) {
        b.now = b.sp ? state(b, t) : null;
        if (!b.now || (b.live && !b.now.busy && (this.tick + b.slot) % 3)) continue;
        masks(b.field, b.now);
        const live = b.live || {};
        b.live = { reveal: through(b, b.field.mask, live.reveal), boost: through(b, b.field.boost, live.boost) };
      }
    }

    // Two passes around the clockwork each element sits with. 'under' goes before it
    // and lays the ink's own colour over the dark ('screen'); 'over' goes after it and
    // stains whatever is there in the ink's hue ('color'), the way washes colour the
    // linework of a painted key visual. In overlay style most of the colour goes over
    // as well ('overlay'), so it shows mainly where something is lit. `pick(element)`
    // selects which elements.
    draw(ctx, view, t, pass, pick) {
      const g = this.gain, overlay = this.blend === 'overlay';
      if (pass === 'under') this.lay(ctx, view, t, pick, 'screen', overlay ? g * OVERLAY.wash : g);
      else {
        if (overlay) this.lay(ctx, view, t, pick, 'overlay', g * OVERLAY.over);
        this.lay(ctx, view, t, pick, 'color', g);
      }
    }

    // One pass of every picked element, `k` times its own strength.
    lay(ctx, view, t, pick, op, k) {
      const P = 42, S = view.S;
      ctx.globalCompositeOperation = op;
      for (const b of this.blooms) {
        if (!b.now || !b.live || !pick(b)) continue;
        // Float it about its own origin, then add the parallax.
        const m = b.now.move, c = Math.cos(m.a) * m.s * S, s = Math.sin(m.a) * m.s * S;
        const x = b.x + m.x - b.cam.x * P * b.depth, y = b.y + m.y - b.cam.y * P * b.depth * 0.7;
        ctx.setTransform(c, s, -s, c, view.ox + x * S, view.oy + y * S);
        const box = [b.sp.x0, b.sp.y0, b.sp.w, b.sp.h];
        const breathe = 1 + 0.06 * Math.sin(t / 41 + b.ph);
        ctx.globalAlpha = Math.min(1, (op === 'color' ? TINT : b.alpha) * k * b.now.glow * breathe);
        ctx.drawImage(b.live.reveal, ...box);
        if (op !== 'color') {
          ctx.globalAlpha = Math.min(1, b.alpha * 1.3 * k * b.now.fadeIn * breathe);
          ctx.drawImage(b.live.boost, ...box);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  return { Field, ZONES, KINDS, INKS, MAX, NEAR, state };
})();
