// Procedural drawing kit for the divergence-meter mockups.
// Everything here is drawn from code: no images, no fonts beyond system serif.
const SG = (() => {
  const TAU = Math.PI * 2;

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

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Draw into a scratch layer, then composite it with blur/alpha (depth of field).
  function layer(ctx, draw, { blur = 0, alpha = 1, op = 'source-over', mask = null } = {}) {
    const c = makeCanvas(ctx.canvas.width, ctx.canvas.height);
    const g = c.getContext('2d');
    draw(g);
    if (mask) { g.globalCompositeOperation = 'destination-in'; mask(g); }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = op;
    if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }

  const THEMES = {
    warm: { core: '#ffe6c2', hot: '#ff7420', glow: '255,104,24', haze: '255,90,20', metal: '150,118,92', dial: '196,170,140' },
    cold: { core: '#f4f7ff', hot: '#b9c8e0', glow: '190,208,236', haze: '170,190,220', metal: '120,126,138', dial: '170,178,190' },
  };

  // ---------- Nixie digits (unit height 1, width 0.56) ----------
  const DW = 0.56;
  const digitCache = {};
  function digitPath(ch) {
    if (digitCache[ch]) return digitCache[ch];
    const p = new Path2D();
    switch (ch) {
      case '0': p.ellipse(0.28, 0.5, 0.28, 0.5, 0, 0, TAU); break;
      case '1': p.moveTo(0.12, 0.13); p.lineTo(0.3, 0); p.lineTo(0.3, 1); break;
      case '2': p.moveTo(0.02, 0.27); p.arc(0.28, 0.27, 0.26, Math.PI, TAU + 0.35);
        p.quadraticCurveTo(0.42, 0.62, 0.0, 1); p.lineTo(0.56, 1); break;
      case '3': p.moveTo(0.04, 0); p.lineTo(0.52, 0); p.lineTo(0.22, 0.4); p.arc(0.28, 0.69, 0.29, -1.77, 2.55); break;
      case '4': p.moveTo(0.42, 1); p.lineTo(0.42, 0); p.lineTo(0, 0.68); p.lineTo(0.56, 0.68); break;
      case '5': p.moveTo(0.52, 0); p.lineTo(0.08, 0); p.lineTo(0.05, 0.45); p.arc(0.28, 0.69, 0.29, -2.35, 2.55); break;
      case '6': p.moveTo(0.47, 0.02); p.quadraticCurveTo(0.02, 0.22, 0.0, 0.7);
        p.moveTo(0.56, 0.7); p.arc(0.28, 0.7, 0.28, 0, TAU); break;
      case '7': p.moveTo(0, 0); p.lineTo(0.56, 0); p.lineTo(0.14, 1); break;
      case '8': p.moveTo(0.495, 0.225); p.arc(0.28, 0.225, 0.215, 0, TAU);
        p.moveTo(0.56, 0.72); p.arc(0.28, 0.72, 0.28, 0, TAU); break;
      case '9': p.moveTo(0.56, 0.3); p.arc(0.28, 0.3, 0.28, 0, TAU);
        p.moveTo(0.56, 0.3); p.quadraticCurveTo(0.54, 0.78, 0.09, 0.98); break;
      case '.': p.moveTo(0.32, 0.95); p.arc(0.28, 0.95, 0.04, 0, TAU); break;
    }
    return (digitCache[ch] = p);
  }
  // Physical stacking order of cathodes, front to back.
  const STACK = ['1', '6', '2', '7', '5', '0', '4', '9', '8', '3'];

  function strokeDigit(ctx, ch, x, y, H, lwPx, style) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(H, H);
    ctx.lineWidth = lwPx / H;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = style;
    ctx.stroke(digitPath(ch));
    ctx.restore();
  }

  function envelopePath(x, y, w, h) {
    const p = new Path2D();
    p.moveTo(x, y + h);
    p.lineTo(x, y + w / 2);
    p.arc(x + w / 2, y + w / 2, w / 2, Math.PI, TAU);
    p.lineTo(x + w, y + h);
    p.closePath();
    return p;
  }

  function hexMesh(x, y, w, h, s) {
    const p = new Path2D();
    const dx = Math.sqrt(3) * s, dy = 1.5 * s;
    for (let row = -1, cy = y; cy < y + h + s; row++, cy += dy) {
      const off = (row & 1) ? dx / 2 : 0;
      for (let cx = x - dx + off; cx < x + w + dx; cx += dx) {
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + k * Math.PI / 3;
          const px = cx + s * Math.cos(a), py = cy + s * Math.sin(a);
          k ? p.lineTo(px, py) : p.moveTo(px, py);
        }
        p.closePath();
      }
    }
    return p;
  }

  // Geometry of one tube, shared by all passes.
  function tubeGeom(x, y, w, h) {
    const Hd = h * 0.46, Wd = Hd * DW;
    return {
      x, y, w, h, Hd,
      dx: x + (w - Wd) / 2, dy: y + h * 0.39,
      inner: { x: x + w * 0.12, y: y + h * 0.31, w: w * 0.76, h: h * 0.61 },
      env: envelopePath(x, y, w, h),
    };
  }

  function tubeBack(ctx, t, ch, th, lit) {
    const { x, y, w, h, Hd } = t;
    ctx.save();
    // Glass body: slightly brighter at the grazing edges, giving a cylinder read.
    const gb = ctx.createLinearGradient(x, 0, x + w, 0);
    gb.addColorStop(0, 'rgba(255,236,214,0.045)');
    gb.addColorStop(0.18, 'rgba(255,236,214,0.012)');
    gb.addColorStop(0.82, 'rgba(255,236,214,0.012)');
    gb.addColorStop(1, 'rgba(255,236,214,0.035)');
    ctx.fillStyle = gb;
    ctx.fill(t.env);
    ctx.clip(t.env);
    // Warm light filling the tube interior.
    if (lit > 0) {
      const cx = x + w / 2, cy = t.dy + Hd / 2;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.55);
      rg.addColorStop(0, `rgba(${th.glow},${0.10 * lit})`);
      rg.addColorStop(1, `rgba(${th.glow},0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(x, y, w, h);
    }
    // Getter flash at the crown.
    const gg = ctx.createRadialGradient(x + w / 2, y + w * 0.12, 0, x + w / 2, y + w * 0.12, w * 0.55);
    gg.addColorStop(0, 'rgba(120,118,124,0.16)');
    gg.addColorStop(1, 'rgba(120,118,124,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(x, y, w, w);
    // Support rods and mica spacers.
    ctx.strokeStyle = `rgba(${th.metal},0.16)`;
    ctx.lineWidth = Math.max(1, w * 0.018);
    for (const fx of [0.09, 0.91]) {
      ctx.beginPath(); ctx.moveTo(x + w * fx, y + h * 0.26); ctx.lineTo(x + w * fx, y + h); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(210,198,178,0.05)';
    ctx.fillRect(x + w * 0.05, y + h * 0.268, w * 0.9, h * 0.012);
    ctx.fillRect(x + w * 0.05, y + h * 0.935, w * 0.9, h * 0.012);
    // Unlit cathode stack, each layer a hair smaller and dimmer.
    STACK.slice().reverse().forEach((d, i, arr) => {
      if (d === ch) return;
      const k = arr.length - 1 - i;
      const s = 1 - k * 0.012;
      const ox = t.dx + (Hd * DW) * (1 - s) / 2, oy = t.dy + Hd * (1 - s) / 2;
      const a = 0.12 - k * 0.007 + 0.05 * lit;
      strokeDigit(ctx, d, ox, oy, Hd * s, Math.max(1, Hd * 0.022), `rgba(${th.metal},${a})`);
    });
    ctx.restore();
  }

  function tubeLit(g, t, ch, th, lit) {
    if (lit <= 0) return;
    g.save();
    g.globalAlpha = lit;
    strokeDigit(g, ch, t.dx, t.dy, t.Hd, t.Hd * 0.06, th.hot);
    strokeDigit(g, ch, t.dx, t.dy, t.Hd, t.Hd * 0.024, th.core);
    g.restore();
  }

  function tubeMesh(ctx, t, th, lit) {
    const { inner, Hd } = t;
    ctx.save();
    const clip = new Path2D();
    clip.roundRect(inner.x, inner.y, inner.w, inner.h, t.w * 0.04);
    ctx.clip(clip);
    const mesh = hexMesh(inner.x, inner.y, inner.w, inner.h, t.w * 0.05);
    ctx.lineWidth = Math.max(0.8, t.w * 0.012);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.stroke(mesh);
    const cx = t.x + t.w / 2, cy = t.dy + Hd / 2;
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Hd * 0.75);
    rg.addColorStop(0, `rgba(${th.glow},${0.07 + 0.22 * lit})`);
    rg.addColorStop(1, `rgba(${th.metal},0.07)`);
    ctx.lineWidth = Math.max(0.5, t.w * 0.007);
    ctx.strokeStyle = rg;
    ctx.stroke(mesh);
    ctx.restore();
  }

  function tubeFront(ctx, t, th, lit) {
    const { x, y, w, h } = t;
    ctx.save();
    ctx.clip(t.env);
    // Left specular stripe.
    const sg = ctx.createLinearGradient(x + w * 0.08, 0, x + w * 0.2, 0);
    sg.addColorStop(0, 'rgba(255,245,232,0)');
    sg.addColorStop(0.45, 'rgba(255,245,232,0.085)');
    sg.addColorStop(1, 'rgba(255,245,232,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(x + w * 0.08, y + w * 0.35, w * 0.12, h - w * 0.45);
    // Right faint stripe.
    const sr = ctx.createLinearGradient(x + w * 0.84, 0, x + w * 0.9, 0);
    sr.addColorStop(0, 'rgba(255,245,232,0)');
    sr.addColorStop(0.5, 'rgba(255,245,232,0.04)');
    sr.addColorStop(1, 'rgba(255,245,232,0)');
    ctx.fillStyle = sr;
    ctx.fillRect(x + w * 0.84, y + w * 0.4, w * 0.06, h - w * 0.5);
    ctx.restore();
    // Dome highlight.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,245,232,0.11)';
    ctx.lineWidth = w * 0.035;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + w / 2, w * 0.36, Math.PI * 1.12, Math.PI * 1.38);
    ctx.stroke();
    // Envelope edge, warmed by the glow.
    ctx.lineWidth = Math.max(1, w * 0.012);
    ctx.strokeStyle = `rgba(255,232,206,0.07)`;
    ctx.stroke(t.env);
    if (lit > 0) {
      ctx.strokeStyle = `rgba(${th.glow},${0.10 * lit})`;
      ctx.stroke(t.env);
    }
    // Exhaust tip.
    ctx.fillStyle = 'rgba(255,240,220,0.08)';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.46, y - h * 0.018, w * 0.08, h * 0.026, w * 0.04);
    ctx.fill();
    ctx.restore();
  }

  // Full divergence meter. Returns layout info for callers (reflections, haze).
  function drawMeter(ctx, o) {
    const th = THEMES[o.theme || 'warm'];
    const text = o.text || '1.048596';
    const n = text.length, h = o.tubeH, w = h * 0.37, gap = h * 0.07;
    const total = n * w + (n - 1) * gap;
    const x0 = o.cx - total / 2, y0 = o.cy - h / 2;
    const lit = o.lit ?? 1;
    const base = y0 + h;
    const tubes = [...text].map((ch, i) => ({ ch, t: tubeGeom(x0 + i * (w + gap), y0, w, h) }));

    // Soft shadow so background linework never tangles with the digits.
    if (o.shadow !== false) {
      ctx.save();
      ctx.translate(o.cx, o.cy + h * 0.1);
      ctx.scale(1, (h * 1.1) / total);
      const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, total * 0.75);
      sh.addColorStop(0, 'rgba(3,2,2,0.92)');
      sh.addColorStop(0.6, 'rgba(3,2,2,0.6)');
      sh.addColorStop(1, 'rgba(3,2,2,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(-total, -total, total * 2, total * 2);
      ctx.restore();
    }

    // Plinth.
    if (o.plinth !== false) {
      const px = x0 - w * 0.55, pw = total + w * 1.1, py = base + h * 0.03, ph = h * 0.15;
      const pg = ctx.createLinearGradient(0, py, 0, py + ph);
      pg.addColorStop(0, '#16110d');
      pg.addColorStop(0.1, '#0e0b09');
      pg.addColorStop(1, '#070605');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.roundRect(px, py, pw, ph, h * 0.012); ctx.fill();
      const eg = ctx.createLinearGradient(px, 0, px + pw, 0);
      eg.addColorStop(0, `rgba(${th.glow},0)`);
      eg.addColorStop(0.5, `rgba(${th.glow},${0.22 * lit})`);
      eg.addColorStop(1, `rgba(${th.glow},0)`);
      ctx.fillStyle = eg;
      ctx.fillRect(px + h * 0.01, py, pw - h * 0.02, Math.max(1, h * 0.006));
      // Glow pooling on the top surface under each tube.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const { ch, t } of tubes) {
        if (ch === '.') continue;
        const cx = t.x + w / 2;
        const rg = ctx.createRadialGradient(cx, py, 0, cx, py, w * 0.9);
        rg.addColorStop(0, `rgba(${th.glow},${0.07 * lit})`);
        rg.addColorStop(1, `rgba(${th.glow},0)`);
        ctx.fillStyle = rg;
        ctx.fillRect(cx - w, py, w * 2, ph * 0.5);
      }
      ctx.restore();
    }

    for (const { ch, t } of tubes) tubeBack(ctx, t, ch, th, lit);

    const glow = makeCanvas(ctx.canvas.width, ctx.canvas.height);
    const g = glow.getContext('2d');
    for (const { ch, t } of tubes) tubeLit(g, t, ch, th, lit);
    ctx.drawImage(glow, 0, 0);

    for (const { ch, t } of tubes) if (ch !== '.') tubeMesh(ctx, t, th, lit);

    // Bloom: three blurred copies added on top of the mesh.
    const Hd = h * 0.46;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [b, a] of [[Hd * 0.55, 0.55], [Hd * 0.16, 0.7], [Hd * 0.045, 0.85]]) {
      ctx.filter = `blur(${b}px)`;
      ctx.globalAlpha = a;
      ctx.drawImage(glow, 0, 0);
    }
    ctx.restore();

    for (const { t } of tubes) tubeFront(ctx, t, th, lit);

    // Sockets.
    for (const { t } of tubes) {
      const sx = t.x - w * 0.03, sy = base - h * 0.035, sw = w * 1.06, sh = h * 0.065;
      const sgr = ctx.createLinearGradient(0, sy, 0, sy + sh);
      sgr.addColorStop(0, '#1a1511');
      sgr.addColorStop(1, '#0a0807');
      ctx.fillStyle = sgr;
      ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, w * 0.05); ctx.fill();
      ctx.fillStyle = `rgba(${th.glow},${0.12 * lit})`;
      ctx.fillRect(sx + w * 0.08, sy, sw - w * 0.16, 1);
    }

    // Haze around the whole row.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hz = ctx.createRadialGradient(o.cx, o.cy, 0, o.cx, o.cy, total * 0.85);
    hz.addColorStop(0, `rgba(${th.haze},${0.05 * lit})`);
    hz.addColorStop(0.5, `rgba(${th.haze},${0.018 * lit})`);
    hz.addColorStop(1, `rgba(${th.haze},0)`);
    ctx.fillStyle = hz;
    ctx.fillRect(o.cx - total, o.cy - total, total * 2, total * 2);
    ctx.restore();

    return { x0, y0, total, h, w, base, plinthBottom: base + h * 0.18 };
  }

  // ---------- Clock faces ----------
  const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

  function drawClock(ctx, o) {
    const { x, y, r } = o;
    const col = o.col || THEMES.warm.dial;
    const a = o.alpha ?? 0.12;
    const lw = o.lw ?? Math.max(1, r * 0.004);
    const rot = o.rot || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = `rgba(${col},${a})`;
    ctx.fillStyle = `rgba(${col},${a})`;
    ctx.lineCap = 'round';

    const ring = (rr, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke(); };
    ring(r, lw * 1.8);
    ring(r * 0.972, lw * 0.6);

    ctx.save();
    ctx.rotate(rot);
    // Minute / hour ticks.
    for (let i = 0; i < 60; i++) {
      const ang = i / 60 * TAU;
      const hour = i % 5 === 0;
      const r0 = hour ? r * 0.885 : r * 0.925, r1 = r * 0.958;
      ctx.lineWidth = hour ? lw * 2.2 : lw * 0.8;
      ctx.beginPath();
      ctx.moveTo(Math.sin(ang) * r0, -Math.cos(ang) * r0);
      ctx.lineTo(Math.sin(ang) * r1, -Math.cos(ang) * r1);
      ctx.stroke();
    }
    // Numerals, radially set.
    if (o.numerals !== false) {
      ctx.font = `${r * 0.105}px "Times New Roman", Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 12; i++) {
        ctx.save();
        ctx.rotate(i / 12 * TAU);
        ctx.translate(0, -r * 0.79);
        ctx.fillText(ROMAN[i], 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();

    // Inner chapter ring with fine track.
    if (o.inner !== false) {
      ring(r * 0.68, lw * 0.7);
      ring(r * 0.655, lw * 0.4);
      ctx.lineWidth = lw * 0.5;
      for (let i = 0; i < 120; i++) {
        const ang = i / 120 * TAU + rot * -0.5;
        const r0 = r * 0.655, r1 = r * (i % 10 === 0 ? 0.68 : 0.667);
        ctx.beginPath();
        ctx.moveTo(Math.sin(ang) * r0, -Math.cos(ang) * r0);
        ctx.lineTo(Math.sin(ang) * r1, -Math.cos(ang) * r1);
        ctx.stroke();
      }
    }

    // Hands.
    if (o.hands !== false) {
      const t = o.time ?? 10 * 3600 + 8 * 60 + 36;
      const hA = (t / 43200) * TAU, mA = ((t % 3600) / 3600) * TAU, sA = ((t % 60) / 60) * TAU;
      hand(ctx, hA, r * 0.46, r * 0.03, lw, a, col, true);
      hand(ctx, mA, r * 0.72, r * 0.02, lw, a, col, true);
      ctx.save();
      ctx.rotate(sA);
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath(); ctx.moveTo(0, r * 0.16); ctx.lineTo(0, -r * 0.86); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, r * 0.12, r * 0.022, 0, TAU); ctx.stroke();
      ctx.restore();
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.022, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.006, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // Outlined leaf hand with a Breguet-style open moon near the tip.
  function hand(ctx, ang, len, hw, lw, a, col, moon) {
    ctx.save();
    ctx.rotate(ang);
    ctx.lineWidth = lw;
    ctx.strokeStyle = `rgba(${col},${a})`;
    const mr = hw * 1.6, my = -len * 0.72;
    ctx.beginPath();
    ctx.moveTo(0, len * 0.08);
    ctx.quadraticCurveTo(hw, -len * 0.2, hw * 0.45, my + mr);
    ctx.moveTo(0, len * 0.08);
    ctx.quadraticCurveTo(-hw, -len * 0.2, -hw * 0.45, my + mr);
    ctx.stroke();
    if (moon) { ctx.beginPath(); ctx.arc(0, my, mr, 0, TAU); ctx.stroke(); }
    ctx.beginPath();
    ctx.moveTo(hw * 0.45, my - mr);
    ctx.lineTo(0, -len);
    ctx.lineTo(-hw * 0.45, my - mr);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- Gears ----------
  function gearPath(o) {
    const { x, y, r, teeth } = o;
    const depth = o.depth ?? r * 0.08;
    const rt = r, rr = r - depth;
    const step = TAU / teeth, ang = o.angle || 0;
    const p = new Path2D();
    for (let i = 0; i < teeth; i++) {
      const a0 = ang + i * step;
      const pts = [[rr, a0], [rt, a0 + step * 0.22], [rt, a0 + step * 0.48], [rr, a0 + step * 0.7]];
      pts.forEach(([rad, aa], k) => {
        const px = x + Math.cos(aa) * rad, py = y + Math.sin(aa) * rad;
        (i === 0 && k === 0) ? p.moveTo(px, py) : p.lineTo(px, py);
      });
      p.arc(x, y, rr, a0 + step * 0.7, a0 + step);
    }
    p.closePath();
    const spokes = o.spokes ?? 5;
    if (spokes > 0) {
      const ri = rr - r * 0.1, rh = r * 0.24, sw = r * 0.055;
      for (let i = 0; i < spokes; i++) {
        const s0 = ang + i * TAU / spokes, s1 = s0 + TAU / spokes;
        const dO = Math.asin(Math.min(1, sw / ri)), dI = Math.asin(Math.min(1, sw / rh));
        p.moveTo(x + Math.cos(s0 + dO) * ri, y + Math.sin(s0 + dO) * ri);
        p.arc(x, y, ri, s0 + dO, s1 - dO);
        p.arc(x, y, rh, s1 - dI, s0 + dI, true);
        p.closePath();
      }
    }
    const bore = r * 0.07;
    p.moveTo(x + bore, y);
    p.arc(x, y, bore, 0, TAU);
    return p;
  }

  function drawGear(ctx, o) {
    const col = o.col || THEMES.warm.dial;
    const a = o.alpha ?? 0.12;
    const p = gearPath(o);
    ctx.save();
    ctx.fillStyle = `rgba(${col},${a * (o.fill ?? 0.18)})`;
    ctx.fill(p, 'evenodd');
    ctx.strokeStyle = `rgba(${col},${a})`;
    ctx.lineWidth = o.lw ?? Math.max(1, o.r * 0.008);
    ctx.lineJoin = 'round';
    ctx.stroke(p);
    // Hub ring.
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.13, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // ---------- Atmosphere ----------
  function background(ctx, o = {}) {
    const { width: W, height: H } = ctx.canvas;
    ctx.fillStyle = '#040303';
    ctx.fillRect(0, 0, W, H);
    if (o.warmAt) {
      const [cx, cy, rad] = o.warmAt;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(30,16,9,0.3)');
      g.addColorStop(1, 'rgba(30,16,9,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function dust(ctx, o = {}) {
    const { width: W, height: H } = ctx.canvas;
    const r = rng(o.seed ?? 7);
    const n = o.count ?? 220;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, s = 0.6 + r() ** 3 * 2.4;
      const a = 0.03 + r() * 0.1;
      ctx.fillStyle = `rgba(255,214,170,${a})`;
      ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
    }
    // A few out-of-focus motes near the light.
    if (o.near) {
      const [cx, cy, rad] = o.near;
      ctx.filter = 'blur(6px)';
      for (let i = 0; i < (o.bokeh ?? 7); i++) {
        const ang = r() * TAU, d = rad * (0.4 + r() * 0.8);
        const x = cx + Math.cos(ang) * d * 1.6, y = cy + Math.sin(ang) * d * 0.7, s = 4 + r() * 10;
        ctx.fillStyle = `rgba(255,150,80,${0.025 + r() * 0.04})`;
        ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  function vignette(ctx, strength = 0.85) {
    const { width: W, height: H } = ctx.canvas;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Fine additive noise so dark gradients don't band on 8-bit panels.
  function dither(ctx, amt = 0.018) {
    const n = makeCanvas(256, 256), g = n.getContext('2d');
    const img = g.createImageData(256, 256), r = rng(99);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = amt;
    ctx.fillStyle = ctx.createPattern(n, 'repeat');
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  function stage(w = 2560, h = 1440) {
    const c = document.getElementById('c');
    c.width = w; c.height = h;
    return c.getContext('2d');
  }

  return { TAU, rng, makeCanvas, layer, THEMES, drawMeter, drawClock, drawGear, background, dust, vignette, dither, stage };
})();
