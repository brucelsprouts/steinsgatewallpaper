'use strict';
// Clockwork: dials, hands and gears, pre-rendered (blur baked in per depth plane)
// and placed each frame with an affine "3D tilt" so discs read as seen at an angle.
const Mech = (() => {
  const { TAU, canvas, clamp, ease, hash } = Kit;

  const PALETTES = {
    warm: { line: '196,170,140', rim: '170,140,112', solid: '15,12,10' },
    cold: { line: '172,180,192', rim: '150,158,172', solid: '11,12,14' },
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

  // Bake a centred drawing of radius R into a sprite, optionally blurred.
  function bake(R, S, res, blur, draw) {
    const pad = blur * 3 + 4, half = R + pad, k = S * res;
    const c = canvas(half * 2 * k, half * 2 * k);
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, half * k, half * k);
    draw(g);
    if (blur <= 0) return { c, half };
    const b = canvas(c.width, c.height), bg = b.getContext('2d');
    bg.filter = `blur(${blur * k}px)`;
    bg.drawImage(c, 0, 0);
    return { c: b, half };
  }

  // ---------- Dial parts (local coords, centre at 0,0, 12 o'clock = -y) ----------
  const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  const ring = (g, r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };
  const spoke = (g, a, r0, r1) => {
    g.beginPath();
    g.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0);
    g.lineTo(Math.sin(a) * r1, -Math.cos(a) * r1);
    g.stroke();
  };

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
    // Spade: two arcs meeting at a point, open in the middle.
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
  // A gear is defined by its train's circular pitch p and tooth count; teeth are
  // chunky and nearly square. Tooth k is centred at angle step*(k + 0.25).
  function gearDims(p, teeth) {
    const rp = teeth * p / TAU, depth = p * 0.5;
    return { rp, r: rp + depth / 2, root: rp - depth / 2, step: TAU / teeth };
  }

  function gearPath(G, spokes, holes) {
    const { r, root, step } = G;
    const teeth = Math.round(TAU / step);
    const p = new Path2D();
    const at = (rad, a) => [Math.cos(a) * rad, Math.sin(a) * rad];
    for (let i = 0; i < teeth; i++) {
      const a0 = i * step;
      const pts = [[root, a0 + step * 0.02], [r, a0 + step * 0.08], [r, a0 + step * 0.42], [root, a0 + step * 0.48]];
      pts.forEach(([rad, a], k) => {
        const [x, y] = at(rad, a);
        (i === 0 && k === 0) ? p.moveTo(x, y) : p.lineTo(x, y);
      });
      p.arc(0, 0, root, a0 + step * 0.48, a0 + step * 1.02);
    }
    p.closePath();
    const ri = root - G.r * 0.13, rh = G.r * 0.24;
    if (spokes > 0) {
      const sw = G.r * 0.07;
      for (let i = 0; i < spokes; i++) {
        const s0 = i * TAU / spokes, s1 = s0 + TAU / spokes;
        const dO = Math.asin(Math.min(1, sw / ri)), dI = Math.asin(Math.min(1, sw / rh));
        p.moveTo(Math.cos(s0 + dO) * ri, Math.sin(s0 + dO) * ri);
        p.arc(0, 0, ri, s0 + dO, s1 - dO);
        p.arc(0, 0, rh, s1 - dI, s0 + dI, true);
        p.closePath();
      }
    } else if (holes > 0) {
      const hr = (ri - rh) * 0.36, hc = (ri + rh) / 2;
      for (let i = 0; i < holes; i++) {
        const a = i * TAU / holes;
        p.moveTo(Math.cos(a) * hc + hr, Math.sin(a) * hc);
        p.arc(Math.cos(a) * hc, Math.sin(a) * hc, hr, 0, TAU);
      }
    }
    const bore = G.r * 0.065;
    p.moveTo(bore, 0);
    p.arc(0, 0, bore, 0, TAU);
    return p;
  }

  function drawGear(g, G, o, pal) {
    const p = gearPath(G, o.spokes ?? 5, o.holes ?? 0);
    g.lineJoin = 'round';
    if (o.style === 'solid') {
      g.fillStyle = `rgb(${pal.solid})`;
      g.fill(p, 'evenodd');
      g.strokeStyle = `rgba(${pal.rim},0.5)`;
      g.lineWidth = Math.max(1, G.r * 0.012);
      g.stroke(p);
    } else {
      g.fillStyle = `rgba(${pal.line},0.14)`;
      g.fill(p, 'evenodd');
      g.strokeStyle = `rgb(${pal.line})`;
      g.lineWidth = o.lw ?? Math.max(1, G.r * 0.008);
      g.stroke(p);
      g.beginPath(); g.arc(0, 0, G.r * 0.14, 0, TAU); g.stroke();
    }
  }

  // ---------- Motion helpers ----------
  // Stepped rotation: advance `amount` every `period` seconds, eased over `dur`.
  function stepped(t, period, dur, amount, offset = 0) {
    const u = t / period + offset, n = Math.floor(u);
    return amount * (n + ease.inOut(clamp((u - n) * period / dur)));
  }

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
        drift: 14, seed: 1, beat: { period: 2, dur: 0.7, teeth: 0.25 }, parts: [],
      }, o);
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
        p.G = gearDims(p.pitch, p.teeth);
        if (p.mesh == null) { p.x = p.x ?? 0; p.y = p.y ?? 0; p.theta = p.theta ?? 0; p.dir = p.dir ?? 1; continue; }
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
      const { blur, res } = this;
      const lw = 1.2;
      for (const p of this.parts) {
        if (p.type === 'gear') {
          p.sp = bake(p.G.r, S, res, blur, g => drawGear(g, p.G, p, pal));
        } else if (p.type === 'dial') {
          const col = `rgb(${pal.line})`;
          const paint = fn => g => { g.strokeStyle = g.fillStyle = col; fn(g); };
          const w = Math.max(lw, p.r * 0.004);
          p.rings = [];
          p.rings.push({ sp: bake(p.r, S, res, blur, paint(g => drawChapter(g, p.r, w, p.numerals !== false))), turn: p.turn ?? 0 });
          if (p.ring24) p.rings.push({ sp: bake(p.r * 0.72, S, res, blur, paint(g => drawRing24(g, p.r * 0.72, w))), turn: -(p.turn ?? 1) * 0.7 });
          if (p.track !== false) p.rings.push({ sp: bake(p.r * 0.6, S, res, blur, paint(g => drawTrack(g, p.r * 0.6, w))), turn: (p.turn ?? 1) * 0.4 });
          if (p.hands !== false) {
            p.hand = {
              h: bake(p.r * 0.5, S, res, blur, paint(g => drawHand(g, p.r * 0.48, p.r * 0.028, w * 1.2, 'hour'))),
              m: bake(p.r * 0.76, S, res, blur, paint(g => drawHand(g, p.r * 0.74, p.r * 0.02, w * 1.1, 'minute'))),
            };
            if (p.seconds) p.hand.s = bake(p.r * 0.86, S, res, blur, paint(g => drawHand(g, p.r * 0.84, p.r * 0.012, w * 0.9, 'second')));
          }
        }
      }
    }

    // cam: smoothed cursor/idle offset in [-1, 1]; shifts: worldline shift start times.
    draw(ctx, view, t, cam, now, shifts) {
      const P = 38;
      const dx = Math.sin(t / 97 + this.seed) * this.drift + Math.sin(t / 41 + this.seed * 3) * this.drift * 0.35;
      const dy = Math.cos(t / 113 + this.seed * 2) * this.drift * 0.7;
      const ox = this.x + dx - cam.x * P * this.depth;
      const oy = this.y + dy - cam.y * P * this.depth * 0.7;
      const look = 0.05 * (1 + Math.abs(this.depth));
      const base = Mat.mul(
        [view.S, 0, 0, view.S, view.ox, view.oy],
        Mat.mul(Mat.T(ox, oy), Mat.mul(Mat.R(this.roll), Mat.tilt(this.rx + cam.y * look, this.ry - cam.x * look))),
      );
      // Gear train phase in teeth: escapement steps plus worldline kicks.
      const b = this.beat;
      const phase = stepped(t, b.period, b.dur, b.teeth, this.seed * 0.37) + this.kick.value(t, shifts);
      ctx.globalAlpha = this.alpha;
      const handAlpha = this.alpha * (this.hands ?? 1);
      const put = (sp, m) => {
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        ctx.drawImage(sp.c, -sp.half, -sp.half, sp.half * 2, sp.half * 2);
      };
      for (const p of this.parts) {
        const at = Mat.mul(base, Mat.T(p.x || 0, p.y || 0));
        if (p.type === 'gear') {
          put(p.sp, Mat.mul(at, Mat.R(p.theta + p.dir * phase * p.G.step)));
        } else if (p.type === 'dial') {
          p.rings.forEach((rg, i) => {
            const a = stepped(t, 7 + i * 2.3, 1.6, rg.turn * TAU / 60, this.seed + i) + p.ringKicks[i].value(t, shifts);
            put(rg.sp, Mat.mul(at, Mat.R(a)));
          });
          if (p.hand) {
            // `tz` pins a dial to a UTC offset (hours); otherwise it shows local time.
            const shiftMin = p.tz == null ? 0 : p.tz * 60 + now.getTimezoneOffset();
            const d = new Date(now.getTime() + shiftMin * 60e3);
            const ms = d.getMilliseconds(), s = d.getSeconds(), m = d.getMinutes(), h = d.getHours() % 12;
            const secPos = s + ease.tick(clamp(ms / 220));
            const minPos = m - 1 + ease.inOut(clamp((s + ms / 1000) / 0.9));
            const hourPos = h + m / 60 + s / 3600;
            const [kh, km, ks] = p.handKicks.map(k => k.value(t, shifts));
            ctx.globalAlpha = handAlpha;
            put(p.hand.h, Mat.mul(at, Mat.R(hourPos / 12 * TAU + kh)));
            put(p.hand.m, Mat.mul(at, Mat.R(minPos / 60 * TAU + km)));
            if (p.hand.s) put(p.hand.s, Mat.mul(at, Mat.R(secPos / 60 * TAU + ks)));
            ctx.globalAlpha = this.alpha;
          }
        }
      }
    }
  }

  return { Assembly, PALETTES, Mat, gearDims };
})();
