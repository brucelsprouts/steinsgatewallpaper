'use strict';
// Clockwork: dials, hands, gears and an escapement, pre-rendered per depth plane
// and placed each frame with a gentle affine "3D tilt".
const Mech = (() => {
  const { TAU, canvas, clamp, ease, hash, stepped } = Kit;

  const PALETTES = {
    warm: { line: '196,170,140', rim: '178,148,118', solid: '17,14,11', jewel: '200,50,72' },
    cold: { line: '172,180,192', rim: '158,166,180', solid: '12,13,15', jewel: '200,50,72' },
  };

  // ---------- 2D affine matrices, canvas order [a, b, c, d, e, f] ----------
  const Mat = {
    mul: (m, n) => [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ],
    T: (x, y) => [1, 0, 0, 1, x, y],
    R: a => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; },
    // Orthographic view of a disc tilted rx about x, then ry about y.
    tilt: (rx, ry) => [Math.cos(ry), 0, Math.sin(rx) * Math.sin(ry), Math.cos(rx), 0, 0],
  };

  // The soft halo baked around line art (not the solid silhouettes): its radius in design
  // px and how strong it is. Small, so the clockwork lifts out of the dark without the
  // scene looking filtered.
  const GLOW = { r: 5, a: 2 };

  // Bake a centred drawing of radius R into a sprite, optionally blurred and with a halo
  // of its own light (`glow`, as GLOW).
  function bake(R, S, res, blur, draw, glow = null) {
    const pad = Math.max(blur, glow ? glow.r : 0) * 3 + 4, half = R + pad, k = S * res;
    const c = canvas(half * 2 * k, half * 2 * k);
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, half * k, half * k);
    draw(g);
    if (blur <= 0 && !glow) return { c, half };
    const b = canvas(c.width, c.height), bg = b.getContext('2d');
    bg.globalCompositeOperation = 'lighter';
    if (glow) {
      bg.filter = `blur(${glow.r * k}px)`;
      for (let a = glow.a; a > 0; a--) { bg.globalAlpha = Math.min(1, a); bg.drawImage(c, 0, 0); }
      bg.globalAlpha = 1;
    }
    bg.filter = blur > 0 ? `blur(${blur * k}px)` : 'none';
    bg.drawImage(c, 0, 0);
    return { c: b, half };
  }

  const ring = (g, r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };
  const spoke = (g, a, r0, r1) => {
    g.beginPath();
    g.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0);
    g.lineTo(Math.sin(a) * r1, -Math.cos(a) * r1);
    g.stroke();
  };

  // Soft catch-light on a rim. Drawn without the part's rotation, so metal seems
  // to turn under a fixed light.
  function drawShine(g, R, glass) {
    g.lineCap = 'round';
    if (glass) {
      g.strokeStyle = 'rgba(255,248,236,0.5)';
      g.lineWidth = R * 0.12;
      g.beginPath(); g.arc(0, 0, R * 0.8, -2.55, -1.75); g.stroke();
      return;
    }
    g.strokeStyle = 'rgba(255,246,232,0.9)';
    g.lineWidth = Math.max(1.5, R * 0.035);
    g.beginPath(); g.arc(0, 0, R * 0.93, -2.6, -1.65); g.stroke();
  }

  // ---------- Dial parts (local coords, centre at 0,0, 12 o'clock = -y) ----------
  const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

  function drawChapter(g, r, lw, numerals = true) {
    g.lineCap = 'round';
    ring(g, r, lw * 1.8);
    ring(g, r * 0.975, lw * 0.6);
    for (let i = 0; i < 60; i++) {
      const hour = i % 5 === 0;
      g.lineWidth = hour ? lw * 2.4 : lw * 0.8;
      spoke(g, i / 60 * TAU, hour ? r * 0.895 : r * 0.928, r * 0.958);
    }
    if (!numerals) return;
    g.font = `${r * 0.1}px "Times New Roman", Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) {
      g.save();
      g.rotate(i / 12 * TAU);
      g.fillText(ROMAN[i], 0, -r * 0.8);
      g.restore();
    }
  }

  // A degree scale, as on an astrolabe: fine ticks every two degrees between two rings,
  // longer every ten, numbered every thirty.
  function drawScale(g, r, lw) {
    g.lineCap = 'round';
    ring(g, r, lw * 1.2);
    ring(g, r * 0.93, lw * 0.6);
    for (let i = 0; i < 180; i++) {
      const ten = i % 5 === 0;
      g.lineWidth = lw * (ten ? 1 : 0.5);
      spoke(g, i / 180 * TAU, r * (ten ? 0.93 : 0.955), r * 0.985);
    }
    g.font = `${r * 0.05}px "Times New Roman", Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) {
      g.save();
      g.rotate(i / 12 * TAU);
      g.fillText(String(i * 30), 0, -r * 0.89);
      g.restore();
    }
  }

  function drawRing24(g, r, lw) {
    ring(g, r, lw * 0.7);
    ring(g, r * 0.9, lw * 0.5);
    g.font = `${r * 0.055}px "Times New Roman", Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 24; i++) {
      g.save();
      g.rotate(i / 24 * TAU);
      g.fillText(String(i === 0 ? 24 : i), 0, -r * 0.95);
      g.restore();
      g.lineWidth = lw * 0.6;
      spoke(g, (i + 0.5) / 24 * TAU, r * 0.92, r * 0.98);
    }
  }

  function drawTrack(g, r, lw) {
    ring(g, r, lw * 0.7);
    ring(g, r * 0.96, lw * 0.4);
    for (let i = 0; i < 120; i++) {
      g.lineWidth = lw * (i % 10 === 0 ? 0.9 : 0.5);
      spoke(g, i / 120 * TAU, r * 0.96, r * (i % 10 === 0 ? 1 : 0.982));
    }
  }

  // Ornate hand pointing up from the pivot: tapered shaft, open spade, fine tip.
  function drawHand(g, len, w, lw, kind) {
    g.lineWidth = lw;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (kind === 'second') {
      g.beginPath(); g.moveTo(0, len * 0.22); g.lineTo(0, -len); g.stroke();
      g.beginPath(); g.arc(0, len * 0.16, w * 1.6, 0, TAU); g.stroke();
      g.beginPath(); g.arc(0, 0, w * 0.9, 0, TAU); g.stroke();
      return;
    }
    const s0 = len * (kind === 'hour' ? 0.56 : 0.66), s1 = len * (kind === 'hour' ? 0.84 : 0.88);
    const sw = w * (kind === 'hour' ? 2.4 : 1.8);
    const p = new Path2D();
    p.moveTo(-w * 0.5, len * 0.12);
    p.lineTo(-w * 0.45, -s0 * 0.55);
    p.quadraticCurveTo(-w * 0.2, -s0 * 0.9, 0, -s0);
    p.quadraticCurveTo(w * 0.2, -s0 * 0.9, w * 0.45, -s0 * 0.55);
    p.lineTo(w * 0.5, len * 0.12);
    p.closePath();
    const sp = new Path2D();
    const mid = (s0 + s1) / 2;
    sp.moveTo(0, -s0);
    sp.bezierCurveTo(-sw, -s0 - (s1 - s0) * 0.1, -sw * 0.8, -mid - (s1 - s0) * 0.25, 0, -s1);
    sp.bezierCurveTo(sw * 0.8, -mid - (s1 - s0) * 0.25, sw, -s0 - (s1 - s0) * 0.1, 0, -s0);
    const tip = new Path2D();
    tip.moveTo(-w * 0.28, -s1 + w * 0.2);
    tip.lineTo(0, -len);
    tip.lineTo(w * 0.28, -s1 + w * 0.2);
    g.globalAlpha = 0.22;
    g.fill(p); g.fill(sp); g.fill(tip);
    g.globalAlpha = 1;
    g.stroke(p); g.stroke(sp); g.stroke(tip);
    g.beginPath(); g.arc(0, 0, w * 1.1, 0, TAU); g.stroke();
  }

  // ---------- Gears ----------
  // A gear is defined by its train's circular pitch p and tooth count. Tooth k of a
  // standard gear is centred at angle step*(k + 0.25).
  function gearDims(p, teeth, profile) {
    const rp = teeth * p / TAU, depth = p * (profile === 'escape' ? 0.9 : 0.5);
    return { rp, r: rp + depth / 2, root: rp - depth / 2, step: TAU / teeth, teeth };
  }

  function gearPath(G, o) {
    const { r, root, step, teeth } = G;
    const p = new Path2D();
    const pt = (rad, a) => [Math.cos(a) * rad, Math.sin(a) * rad];
    for (let i = 0; i < teeth; i++) {
      const a0 = i * step;
      const pts = o.profile === 'escape'
        // Ratchet-like club teeth of an escape wheel.
        ? [[root, a0], [r, a0 + step * 0.55], [r, a0 + step * 0.68], [root + (r - root) * 0.18, a0 + step * 0.74]]
        // Chunky, nearly square teeth.
        : [[root, a0 + step * 0.02], [r, a0 + step * 0.08], [r, a0 + step * 0.42], [root, a0 + step * 0.48]];
      pts.forEach(([rad, a], k) => { const [x, y] = pt(rad, a); (i === 0 && k === 0) ? p.moveTo(x, y) : p.lineTo(x, y); });
      p.arc(0, 0, root, pts[3][1], a0 + step + (o.profile === 'escape' ? 0 : step * 0.02));
    }
    p.closePath();
    const spokes = o.spokes ?? 5;
    const ri = root - G.r * (o.rim ?? 0.13), rh = G.r * 0.24;
    if (spokes > 0) {
      const sw = G.r * (o.spokeWidth ?? 0.07), bend = o.curved ? 0.42 : 0;
      for (let i = 0; i < spokes; i++) {
        const s0 = i * TAU / spokes, s1 = s0 + TAU / spokes;
        const dO = Math.asin(Math.min(1, sw / ri)), dI = Math.asin(Math.min(1, sw / rh));
        const rm = (ri + rh) / 2;
        p.moveTo(...pt(ri, s0 + dO));
        p.arc(0, 0, ri, s0 + dO, s1 - dO);
        p.quadraticCurveTo(...pt(rm, s1 - dO + bend * 0.5), ...pt(rh, s1 - dI + bend));
        p.arc(0, 0, rh, s1 - dI + bend, s0 + dI + bend, true);
        p.quadraticCurveTo(...pt(rm, s0 + dO + bend * 0.5), ...pt(ri, s0 + dO));
        p.closePath();
      }
    } else if ((o.holes ?? 0) > 0) {
      const hr = (ri - rh) * 0.36, hc = (ri + rh) / 2;
      for (let i = 0; i < o.holes; i++) {
        const a = i * TAU / o.holes;
        p.moveTo(Math.cos(a) * hc + hr, Math.sin(a) * hc);
        p.arc(Math.cos(a) * hc, Math.sin(a) * hc, hr, 0, TAU);
      }
    }
    const bore = G.r * 0.065;
    p.moveTo(bore, 0);
    p.arc(0, 0, bore, 0, TAU);
    return p;
  }

  function drawJewel(g, rad, pal) {
    g.fillStyle = `rgba(${pal.jewel},0.85)`;
    g.beginPath(); g.arc(0, 0, rad, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,230,230,0.7)';
    g.beginPath(); g.arc(-rad * 0.3, -rad * 0.3, rad * 0.32, 0, TAU); g.fill();
  }

  function drawGear(g, G, o, pal) {
    const p = gearPath(G, o);
    const solid = o.style === 'solid';
    const lw = o.lw ?? Math.max(1, G.r * 0.008);
    g.lineJoin = 'round';
    // How much light a solid gear's edges catch (`edge` dims them for a gear that
    // would otherwise stand out).
    const e = o.edge ?? 1;
    if (solid) {
      // Dark turned metal: a faint sheen toward the rim, concentric turning marks, and
      // chamfered edges that catch a little light. All of it looks the same at any
      // angle, so it stays right as the gear turns.
      const fg = g.createRadialGradient(0, 0, G.r * 0.1, 0, 0, G.r);
      fg.addColorStop(0, `rgb(${pal.solid})`);
      fg.addColorStop(0.75, `rgb(${pal.solid})`);
      fg.addColorStop(1, `rgba(${pal.rim},${0.16 * e})`);
      g.fillStyle = `rgb(${pal.solid})`;
      g.fill(p, 'evenodd');
      g.fillStyle = fg;
      g.fill(p, 'evenodd');
      g.save();
      g.clip(p, 'evenodd');
      g.strokeStyle = `rgb(${pal.rim})`;
      for (let k = 0; k < 46; k++) {
        g.globalAlpha = 0.025 + 0.04 * hash(k, 77);
        ring(g, G.r * (0.17 + k * 0.018), Math.max(0.6, G.r * 0.002));
      }
      g.restore();
      g.strokeStyle = `rgba(${pal.rim},${0.6 * e})`;
      g.lineWidth = Math.max(1.2, G.r * 0.006);
      g.stroke(p);
      g.strokeStyle = `rgba(${pal.rim},${0.16 * e})`;
      g.lineWidth = Math.max(2, G.r * 0.02);
      g.stroke(p);
    } else {
      // A faint metal disc, a little brighter toward the rim.
      const fg = g.createRadialGradient(0, 0, G.r * 0.1, 0, 0, G.r);
      fg.addColorStop(0, `rgba(${pal.line},0.06)`);
      fg.addColorStop(1, `rgba(${pal.line},0.17)`);
      g.fillStyle = fg;
      g.fill(p, 'evenodd');
      g.strokeStyle = `rgb(${pal.line})`;
      g.lineWidth = lw;
      g.stroke(p);
    }
    // Machined details: rim band, hub collar, screws.
    g.strokeStyle = solid ? `rgba(${pal.rim},${0.35 * e})` : `rgba(${pal.line},0.7)`;
    if (G.r > 40 && (o.spokes ?? 5) > 0) ring(g, G.root - G.r * 0.04, lw * 0.6);
    ring(g, G.r * 0.15, lw * 0.7);
    if (G.r > 60) {
      g.lineWidth = lw * 0.7;
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + 0.5, x = Math.cos(a) * G.r * 0.195, y = Math.sin(a) * G.r * 0.195, sr = G.r * 0.022;
        g.beginPath(); g.arc(x, y, sr, 0, TAU); g.stroke();
        g.beginPath();
        g.moveTo(x - sr * Math.cos(a + 1), y - sr * Math.sin(a + 1));
        g.lineTo(x + sr * Math.cos(a + 1), y + sr * Math.sin(a + 1));
        g.stroke();
      }
    }
    if (o.jewel) drawJewel(g, Math.max(2, G.r * 0.05), pal);
  }

  // Anchor (pallet fork), pivot at 0,0, pallets pointing down (+y) to the escape wheel.
  function drawPallet(g, L, lw, pal) {
    g.lineWidth = lw;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const arm = new Path2D();
    arm.moveTo(-L * 0.62, L * 0.5);
    arm.quadraticCurveTo(-L * 0.3, -L * 0.05, 0, -L * 0.08);
    arm.quadraticCurveTo(L * 0.3, -L * 0.05, L * 0.62, L * 0.5);
    arm.moveTo(0, -L * 0.08);
    arm.lineTo(0, -L * 0.95);
    g.stroke(arm);
    g.beginPath(); g.moveTo(-L * 0.1, -L * 1.08); g.lineTo(-L * 0.1, -L * 0.92); g.lineTo(L * 0.1, -L * 0.92); g.lineTo(L * 0.1, -L * 1.08); g.stroke();
    ring(g, L * 0.09, lw);
    // Ruby pallet stones.
    for (const sx of [-1, 1]) {
      g.save();
      g.translate(sx * L * 0.62, L * 0.5);
      g.rotate(sx * 0.5);
      g.fillStyle = `rgba(${pal.jewel},0.8)`;
      g.fillRect(-L * 0.05, -L * 0.02, L * 0.1, L * 0.2);
      g.restore();
    }
  }

  function drawBalance(g, R, lw, pal) {
    ring(g, R, lw * 1.4);
    ring(g, R * 0.88, lw * 0.8);
    g.lineWidth = lw;
    for (let i = 0; i < 3; i++) spoke(g, i / 3 * TAU, R * 0.1, R * 0.88);
    g.lineWidth = lw * 0.8;
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU;
      g.beginPath(); g.arc(Math.sin(a) * R * 1.04, -Math.cos(a) * R * 1.04, R * 0.045, 0, TAU); g.stroke();
    }
    ring(g, R * 0.1, lw);
    drawJewel(g, Math.max(2, R * 0.05), pal);
  }

  function drawHairspring(g, R, lw) {
    g.lineWidth = lw * 0.6;
    g.beginPath();
    const turns = 7;
    for (let i = 0; i <= 600; i++) {
      const u = i / 600, a = u * turns * TAU, rad = R * (0.12 + 0.55 * u);
      i ? g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.stroke();
  }

  // ---------- Motion helpers ----------
  // Worldline-shift kicks: each shift moves a part by some amount, fast then settling.
  // Settled kicks fold into `base`, so cost stays flat however many shifts happen.
  const KICK = 2.6;
  class Kicker {
    constructor(salt, size, turns = 0) { this.salt = salt; this.size = size; this.turns = turns; this.base = 0; this.from = 0; }
    amount(i) {
      const dir = hash(i, this.salt) < 0.62 ? -1 : 1;
      // Whole turns land a part back where it was: hands keep the right time.
      if (this.turns) return (this.turns === 'any' ? dir : this.turns) * TAU;
      return dir * this.size * (0.6 + 0.8 * hash(i, this.salt + 7));
    }
    value(t, shifts) {
      while (this.from < shifts.length && t - shifts[this.from] >= KICK) {
        this.base += this.amount(this.from++);
        if (this.turns) this.base %= TAU;
      }
      let v = this.base;
      for (let i = this.from; i < shifts.length; i++) {
        if (t > shifts[i]) v += this.amount(i) * ease.out(clamp((t - shifts[i]) / KICK));
      }
      return v;
    }
  }

  // ---------- Assembly: a group of parts sharing a depth plane and a tilt ----------
  class Assembly {
    constructor(o) {
      Object.assign(this, {
        x: 0, y: 0, depth: 0, blur: 0, res: 1, alpha: 0.12, rx: 0, ry: 0, roll: 0,
        drift: 12, seed: 1, beat: { period: 2, dur: 0.7, teeth: 0.25 }, parts: [], shine: 0.5, glow: GLOW,
      }, o);
      this.cam = { x: 0, y: 0 };
      this.linkGears();
      this.kick = new Kicker(this.seed * 31, 9);
      this.parts.forEach((p, j) => {
        // A numeral ring that hands read against spins whole turns; other rings move freely.
        p.ringKicks = [0, 1, 2].map(i => new Kicker(this.seed * 13 + j * 5 + i, 0.6,
          i === 0 && p.hands !== false ? 'any' : 0));
        p.handKicks = [new Kicker(0, 0, -1), new Kicker(0, 0, -2), new Kicker(0, 0, -3)];
      });
    }

    // Place meshing gears from their parent and phase them so teeth interlock.
    linkGears() {
      for (const p of this.parts) {
        if (p.type !== 'gear') continue;
        if (p.mesh == null) {
          p.G = gearDims(p.pitch, p.teeth, p.profile);
          Object.assign(p, { x: p.x ?? 0, y: p.y ?? 0, theta: p.theta ?? 0, dir: p.dir ?? 1 });
          continue;
        }
        const A = this.parts[p.mesh.to], b = p.mesh.angle;
        p.pitch = A.pitch;
        p.G = gearDims(p.pitch, p.teeth);
        const d = A.G.rp + p.G.rp;
        p.x = A.x + Math.cos(b) * d;
        p.y = A.y + Math.sin(b) * d;
        const uA = (((b - A.theta) / A.G.step) % 1 + 1) % 1;
        const uB = ((1 - uA) % 1 + 1) % 1;
        p.theta = b + Math.PI - uB * p.G.step;
        p.dir = -A.dir;
      }
    }

    build(S, pal) {
      const { blur, res, glow } = this;
      const col = `rgb(${pal.line})`;
      const paint = fn => g => { g.strokeStyle = g.fillStyle = col; fn(g); };
      for (const p of this.parts) {
        if (p.type === 'gear') {
          p.sp = bake(p.G.r, S, res, blur, g => drawGear(g, p.G, p, pal), p.style === 'solid' ? null : glow);
          if (this.shine > 0) p.shineSp = bake(p.G.r, S, Math.min(res, 0.4), blur + p.G.r * 0.02, g => drawShine(g, p.G.r, false));
        } else if (p.type === 'dial') {
          const w = Math.max(1.2, p.r * 0.004);
          p.rings = [];
          // `face: 'scale'` swaps the chapter ring for a degree scale.
          const face = p.face === 'scale' ? g => drawScale(g, p.r, w) : g => drawChapter(g, p.r, w, p.numerals !== false);
          p.rings.push({ sp: bake(p.r, S, res, blur, paint(face), glow), turn: p.turn ?? 0 });
          if (p.ring24) p.rings.push({ sp: bake(p.r * 0.72, S, res, blur, paint(g => drawRing24(g, p.r * 0.72, w)), glow), turn: -(p.turn ?? 1) * 0.7 });
          if (p.track !== false) p.rings.push({ sp: bake(p.r * 0.6, S, res, blur, paint(g => drawTrack(g, p.r * 0.6, w)), glow), turn: (p.turn ?? 1) * 0.4 });
          if (this.shine > 0) p.shineSp = bake(p.r, S, Math.min(res, 0.4), blur + p.r * 0.04, g => drawShine(g, p.r, true));
          if (p.hands !== false) {
            p.hand = {
              h: bake(p.r * 0.5, S, res, blur, paint(g => drawHand(g, p.r * 0.48, p.r * 0.028, w * 1.2, 'hour')), glow),
              m: bake(p.r * 0.76, S, res, blur, paint(g => drawHand(g, p.r * 0.74, p.r * 0.02, w * 1.1, 'minute')), glow),
            };
            if (p.seconds) p.hand.s = bake(p.r * 0.86, S, res, blur, paint(g => drawHand(g, p.r * 0.84, p.r * 0.012, w * 0.9, 'second')), glow);
          }
        } else if (p.type === 'pallet') {
          p.sp = bake(p.L * 1.15, S, res, blur, paint(g => drawPallet(g, p.L, 1.4, pal)), glow);
        } else if (p.type === 'balance') {
          p.sp = bake(p.r * 1.1, S, res, blur, paint(g => drawBalance(g, p.r, 1.4, pal)), glow);
          p.springSp = bake(p.r, S, res, blur, paint(g => drawHairspring(g, p.r, 1.4)), glow);
        }
      }
    }

    draw(ctx, view, t, now, shifts) {
      const P = 42, cam = this.cam;
      const dx = Math.sin(t / 97 + this.seed) * this.drift + Math.sin(t / 41 + this.seed * 3) * this.drift * 0.35;
      const dy = Math.cos(t / 113 + this.seed * 2) * this.drift * 0.7;
      const ox = this.x + dx - cam.x * P * this.depth;
      const oy = this.y + dy - cam.y * P * this.depth * 0.7;
      const look = 0.03 * (1 + Math.abs(this.depth));
      const base = Mat.mul(
        [view.S, 0, 0, view.S, view.ox, view.oy],
        Mat.mul(Mat.T(ox, oy), Mat.mul(Mat.R(this.roll), Mat.tilt(this.rx + cam.y * look, this.ry - cam.x * look))),
      );
      const b = this.beat;
      const phase = stepped(t, b.period, b.dur, b.teeth, this.seed * 0.37) + this.kick.value(t, shifts);
      const put = (sp, m) => {
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        ctx.drawImage(sp.c, -sp.half, -sp.half, sp.half * 2, sp.half * 2);
      };
      const shine = (sp, at) => {
        if (!sp || this.shine <= 0) return;
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = this.alpha * this.shine;
        put(sp, at);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = this.alpha;
      };
      // Real seconds drive the escapement so it beats with the second hands.
      const ms = now.getMilliseconds(), sec = now.getSeconds();
      const beat = sec + ease.tick(clamp(ms / 160));
      ctx.globalAlpha = this.alpha;
      for (const p of this.parts) {
        const at = Mat.mul(base, Mat.T(p.x || 0, p.y || 0));
        if (p.type === 'gear') {
          const spin = p.profile === 'escape'
            ? -beat / 30 * TAU + p.handKicks[0].value(t, shifts)
            : p.theta + p.dir * phase * p.G.step;
          put(p.sp, Mat.mul(at, Mat.R(spin)));
          shine(p.shineSp, at);
        } else if (p.type === 'pallet') {
          const from = sec % 2 ? -1 : 1;
          const rock = 0.09 * (from - 2 * from * ease.tick(clamp(ms / 160)));
          put(p.sp, Mat.mul(at, Mat.R(rock)));
        } else if (p.type === 'balance') {
          put(p.springSp, at);
          put(p.sp, Mat.mul(at, Mat.R(2.1 * Math.sin(Math.PI * (sec + ms / 1000)))));
        } else if (p.type === 'dial') {
          p.rings.forEach((rg, i) => {
            const a = stepped(t, 7 + i * 2.3, 1.6, rg.turn * TAU / 60, this.seed + i) + p.ringKicks[i].value(t, shifts);
            put(rg.sp, Mat.mul(at, Mat.R(a)));
          });
          if (p.hand) {
            // `tz` pins a dial to a UTC offset (hours); otherwise it shows local time.
            const shiftMin = p.tz == null ? 0 : p.tz * 60 + now.getTimezoneOffset();
            const d = new Date(now.getTime() + shiftMin * 60e3);
            const dms = d.getMilliseconds(), s = d.getSeconds(), m = d.getMinutes(), h = d.getHours() % 12;
            const secPos = s + ease.tick(clamp(dms / 220));
            const minPos = m - 1 + ease.inOut(clamp((s + dms / 1000) / 0.9));
            const hourPos = h + m / 60 + s / 3600;
            const [kh, km, ks] = p.handKicks.map(k => k.value(t, shifts));
            ctx.globalAlpha = this.alpha * (this.hands ?? 1);
            put(p.hand.h, Mat.mul(at, Mat.R(hourPos / 12 * TAU + kh)));
            put(p.hand.m, Mat.mul(at, Mat.R(minPos / 60 * TAU + km)));
            if (p.hand.s) put(p.hand.s, Mat.mul(at, Mat.R(secPos / 60 * TAU + ks)));
            ctx.globalAlpha = this.alpha;
          }
          shine(p.shineSp, at);
        }
      }
    }
  }

  return { Assembly, PALETTES, Mat, gearDims };
})();
