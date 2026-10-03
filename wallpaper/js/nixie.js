'use strict';
// Nixie divergence meter: the glowing digits, shown on their own or in their tubes.
// Every static layer is rendered once into a sprite at device resolution; a frame
// only composites cached sprites with per-tube alpha, so the meter is cheap to run.
const Nixie = (() => {
  const { TAU, canvas, hash, noise, clamp, smooth } = Kit;

  const THEMES = {
    warm: { core: '#ffe6c2', hot: '#ff7420', glow: '255,104,24', metal: '150,118,92' },
    cold: { core: '#ffffff', hot: '#c4d2ec', glow: '186,204,236', metal: '124,130,142' },
  };
  const STREAK = 0.16; // strength of the anamorphic streak at normal brightness

  // ---------- Digit glyphs (unit height 1, width 0.56) ----------
  const DW = 0.56;
  const paths = {};
  function digitPath(ch) {
    if (paths[ch]) return paths[ch];
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
    return (paths[ch] = p);
  }
  const GLYPHS = '0123456789.';
  // Physical stacking order of the cathodes, front to back.
  const STACK = ['1', '6', '2', '7', '5', '0', '4', '9', '8', '3'];

  function strokeDigit(g, ch, x, y, H, lw, style) {
    g.save();
    g.translate(x, y);
    g.scale(H, H);
    g.lineWidth = lw / H;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = style;
    g.stroke(digitPath(ch));
    g.restore();
  }

  // ---------- Tube geometry (local coords, origin at envelope top-left) ----------
  function geometry(h, aspect) {
    const w = h * aspect;
    const Hd = Math.min(h * 0.5, w * 1.25);
    const dy = h * 0.62 - Hd / 2;
    const env = new Path2D();
    env.moveTo(0, h);
    env.lineTo(0, w / 2);
    env.arc(w / 2, w / 2, w / 2, Math.PI, TAU);
    env.lineTo(w, h);
    env.closePath();
    return {
      w, h, Hd, dy, dx: (w - Hd * DW) / 2, env,
      inner: { x: w * 0.12, y: dy - h * 0.06, w: w * 0.76, h: Hd + h * 0.11 },
      micaTop: dy - h * 0.09, micaBot: dy + Hd + h * 0.07,
    };
  }

  function hexMesh(x, y, w, h, s) {
    const p = new Path2D();
    const dx = Math.sqrt(3) * s, dy = 1.5 * s;
    for (let row = -1, cy = y - dy; cy < y + h + s; row++, cy += dy) {
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

  // ---------- Sprites ----------
  // A sprite covers a design-space box [-pad, size+pad], rendered at S*res device px per unit.
  function sprite(wD, hD, pad, S, draw, res = 1) {
    const k = S * res;
    const c = canvas((wD + 2 * pad) * k, (hD + 2 * pad) * k);
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, pad * k, pad * k);
    draw(g);
    return { c, ox: -pad, oy: -pad, res };
  }

  function blurInto(dst, src, sigma, alpha) {
    const g = dst.getContext('2d');
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha;
    g.filter = sigma > 0 ? `blur(${sigma}px)` : 'none';
    g.drawImage(src, 0, 0, dst.width, dst.height);
    g.restore();
  }

  // `spread` scales how far each lit cathode's bloom reaches; without `tubes`, the glass
  // is left out and the mesh fades out softly at its edges.
  function buildTube(G, th, S, spread = 1, tubes = true) {
    const { w, h, Hd } = G;
    const pad = 4;
    const sp = {};
    if (tubes) buildGlass(G, th, S, sp, pad);

    // Unlit cathode stack; each layer a hair smaller and dimmer.
    sp.stack = sprite(w, h, pad, S, g => {
      for (let k = STACK.length - 1; k >= 0; k--) {
        const s = 1 - k * 0.012;
        const ox = G.dx + Hd * DW * (1 - s) / 2, oy = G.dy + Hd * (1 - s) / 2;
        strokeDigit(g, STACK[k], ox, oy, Hd * s, Math.max(0.8, Hd * 0.022), `rgba(${th.metal},${0.15 - k * 0.007})`);
      }
    });
    buildMesh(G, th, S, sp, pad, !tubes);

    // Lit cathodes: a crisp core sprite and a separate low-res bloom sprite per glyph.
    sp.lit = {};
    sp.bloom = {};
    for (const ch of GLYPHS) {
      const drawGlyph = g => {
        strokeDigit(g, ch, G.dx, G.dy, Hd, Hd * 0.06, th.hot);
        strokeDigit(g, ch, G.dx, G.dy, Hd, Hd * 0.024, th.core);
      };
      const lp = Hd * 0.2;
      const base = sprite(w, h, lp, S, drawGlyph);
      const lit = canvas(base.c.width, base.c.height);
      blurInto(lit, base.c, 0, 1);
      blurInto(lit, base.c, Hd * 0.045 * S, 0.85);
      sp.lit[ch] = { c: lit, ox: -lp, oy: -lp, res: 1 };

      const bp = Hd * 1.8 * Math.max(1, spread), br = 0.5;
      const bbase = sprite(w, h, bp, S, drawGlyph, br);
      const bloom = canvas(bbase.c.width, bbase.c.height);
      blurInto(bloom, bbase.c, Hd * 0.16 * S * br * spread, 0.7);
      blurInto(bloom, bbase.c, Hd * 0.55 * S * br * spread, 0.55);
      sp.bloom[ch] = { c: bloom, ox: -bp, oy: -bp, res: br };
    }
    return sp;
  }

  // The tube around the digits: glass, rods, spacers and the warm interior.
  function buildGlass(G, th, S, sp, pad) {
    const { w, h, Hd } = G;
    sp.back = sprite(w, h, pad, S, g => {
      const gb = g.createLinearGradient(0, 0, w, 0);
      gb.addColorStop(0, 'rgba(255,236,214,0.045)');
      gb.addColorStop(0.18, 'rgba(255,236,214,0.012)');
      gb.addColorStop(0.82, 'rgba(255,236,214,0.012)');
      gb.addColorStop(1, 'rgba(255,236,214,0.035)');
      g.fillStyle = gb;
      g.fill(G.env);
      g.clip(G.env);
      // Getter flash at the crown.
      const gg = g.createRadialGradient(w / 2, w * 0.12, 0, w / 2, w * 0.12, w * 0.55);
      gg.addColorStop(0, 'rgba(120,118,124,0.16)');
      gg.addColorStop(1, 'rgba(120,118,124,0)');
      g.fillStyle = gg;
      g.fillRect(0, 0, w, w);
      // Support rods and mica spacers.
      g.strokeStyle = `rgba(${th.metal},0.16)`;
      g.lineWidth = Math.max(0.8, w * 0.018);
      for (const fx of [0.09, 0.91]) {
        g.beginPath(); g.moveTo(w * fx, G.micaTop - h * 0.01); g.lineTo(w * fx, h); g.stroke();
      }
      g.fillStyle = 'rgba(210,198,178,0.05)';
      g.fillRect(w * 0.05, G.micaTop, w * 0.9, h * 0.012);
      g.fillRect(w * 0.05, G.micaBot, w * 0.9, h * 0.012);
    });

    // Warm light filling the interior; scaled by brightness.
    sp.interior = sprite(w, h, pad, S, g => {
      g.clip(G.env);
      const cx = w / 2, cy = G.dy + Hd / 2;
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, h * 0.55);
      rg.addColorStop(0, `rgba(${th.glow},0.10)`);
      rg.addColorStop(1, `rgba(${th.glow},0)`);
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
    }, 0.5);

    sp.front = sprite(w, h, pad, S, g => {
      g.save();
      g.clip(G.env);
      const sg = g.createLinearGradient(w * 0.08, 0, w * 0.2, 0);
      sg.addColorStop(0, 'rgba(255,245,232,0)');
      sg.addColorStop(0.45, 'rgba(255,245,232,0.085)');
      sg.addColorStop(1, 'rgba(255,245,232,0)');
      g.fillStyle = sg;
      g.fillRect(w * 0.08, w * 0.35, w * 0.12, h - w * 0.45);
      const sr = g.createLinearGradient(w * 0.84, 0, w * 0.9, 0);
      sr.addColorStop(0, 'rgba(255,245,232,0)');
      sr.addColorStop(0.5, 'rgba(255,245,232,0.04)');
      sr.addColorStop(1, 'rgba(255,245,232,0)');
      g.fillStyle = sr;
      g.fillRect(w * 0.84, w * 0.4, w * 0.06, h - w * 0.5);
      g.restore();
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,245,232,0.11)';
      g.lineWidth = w * 0.035;
      g.beginPath();
      g.arc(w / 2, w / 2, w * 0.36, Math.PI * 1.12, Math.PI * 1.38);
      g.stroke();
      g.lineWidth = Math.max(0.8, w * 0.012);
      g.strokeStyle = 'rgba(255,232,206,0.07)';
      g.stroke(G.env);
      g.fillStyle = 'rgba(255,240,220,0.08)';
      g.beginPath();
      g.roundRect(w * 0.46, -h * 0.018, w * 0.08, h * 0.026, w * 0.04);
      g.fill();
    });
    sp.edgeLit = sprite(w, h, pad, S, g => {
      g.lineWidth = Math.max(0.8, w * 0.012);
      g.strokeStyle = `rgba(${th.glow},0.10)`;
      g.stroke(G.env);
    });
  }

  // The honeycomb anode in front of the digits: dark where it shades them, faintly lit by
  // them. `soft` fades it out toward its edges, for digits shown without their tubes.
  function buildMesh(G, th, S, sp, pad, soft) {
    const { w, h, Hd, inner } = G;
    const meshClip = new Path2D();
    meshClip.roundRect(inner.x, inner.y, inner.w, inner.h, w * 0.04);
    const mesh = hexMesh(inner.x, inner.y, inner.w, inner.h, w * 0.05);
    const fade = g => {
      if (!soft) return;
      g.globalCompositeOperation = 'destination-in';
      g.translate(w / 2, inner.y + inner.h / 2);
      g.scale(1, inner.h / inner.w);
      const r = inner.w / 2, rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
      rg.addColorStop(0, 'rgba(0,0,0,1)');
      rg.addColorStop(0.55, 'rgba(0,0,0,0.85)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(-r * 2, -r * 2, r * 4, r * 4);
    };
    sp.meshDark = sprite(w, h, pad, S, g => {
      g.save();
      g.clip(meshClip);
      g.lineWidth = Math.max(0.8, w * 0.012);
      g.strokeStyle = 'rgba(0,0,0,0.36)';
      g.stroke(mesh);
      g.lineWidth = Math.max(0.5, w * 0.007);
      g.strokeStyle = `rgba(${th.metal},${soft ? 0.12 : 0.07})`;
      g.stroke(mesh);
      g.restore();
      fade(g);
    });
    sp.meshLit = sprite(w, h, pad, S, g => {
      g.save();
      g.clip(meshClip);
      const cx = w / 2, cy = G.dy + Hd / 2;
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, Hd * 0.75);
      rg.addColorStop(0, `rgba(${th.glow},0.26)`);
      rg.addColorStop(1, `rgba(${th.glow},0)`);
      g.lineWidth = Math.max(0.5, w * 0.007);
      g.strokeStyle = rg;
      g.stroke(mesh);
      g.restore();
      fade(g);
    });
  }

  // The streak's light: a hair-thin line, white-hot at the middle, in a soft band of
  // the glow's colour, both fading toward the ends.
  function streakSprite(th) {
    const w = 512, h = 48, c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    const [r, gr, b] = th.glow.split(',').map(Number);
    const hex = parseInt(th.core.slice(1), 16), cr = hex >> 16, cg = (hex >> 8) & 255, cb = hex & 255;
    for (let y = 0; y < h; y++) {
      const v = (y + 0.5) / h * 2 - 1, thin = Math.exp(-((v / 0.07) ** 2)), soft = Math.exp(-((v / 0.35) ** 2));
      for (let x = 0; x < w; x++) {
        const u = Math.abs((x + 0.5) / w * 2 - 1), along = Math.pow(1 - u, 2.2), hot = thin * (1 - u) ** 3;
        const i = (y * w + x) * 4;
        d[i] = r + (cr - r) * hot; d[i + 1] = gr + (cg - gr) * hot; d[i + 2] = b + (cb - b) * hot;
        d[i + 3] = 255 * along * (0.75 * thin + 0.25 * soft);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Meter-wide sprites: shadow, plinth, sockets, haze. Local origin = first tube top-left.
  function buildFrame(L, th, S, opts) {
    const { total, w, h, xs } = L;
    const base = h;
    const fr = {};
    const px = -w * 0.55, pw = total + w * 1.1, py = base + h * 0.03, ph = h * 0.15;

    fr.under = sprite(total, h * 1.3, total * 0.8, S, g => {
      g.save();
      g.translate(total / 2, h * 0.6);
      g.scale(1, (h * 1.1) / total);
      const sh = g.createRadialGradient(0, 0, 0, 0, 0, total * 0.75);
      sh.addColorStop(0, 'rgba(3,2,2,0.92)');
      sh.addColorStop(0.6, 'rgba(3,2,2,0.6)');
      sh.addColorStop(1, 'rgba(3,2,2,0)');
      g.fillStyle = sh;
      g.fillRect(-total, -total, total * 2, total * 2);
      g.restore();
    }, 0.25);

    fr.plinth = sprite(total, h * 1.3, w, S, g => {
      if (!opts.plinth) return;
      // Dark walnut block: a thin top face catching the light, then the front face.
      const tf = h * 0.03, shape = new Path2D();
      shape.roundRect(px, py, pw, ph, h * 0.012);
      const pg = g.createLinearGradient(0, py, 0, py + ph);
      pg.addColorStop(0, '#2b1d13');
      pg.addColorStop(tf / ph, '#24180f');
      pg.addColorStop(tf / ph + 0.01, '#170f09');
      pg.addColorStop(1, '#0a0705');
      g.fillStyle = pg;
      g.fill(shape);
      g.save();
      g.clip(shape);
      // Grain: long wavy fibres, alternately lighter and darker, never strong.
      const rows = 34;
      for (let k = 0; k < rows; k++) {
        const y0 = py + (k + Kit.hash(k, 5)) / rows * ph;
        const light = Kit.hash(k, 6) < 0.45;
        g.strokeStyle = light ? `rgba(150,104,66,${0.05 + 0.06 * Kit.hash(k, 7)})` : `rgba(0,0,0,${0.18 + 0.2 * Kit.hash(k, 8)})`;
        g.lineWidth = Math.max(0.5, h * (0.0025 + 0.004 * Kit.hash(k, 9)));
        g.beginPath();
        for (let x = px; x <= px + pw; x += 6) {
          const u = (x - px) / pw;
          const y = y0 + (Kit.noise(u * 7 + k * 3.1, 40 + k) - 0.5) * ph * 0.12 + Math.sin(u * 3 + k) * ph * 0.02;
          x === px ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
      }
      // Bevel where the top face meets the front.
      g.fillStyle = 'rgba(190,140,96,0.10)';
      g.fillRect(px, py + tf, pw, Math.max(0.6, h * 0.003));
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(px, py + ph - h * 0.01, pw, h * 0.01);
      g.restore();
    });

    fr.plinthLit = sprite(total, h * 1.3, w, S, g => {
      if (!opts.plinth) return;
      const eg = g.createLinearGradient(px, 0, px + pw, 0);
      eg.addColorStop(0, `rgba(${th.glow},0)`);
      eg.addColorStop(0.5, `rgba(${th.glow},0.22)`);
      eg.addColorStop(1, `rgba(${th.glow},0)`);
      g.fillStyle = eg;
      g.fillRect(px + h * 0.01, py, pw - h * 0.02, Math.max(0.8, h * 0.006));
      for (const x of xs) {
        const cx = x + w / 2;
        const rg = g.createRadialGradient(cx, py, 0, cx, py, w * 0.9);
        rg.addColorStop(0, `rgba(${th.glow},0.06)`);
        rg.addColorStop(1, `rgba(${th.glow},0)`);
        g.fillStyle = rg;
        g.fillRect(cx - w, py, w * 2, ph * 0.5);
      }
    });

    fr.sockets = sprite(total, h * 1.1, w * 0.2, S, g => {
      for (const x of xs) {
        const sx = x - w * 0.03, sy = base - h * 0.035, sw = w * 1.06, sh = h * 0.065;
        const sgr = g.createLinearGradient(0, sy, 0, sy + sh);
        sgr.addColorStop(0, '#1a1511');
        sgr.addColorStop(1, '#0a0807');
        g.fillStyle = sgr;
        g.beginPath(); g.roundRect(sx, sy, sw, sh, w * 0.05); g.fill();
      }
    });
    fr.socketsLit = sprite(total, h * 1.1, w * 0.2, S, g => {
      g.fillStyle = `rgba(${th.glow},0.12)`;
      for (const x of xs) g.fillRect(x + w * 0.05, base - h * 0.035, w * 0.9, Math.max(0.8, h * 0.004));
    });

    // Anamorphic streak: a long thin line of light through the glowing digits, the way a
    // cinema lens draws one across a bright source. Soft, so one small image stretched.
    fr.streak = { c: streakSprite(th), cx: total / 2, cy: h * 0.62, w: total * 2.6, h: h * 0.36 };

    const R = total * 0.85;
    fr.haze = sprite(total, h, R, S, g => {
      const cx = total / 2, cy = h * 0.4;
      g.translate(cx, cy);
      g.scale(1, 0.8);
      g.translate(-cx, -cy);
      const hz = g.createRadialGradient(cx, cy, 0, cx, cy, R);
      hz.addColorStop(0, `rgba(${th.glow},0.05)`);
      hz.addColorStop(0.5, `rgba(${th.glow},0.018)`);
      hz.addColorStop(1, `rgba(${th.glow},0)`);
      g.fillStyle = hz;
      g.fillRect(cx - R, cy - R, R * 2, R * 2);
    }, 0.25);
    return fr;
  }

  // ---------- Meter ----------
  class Meter {
    constructor(o) {
      this.count = o.count ?? 8;
      this.tubeH = o.tubeH ?? 240;
      this.aspect = o.aspect ?? 0.41;
      this.plinth = o.plinth ?? true;
      // Without tubes it is just the numbers, their unlit cathodes and honeycomb: no
      // glass, sockets or base.
      this.tubes = o.tubes ?? true;
      this.cx = o.cx; this.cy = o.cy;
      this.master = 1;
      this.glow = 1; // strength of the bloom, the haze and the streak (1 as designed)
      this.target = ' '.repeat(this.count);
      this.slots = Array.from({ length: this.count }, () => ({ cur: ' ', prev: ' ', at: -1e9 }));
      this.shift = null;
      this.flare = 0;
      this.layout();
    }

    layout() {
      const h = this.tubeH, G = geometry(h, this.aspect), w = G.w, gap = h * 0.03;
      const total = this.count * w + (this.count - 1) * gap;
      this.G = G;
      this.L = { total, w, h, xs: Array.from({ length: this.count }, (_, i) => i * (w + gap)) };
      this.x0 = this.cx - total / 2;
      this.y0 = this.cy - h / 2;
    }

    build(S, themeName, spread = 1) {
      const th = THEMES[themeName] || THEMES.warm;
      this.sp = buildTube(this.G, th, S, spread, this.tubes);
      this.fr = buildFrame(this.L, th, S, { plinth: this.plinth && this.tubes });
    }

    // Begin a worldline shift: every tube scrambles, then settles left to right.
    startShift(t, seed = (Math.random() * 1e9) | 0) {
      const settle = [];
      for (let i = 0; i < this.count; i++) settle.push(0.85 + i * 0.16 + (hash(seed, i) - 0.5) * 0.12);
      this.shift = { start: t, seed, settle, end: Math.max(...settle) + 2.2 };
    }

    // A quick stutter and flare without changing any digit.
    flash(t) { this.flashAt = t; }

    get shifting() { return !!this.shift; }

    charAt(i, t) {
      const s = this.shift;
      if (s) {
        const local = t - s.start, st = s.settle[i];
        if (local < st) {
          const slowAt = st - 0.55;
          const k = local < slowAt ? Math.floor(local * 17) : 10000 + Math.floor((local - slowAt) * 7);
          return String(Math.floor(hash(k * 13 + i, s.seed) * 10));
        }
      }
      return this.target[i] || ' ';
    }

    update(t) {
      if (this.shift && t - this.shift.start > this.shift.end) this.shift = null;
      for (let i = 0; i < this.count; i++) {
        const c = this.charAt(i, t), sl = this.slots[i];
        if (c !== sl.cur) { sl.prev = sl.cur; sl.cur = c; sl.at = t; }
      }
    }

    brightness(i, t) {
      let b = 0.975 + 0.025 * Math.sin(t * TAU / 7.3 + i * 0.4); // slow breathing
      b *= 1 - 0.035 * noise(t * 5, 100 + i);                     // fine flicker
      // Rare, brief dip on a single tube.
      const u = t / 6 + i * 0.37, win = Math.floor(u);
      if (hash(win, 200 + i) < 0.06) {
        const d = hash(win, 300 + i) * 0.9, ph = u - win;
        if (ph > d && ph < d + 0.025) b *= 0.82;
      }
      // Click flash: a quick stutter, then a flare that fades.
      if (this.flashAt != null) {
        const f = t - this.flashAt;
        if (f >= 0 && f < 0.26) b *= hash(Math.floor(f * 40), i + 70) < 0.4 ? 0.3 : 1.1;
        else if (f >= 0.26 && f < 2) b *= 1 + 0.6 * Math.exp(-(f - 0.26) / 0.3);
      }
      const s = this.shift;
      if (s) {
        const local = t - s.start, st = s.settle[i];
        b *= 1 + 0.35 * smooth(0, 0.12, local) * Math.exp(-Math.max(0, local - 0.12) / 1.4);
        if (local < st) b *= 0.86 + 0.14 * hash(Math.floor(local * 23), i + 50);
        else b *= 1 + 0.55 * Math.exp(-(local - st) / 0.22);
      }
      return b * this.master;
    }

    draw(ctx, view, t) {
      const { S, ox, oy } = view;
      const put = (sp, x, y, a = 1) => {
        if (a <= 0.002) return;
        ctx.globalAlpha = Math.min(1, a);
        // No per-sprite rounding: every part shares one sub-pixel offset, so the meter
        // moves as a single rigid object.
        const dx = ox + (x + sp.ox) * S, dy = oy + (y + sp.oy) * S;
        if (sp.res === 1) ctx.drawImage(sp.c, dx, dy);
        else ctx.drawImage(sp.c, dx, dy, sp.c.width / sp.res, sp.c.height / sp.res);
      };
      // Additive layers may exceed 1: draw extra passes for the overflow.
      const add = (sp, x, y, a) => { while (a > 0.002) { put(sp, x, y, a); a -= 1; } };

      const { x0, y0, sp, fr } = this;
      const xs = this.L.xs;
      const B = xs.map((_, i) => this.brightness(i, t));
      const avg = B.reduce((a, b) => a + b, 0) / B.length;

      ctx.save();
      if (!this.tubes) {
        this.drawBare(ctx, view, t, B, avg, put, add);
        ctx.restore();
        return;
      }
      put(fr.under, x0, y0);
      put(fr.plinth, x0, y0);
      ctx.globalCompositeOperation = 'lighter';
      add(fr.plinthLit, x0, y0, avg);
      ctx.globalCompositeOperation = 'source-over';

      for (let i = 0; i < xs.length; i++) { put(sp.back, x0 + xs[i], y0); put(sp.stack, x0 + xs[i], y0); }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < xs.length; i++) add(sp.interior, x0 + xs[i], y0, B[i]);

      // Lit cathodes, with a short afterglow on the one that just switched off.
      const lit = [];
      for (let i = 0; i < xs.length; i++) lit.push(...this.litAt(i, t, B[i]));
      for (let i = 0; i < xs.length; i++) {
        for (const [ch, a] of lit.slice(i * 2, i * 2 + 2)) if (sp.lit[ch]) add(sp.lit[ch], x0 + xs[i], y0, a);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < xs.length; i++) put(sp.meshDark, x0 + xs[i], y0);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < xs.length; i++) add(sp.meshLit, x0 + xs[i], y0, B[i]);
      for (let i = 0; i < xs.length; i++) {
        for (const [ch, a] of lit.slice(i * 2, i * 2 + 2)) if (sp.bloom[ch]) add(sp.bloom[ch], x0 + xs[i], y0, a * this.glow);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < xs.length; i++) put(sp.front, x0 + xs[i], y0);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < xs.length; i++) add(sp.edgeLit, x0 + xs[i], y0, B[i]);
      ctx.globalCompositeOperation = 'source-over';
      put(fr.sockets, x0, y0);
      ctx.globalCompositeOperation = 'lighter';
      add(fr.socketsLit, x0, y0, avg);
      add(fr.haze, x0, y0, avg * this.glow);
      // The streak breathes a little in length and flares with the tubes.
      const st = fr.streak, sw = st.w * (1 + 0.04 * Math.sin(t / 2.7));
      ctx.globalAlpha = Math.min(1, STREAK * avg * avg * this.glow);
      ctx.drawImage(st.c, ox + (x0 + st.cx - sw / 2) * S, oy + (y0 + st.cy - st.h / 2) * S, sw * S, st.h * S);
      ctx.restore();
    }

    // The glyphs lit in tube i and how brightly: the current one, and a short afterglow
    // on the one that just switched off.
    litAt(i, t, b) {
      const sl = this.slots[i], dt = t - sl.at;
      return [[sl.cur, clamp(dt / 0.035) * b], [sl.prev, (1 - clamp(dt / 0.09)) * b]];
    }

    // Just the numbers, as if the tubes were there but not their glass: the faint unlit
    // cathodes behind each digit, the lit digit, the honeycomb in front of it and its
    // bloom, the haze around them and the streak through them.
    drawBare(ctx, view, t, B, avg, put, add) {
      const { S, ox, oy } = view, { x0, y0, sp, fr } = this, xs = this.L.xs, h = this.L.h;
      const lit = xs.map((_, i) => this.litAt(i, t, B[i]).filter(([ch]) => sp.lit[ch]));
      for (const x of xs) put(sp.stack, x0 + x, y0);
      ctx.globalCompositeOperation = 'lighter';
      xs.forEach((x, i) => { for (const [ch, a] of lit[i]) add(sp.lit[ch], x0 + x, y0, a); });
      ctx.globalCompositeOperation = 'source-over';
      for (const x of xs) put(sp.meshDark, x0 + x, y0);
      ctx.globalCompositeOperation = 'lighter';
      xs.forEach((x, i) => {
        add(sp.meshLit, x0 + x, y0, B[i]);
        for (const [ch, a] of lit[i]) add(sp.bloom[ch], x0 + x, y0, a * this.glow);
      });
      // The haze is centred on the tubes; the digits sit lower in them.
      add(fr.haze, x0, y0 + h * 0.22, avg * this.glow);
      const st = fr.streak, sw = st.w * (1 + 0.04 * Math.sin(t / 2.7));
      ctx.globalAlpha = Math.min(1, STREAK * avg * avg * this.glow);
      ctx.drawImage(st.c, ox + (x0 + st.cx - sw / 2) * S, oy + (y0 + st.cy - st.h / 2) * S, sw * S, st.h * S);
    }
  }

  return { Meter, THEMES };
})();
