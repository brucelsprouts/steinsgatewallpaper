'use strict';
// The Makise centrepiece: a picture in place of the nixie meter. It is fitted into the
// left of the frame standing on the bottom edge, graded toward the scene's light and
// faintly backlit, its lower part dissolving into the dark. It floats, bobbing gently and
// drifting against the cursor. Where the picture is rigged (see sway.js) she comes alive:
// her hair sways in the breeze and trails behind her as she moves, her arms swing in her
// jacket from the shoulders with its loose cuffs fluttering, and she breathes, softly. A
// worldline shift tears her into glitching slices for a moment, and a click makes her
// flicker. If no picture can be loaded the meter takes its place.
//
// The picture is img/makise.webp (or .png, or .jpg); without one, the drawn placeholder
// stands in. A PNG with a transparent background looks best, but a plain rectangle is
// feathered into the dark too. Pixels are never read back, so a picture that taints the
// canvas (as local files can in Wallpaper Engine) is fine; it just holds still.
const Portrait = (() => {
  const { canvas, hash, TAU } = Kit;
  // The pictures to try, in order. `crop` is how much of it shows, from the top (the rest
  // would only fade out below the frame); a `cutout` has a transparent background of its
  // own, so only its foot is faded. A `rig` brings it to life: its layers, what lies under
  // them and how far each part sways (made for it alone by tools/swaymap.py), and, in its
  // own pixels, the shoulders its arms hang from, how long they are, and the rows over
  // which the breath eases off from the shoulders to the waist.
  const SOURCES = [
    { src: 'img/makise.webp', crop: 0.6, cutout: true, rig: {
      layers: 'img/makise-layers.png', under: 'img/makise-under.webp', sway: 'img/makise-sway.png',
      shoulders: [[330, 300], [585, 295]], arm: 550, chest: [290, 620],
    } },
    { src: 'img/makise.png' },
    { src: 'img/makise.jpg' },
    { src: 'img/placeholder.webp' },
  ];
  const RIGGING = ['layers', 'under', 'sway'];
  // Where it stands, in design px: centred on `cx`, its foot on `bottom` (a little below
  // the frame, so its lower edge never shows), fitted inside maxW x maxH. `feather`
  // softens the sides and top (a fraction of its size); `fade` dissolves its lower part.
  const BOX = { cx: 600, bottom: 1490, maxW: 1150, maxH: 1260, feather: 0.06, fade: 0.22 };
  // The pool of negative space the scene keeps around it (design px: centre and radii).
  const FOCUS = { x: 600, y: 790, rx: 720, ry: 800 };
  // Grading toward the scene's light, and the colour of the light behind it. Kept dim, so
  // it sits in the scene's shadows rather than glowing out of them.
  const GRADE = {
    warm: { filter: 'saturate(0.88) brightness(0.7) contrast(1.02)', tint: '255,150,80', glow: '255,122,52' },
    cold: { filter: 'saturate(0.8) brightness(0.7) contrast(1.02)', tint: '150,180,255', glow: '176,198,240' },
  };
  const PAD = 0.14; // room around the backlight, a fraction of the picture's size
  // How she moves, in design px and seconds. Her hair and each arm are springs trailing
  // her body: `hz` how fast they swing back, `damp` how soon they settle, `gain` how far
  // their lag shows at full weight (the tips of the hair, the cuffs), `wind` how far the
  // breeze pushes them and `max` about the most they ever move.
  const HAIR = { hz: 0.55, damp: 0.3, gain: 2.2, wind: 4.5, max: 16 };
  const ARMS = [
    { hz: 0.6, damp: 0.4, gain: 1.3, wind: 2, max: 7 },
    { hz: 0.67, damp: 0.4, gain: 1.3, wind: 2, max: 7 },
  ];
  // Each breath lifts her shoulders by `lift` and eases her arms out by `spread` at the cuffs.
  const BREATH = { period: 4.8, lift: 1.1, spread: 0.7 };

  // The breeze at time t: a slow wander, and now and then a gust. `x` is its push (about
  // -2.5..2.5), `gust` how strong a gust is blowing (0..1), and `ripple` how far ripples
  // run down the hair (design px).
  function breeze(t) {
    const wander = 0.6 * Math.sin(t * 0.31) + 0.4 * Math.sin(t * 0.53 + 1.3);
    // About half of all 14 s spans bring a gust, at a random moment, lasting 3-5 s.
    const n = Math.floor(t / 14);
    let gust = 0, dir = 1;
    if (hash(n, 71) < 0.5) {
      const u = (t - n * 14 - hash(n, 72) * 9) / (3 + 2 * hash(n, 73));
      if (u > 0 && u < 1) gust = Math.sin(Math.PI * u) ** 2 * (0.6 + 0.4 * hash(n, 74));
      dir = hash(n, 75) < 0.7 ? 1 : -1;
    }
    return { x: wander + 1.5 * gust * dir, gust, ripple: 0.8 + 1.8 * gust };
  }

  // How full of breath she is at time t (0..1): in quicker than out, every few seconds,
  // never quite in step with itself.
  function breath(t) {
    const u = ((t + 0.7 * Math.sin(t / 17)) / BREATH.period) % 1;
    return u < 0.4 ? 0.5 - 0.5 * Math.cos(Math.PI * u / 0.4) : 0.5 + 0.5 * Math.cos(Math.PI * (u - 0.4) / 0.6);
  }

  // The shown part (the top `crop`) of a picture at W x H, graded toward the scene's light.
  function graded(img, crop, W, H, gr) {
    const sw = img.naturalWidth, sh = img.naturalHeight * crop;
    const c = canvas(W, H), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.filter = gr.filter;
    g.drawImage(img, 0, 0, sw, sh, 0, 0, c.width, c.height);
    g.filter = 'none';
    // Lean its colours toward the scene's light, then give it back its own outline.
    g.globalCompositeOperation = 'soft-light';
    g.fillStyle = `rgba(${gr.tint},0.3)`;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, 0, sw, sh, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  // The shown part of one of a rig's pictures, as it is.
  function cut(img, crop) {
    const W = img.naturalWidth, H = Math.round(img.naturalHeight * crop), c = canvas(W, H);
    c.getContext('2d').drawImage(img, 0, 0, W, H, 0, 0, W, H);
    return c;
  }

  // A spring trailing a moving anchor (design px), pushed sideways by the breeze.
  class Trail {
    constructor(o) { this.o = o; this.x = this.y = this.vx = this.vy = this.bx = this.by = 0; }
    snap(bx, by, w) {
      this.bx = bx; this.by = by; this.vx = this.vy = 0;
      this.x = bx + w * this.o.wind / this.o.gain; this.y = by;
    }
    step(dt, bx, by, w) {
      const o = this.o, k = (TAU * o.hz) ** 2, c = 2 * o.damp * Math.sqrt(k);
      this.vx += (-k * (this.x - bx - w * o.wind / o.gain) - c * this.vx) * dt;
      this.vy += (-k * (this.y - by) - 1.6 * c * this.vy) * dt; // hanging: settles sooner up and down
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.bx = bx; this.by = by;
    }
    // How far it has swung from the anchor, at full weight; big swings ease off toward `max`.
    off() {
      const m = this.o.max, g = this.o.gain;
      return { x: m * Math.tanh(g * (this.x - this.bx) / m), y: m * Math.tanh(g * (this.y - this.by) / m) };
    }
  }

  // One picture: the image, or null if it isn't there or can't be read.
  const fetchImage = src => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });

  class Portrait {
    constructor(sources = SOURCES) {
      this.sources = sources;
      this.ok = null;     // true once loaded, false if nothing could be
      this.ready = null;  // the promise of the above
      this.src = null;    // which picture it is (one of the sources)
      this.img = null;
      this.rig = null;    // its rig's pictures, if it has a rig and all of it fits
      this.sp = null;
      this.hitAt = -1e9;
      this.big = false;
      this.warp = new Sway.Warp();
      this.hair = new Trail(HAIR);
      this.arms = ARMS.map(o => new Trail(o));
      this.last = null;   // when the springs were last stepped, and where the body was
    }

    // Resolves true once a picture is in (the first of the sources that loads, with its
    // rig if it has one), or false if none can be had within a few seconds.
    load() {
      if (this.ready) return this.ready;
      const first = (async () => {
        for (const s of this.sources) {
          const img = await fetchImage(s.src);
          if (!img) continue;
          // A rig counts only if all of it is there, in the picture's proportions.
          const got = s.rig ? await Promise.all(RIGGING.map(k => fetchImage(s.rig[k]))) : [];
          const aspect = img.naturalWidth / img.naturalHeight;
          const fits = got.length && got.every(m => m && Math.abs(m.naturalWidth / m.naturalHeight / aspect - 1) < 0.01);
          return [s, img, fits ? Object.fromEntries(RIGGING.map((k, i) => [k, got[i]])) : null];
        }
        return null;
      })();
      const late = new Promise(resolve => setTimeout(() => resolve(null), 6000));
      this.ready = Promise.race([first, late]).then(got => {
        this.ok = !!got;
        if (got) [this.src, this.img, this.rig] = got;
        return this.ok;
      });
      return this.ready;
    }

    // Bake the picture at screen resolution, graded and feathered to be drawn still, and
    // its backlight; and if it's rigged, hand its layers to the warp.
    build(S, theme) {
      this.sp = null;
      if (!this.img) return;
      const img = this.img, src = this.src, gr = GRADE[theme] || GRADE.warm, crop = src.crop || 1;
      const sw = img.naturalWidth, sh = img.naturalHeight * crop; // the part shown
      const fit = Math.min(BOX.maxW / sw, BOX.maxH / sh);
      const w = sw * fit, h = sh * fit; // design px
      const W = Math.max(1, Math.round(w * S)), H = Math.max(1, Math.round(h * S));
      const pic = graded(img, crop, W, H, gr);
      const c = canvas(W, H), g = c.getContext('2d');
      g.drawImage(pic, 0, 0);
      // Feather: soft sides and top (unless it's a cut-out), and the lower part dissolving
      // into the dark.
      const feather = src.cutout ? 0 : BOX.feather;
      const m = canvas(W, H), mg = m.getContext('2d');
      const v = mg.createLinearGradient(0, 0, 0, H);
      v.addColorStop(0, `rgba(0,0,0,${feather ? 0 : 1})`);
      v.addColorStop(feather, 'rgba(0,0,0,1)');
      for (let i = 0; i <= 8; i++) {
        const x = i / 8;
        v.addColorStop(1 - BOX.fade * (1 - x), `rgba(0,0,0,${(1 - x * x * (3 - 2 * x)).toFixed(3)})`);
      }
      mg.fillStyle = v;
      mg.fillRect(0, 0, W, H);
      if (feather) {
        const hz = mg.createLinearGradient(0, 0, W, 0);
        hz.addColorStop(0, 'rgba(0,0,0,0)');
        hz.addColorStop(feather, 'rgba(0,0,0,1)');
        hz.addColorStop(1 - feather, 'rgba(0,0,0,1)');
        hz.addColorStop(1, 'rgba(0,0,0,0)');
        mg.globalCompositeOperation = 'destination-in';
        mg.fillStyle = hz;
        mg.fillRect(0, 0, W, H);
      }
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(m, 0, 0);
      g.globalCompositeOperation = 'source-over';
      // Backlight: its silhouette blurred wide, in the light's colour, at quarter size.
      const k = 0.25, gw = Math.ceil(W * (1 + 2 * PAD) * k), gh = Math.ceil(H * (1 + 2 * PAD) * k);
      const glow = canvas(gw, gh), gg = glow.getContext('2d');
      gg.filter = `blur(${Math.max(2, W * k * 0.04).toFixed(1)}px)`;
      gg.drawImage(c, W * PAD * k, H * PAD * k, W * k, H * k);
      gg.filter = 'none';
      gg.globalCompositeOperation = 'source-in';
      gg.fillStyle = `rgb(${gr.glow})`;
      gg.fillRect(0, 0, gw, gh);
      // The rig: what's under the hair and jacket graded like the picture, the layers and
      // sway as they are, and where it all is.
      let sway = false;
      if (this.rig) {
        const r = this.rig, R = src.rig, u = r.under;
        sway = this.warp.set({
          pic, under: graded(u, crop, u.naturalWidth, Math.round(u.naturalHeight * crop), gr),
          layers: cut(r.layers, crop), sway: cut(r.sway, crop),
        }, {
          w, h, fade: BOX.fade, chest: R.chest.map(y => y / sh),
          shoulders: R.shoulders.map(([x, y]) => [x * fit, y * fit]),
        });
        this.reach = R.arm * fit;
      }
      this.sp = { c, glow, w, h, sway };
    }

    // A worldline shift (`big`) or a click.
    hit(t, big) { this.hitAt = t; this.big = big; }

    // Where she floats at time t, given where her depth plane has drifted (`off`): design
    // px from her home.
    pose(t, off) {
      return {
        x: off.x + Math.sin(t / 9.7) * 3,
        y: off.y + Math.sin(t * TAU / 7.5) * 5 + Math.sin(t / 3.1 + 1) * 1.2,
      };
    }

    // Swing the hair and arms along to time t (stepped finely, so it's the same at any
    // frame rate). After a pause or a jump they start again at rest.
    update(t, off) {
      const p = this.pose(t, off), last = this.last, springs = [this.hair, ...this.arms];
      this.last = { t, x: p.x, y: p.y };
      if (!last || t <= last.t || t - last.t > 0.5) {
        const w = breeze(t).x;
        for (const s of springs) s.snap(p.x, p.y, w);
        return;
      }
      const n = Math.ceil((t - last.t) * 120), dt = (t - last.t) / n;
      for (let i = 1; i <= n; i++) {
        const u = i / n, x = last.x + (p.x - last.x) * u, y = last.y + (p.y - last.y) * u;
        const w = breeze(last.t + (t - last.t) * u).x;
        for (const s of springs) s.step(dt, x, y, w);
      }
    }

    // This moment of her, brought to life by her rig (null if it can't be).
    bend(t) {
      const b = breeze(t), br = breath(t), [l, r] = this.arms.map(a => a.off().x);
      return this.warp.draw({
        hair: this.hair.off(),
        ph: [(t * 1.7) % TAU, (t * 0.3) % TAU, (t * 1.3) % TAU],
        wind: b.ripple,
        breath: BREATH.lift * br,
        // Each arm turns from its shoulder so its cuff trails as its spring says, easing
        // outward as she breathes in.
        swing: [-(l - BREATH.spread * br) / this.reach, -(r + BREATH.spread * br) / this.reach],
        loose: { x: (l + r) * 0.3, y: 0 },
        flutter: 0.4 + 1.4 * b.gust,
      });
    }

    // `off` is where the centrepiece's depth plane has drifted (design px).
    draw(ctx, view, t, off) {
      const sp = this.sp;
      if (!sp) return;
      const S = view.S, p = this.pose(t, off), w = sp.w, h = sp.h;
      const x = BOX.cx - w / 2 + p.x, y = BOX.bottom - h + p.y;
      const X = view.ox + x * S, Y = view.oy + y * S, Wd = w * S, Hd = h * S;
      const pic = (sp.sway && this.bend(t)) || sp.c;
      const age = t - this.hitAt, dur = this.big ? 1.6 : 0.45;
      const tear = age >= 0 && age < dur ? (1 - age / dur) ** 1.5 : 0;
      const flare = age >= 0 ? Math.exp(-age / (this.big ? 0.8 : 0.3)) * (this.big ? 1 : 0.5) : 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(1, (0.1 + 0.02 * Math.sin(t / 5.1)) * (1 + 3 * flare));
      ctx.drawImage(sp.glow, X - Wd * PAD, Y - Hd * PAD, Wd * (1 + 2 * PAD), Hd * (1 + 2 * PAD));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (tear > 0.02) this.torn(ctx, pic, X, Y, Wd, Hd, t, tear, S);
      else ctx.drawImage(pic, X, Y, Wd, Hd);
      if (flare > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, flare * 0.3);
        ctx.drawImage(pic, X, Y, Wd, Hd);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // Glitch: bands of the picture knocked sideways, some doubled bright, re-rolled
    // about twenty times a second and calming as `k` falls.
    torn(ctx, c, X, Y, W, H, t, k, S) {
      const n = 22, roll = Math.floor(t * 20), sh = c.height / n, bh = H / n;
      for (let i = 0; i < n; i++) {
        const hit = hash(i, roll) < 0.25 + 0.5 * k;
        const dx = hit ? (hash(i, roll + 1) - 0.5) * 140 * k * S : 0;
        ctx.globalAlpha = hit && hash(i, roll + 2) < 0.2 * k ? 0.55 : 1;
        ctx.drawImage(c, 0, i * sh, c.width, sh, X + dx, Y + i * bh, W, bh);
        if (hit && hash(i, roll + 3) < 0.15 * k) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.4 * k;
          ctx.drawImage(c, 0, i * sh, c.width, sh, X - dx * 0.5, Y + i * bh, W, bh);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  return { Portrait, BOX, FOCUS };
})();
