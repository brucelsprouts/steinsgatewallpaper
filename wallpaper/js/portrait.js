'use strict';
// The Makise centrepiece: a picture in place of the nixie meter. It is fitted into the
// left of the frame standing on the bottom edge, graded toward the scene's light and
// faintly backlit, its lower part dissolving into the dark. It floats, bobbing gently and
// drifting against the cursor. Where the picture has a rig (see rig.js) she comes alive:
// her hair sways in the breeze and trails behind her as she moves, her arms swing in her
// jacket from the shoulders with its loose cuffs fluttering, and she breathes, softly; all
// of it painted onto the one picture, so nothing tears open. A worldline shift or a click makes her flicker with light. If no picture can be
// loaded the meter takes its place.
//
// The picture is img/makise.webp (or .png, or .jpg); without one, the drawn placeholder
// stands in. A PNG with a transparent background looks best, but a plain rectangle is
// feathered into the dark too. Pixels are never read back, so a picture that taints the
// canvas (as local files can in Wallpaper Engine) is fine; it just holds still.
const Portrait = (() => {
  const { canvas, hash, TAU } = Kit;
  // The pictures to try, in order. `crop` is how much of it shows, from the top (the rest
  // would only fade out below the frame); a `cutout` has a transparent background of its
  // own, so only its foot is faded. Each picture's rig, if it has one, lies beside it:
  // img/makise.webp's is img/makise-rig.js (made in tools/rig.html).
  const SOURCES = [
    { src: 'img/makise.webp', crop: 0.6, cutout: true },
    { src: 'img/makise.png' },
    { src: 'img/makise.jpg' },
    { src: 'img/placeholder.webp' },
  ];
  const rigFor = src => src.replace(/\.\w+$/, '') + '-rig.js';
  // Its shut eyes, if they've been drawn: img/makise.webp's are img/makise-lids.png, the
  // picture's size, transparent but for the shut lids. Its blinks show them.
  const lidsFor = src => src.replace(/\.\w+$/, '') + '-lids.png';
  // Where it stands, in design px: centred on `cx`, its foot on `bottom` (a little below
  // the frame, so its lower edge never shows), fitted inside maxW x maxH. `feather`
  // softens the sides and top (a fraction of its size); `fade` dissolves its lower part.
  const BOX = { cx: 600, bottom: 1490, maxW: 1150, maxH: 1260, feather: 0.06, fade: 0.22 };
  // The pool of negative space the scene keeps around it (design px: centre and radii).
  const FOCUS = { x: 600, y: 790, rx: 720, ry: 800 };
  // Roughly where img/makise.webp covers the frame when she's home (design px: ellipses'
  // centres and radii): her head and coat, and the foot of her coat.
  const FIGURE = [{ x: 620, y: 680, rx: 230, ry: 440 }, { x: 615, y: 1150, rx: 330, ry: 130 }];
  // Grading toward the scene's light, and the colour of the light behind it. Kept dim, so
  // it sits in the scene's shadows rather than glowing out of them.
  const GRADE = {
    warm: { filter: 'saturate(0.88) brightness(0.7) contrast(1.02)', tint: '255,150,80', glow: '255,122,52' },
    cold: { filter: 'saturate(0.8) brightness(0.7) contrast(1.02)', tint: '150,180,255', glow: '176,198,240' },
  };
  const PAD = 0.14; // room around the backlight, a fraction of the picture's size
  // The backlight from the settings: `glow` (0-100) is its strength, `glowSize` (0-100,
  // 50 as designed) how far it spreads, from half as far to twice.
  const glowGain = () => Config.get('glow') / 100;
  const glowSpread = () => 2 ** ((Config.get('glowSize') - 50) / 50);
  const moving = () => Config.get('motion');

  // How big the shown part of a picture is drawn: design px for each of its own.
  const fitOf = (img, crop) => Math.min(BOX.maxW / img.naturalWidth, BOX.maxH / (img.naturalHeight * crop));

  // Where she floats at time t, given where her depth plane has drifted (`off`): design
  // px from her home.
  function pose(t, off) {
    return {
      x: off.x + Math.sin(t / 9.7) * 3,
      y: off.y + Math.sin(t * TAU / 7.5) * 5 + Math.sin(t / 3.1 + 1) * 1.2,
    };
  }
  // The same, held still when the settings turn her motion off.
  const at = (t, off) => (moving() ? pose(t, off) : { x: off.x, y: off.y });

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

  // The shown part of one of a rig's masks, as it is.
  function cut(img, crop) {
    const W = img.naturalWidth, H = Math.round(img.naturalHeight * crop), c = canvas(W, H);
    c.getContext('2d').drawImage(img, 0, 0, W, H, 0, 0, W, H);
    return c;
  }

  // One picture: the image, or null if it isn't there or can't be read.
  const fetchImage = src => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });

  // A picture's rig with its masks loaded (`images`) and its drawn shut eyes (`lids`, or
  // null), or null if it has none or the rig was made for another picture (it names the
  // size of its own).
  async function fetchRig(src, img) {
    const url = rigFor(src), rig = await Rig.load(url);
    if (!rig || !rig.size || rig.size[0] !== img.naturalWidth || rig.size[1] !== img.naturalHeight) return null;
    const dir = url.slice(0, url.lastIndexOf('/') + 1), aspect = img.naturalWidth / img.naturalHeight;
    const images = await Promise.all(rig.maps.map(m => fetchImage(dir + m)));
    if (!images.every(m => m && Math.abs(m.naturalWidth / m.naturalHeight / aspect - 1) < 0.02)) return null;
    let lids = await fetchImage(lidsFor(src));
    if (lids && Math.abs(lids.naturalWidth / lids.naturalHeight / aspect - 1) >= 0.02) lids = null;
    return { ...rig, images, lids };
  }

  class Portrait {
    constructor(sources = SOURCES) {
      this.sources = sources;
      this.ok = null;     // true once loaded, false if nothing could be
      this.ready = null;  // the promise of the above
      this.src = null;    // which picture it is (one of the sources)
      this.img = null;
      this.rig = null;    // its rig, if it has one that fits, with its masks
      this.fit = 1;       // design px for each of the picture's own
      this.sp = null;
      this.hitAt = -1e9;
      this.big = false;
      this.warp = new Rig.Renderer();
      this.motion = new Rig.Motion();
    }

    // Resolves true once a picture is in (the first of the sources that loads, with its
    // rig if it has one), or false if none can be had within a few seconds.
    load() {
      if (this.ready) return this.ready;
      const first = (async () => {
        for (const s of this.sources) {
          const img = await fetchImage(s.src);
          if (img) return [s, img, await fetchRig(s.src, img)];
        }
        return null;
      })();
      const late = new Promise(resolve => setTimeout(() => resolve(null), 6000));
      this.ready = Promise.race([first, late]).then(got => {
        this.ok = !!got;
        if (got) {
          [this.src, this.img, this.rig] = got;
          this.fit = fitOf(this.img, this.src.crop || 1);
        }
        return this.ok;
      });
      return this.ready;
    }

    // Bake the picture at screen resolution, graded and feathered to be drawn still, and
    // its backlight; and if it's rigged, hand it and its masks to the renderer.
    build(S, theme) {
      this.sp = null;
      if (!this.img) return;
      const img = this.img, src = this.src, gr = GRADE[theme] || GRADE.warm, crop = src.crop || 1;
      const sw = img.naturalWidth, sh = img.naturalHeight * crop; // the part shown
      const fit = this.fit;
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
      const z = glowSpread(), pad = PAD * Math.max(1, z);
      const k = 0.25, gw = Math.ceil(W * (1 + 2 * pad) * k), gh = Math.ceil(H * (1 + 2 * pad) * k);
      const glow = canvas(gw, gh), gg = glow.getContext('2d');
      gg.filter = `blur(${Math.max(2, W * k * 0.04 * z).toFixed(1)}px)`;
      gg.drawImage(c, W * pad * k, H * pad * k, W * k, H * k);
      gg.filter = 'none';
      gg.globalCompositeOperation = 'source-in';
      gg.fillStyle = `rgb(${gr.glow})`;
      gg.fillRect(0, 0, gw, gh);
      // The rig: the graded picture and the shown part of its masks; its effects work in
      // the picture's own px.
      let sway = false;
      if (this.rig) {
        const lids = this.rig.lids && graded(this.rig.lids, crop, W, H, gr);
        sway = this.warp.set(pic, this.rig.images.map(m => cut(m, crop)), this.rig.effects, { size: [sw, sh], fade: BOX.fade, lids });
      }
      this.sp = { c, glow, pad, w, h, sway };
    }

    // A worldline shift (`big`) or a click.
    hit(t, big) { this.hitAt = t; this.big = big; }

    // Where she floats at time t (design px from her home).
    pose(t, off) { return at(t, off); }

    // Swing her rig along to time t, her depth plane having drifted to `off` (design px)
    // and the cursor being at `cursor` (-1..1, as the scene smooths it): the hair and arms
    // trail her as she floats.
    update(t, off, cursor) {
      if (!this.rig || !moving()) return;
      const p = at(t, off);
      this.motion.update(t, this.rig.effects, { x: p.x / this.fit, y: p.y / this.fit }, cursor);
    }

    // This moment of her, brought to life by her rig (null if it can't be).
    bend(t) {
      return this.warp.draw(this.motion.values(t, this.rig.effects));
    }

    // `off` is where the centrepiece's depth plane has drifted (design px).
    draw(ctx, view, t, off) {
      const sp = this.sp;
      if (!sp) return;
      const S = view.S, p = at(t, off), w = sp.w, h = sp.h, pad = sp.pad;
      const x = BOX.cx - w / 2 + p.x, y = BOX.bottom - h + p.y;
      const X = view.ox + x * S, Y = view.oy + y * S, Wd = w * S, Hd = h * S;
      const pic = (sp.sway && moving() && this.bend(t)) || sp.c;
      const age = t - this.hitAt;
      const flare = age >= 0 ? Math.exp(-age / (this.big ? 0.8 : 0.3)) * (this.big ? 1 : 0.5) : 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(1, (0.1 + 0.02 * Math.sin(t / 5.1)) * (1 + 3 * flare) * glowGain());
      if (ctx.globalAlpha > 0) ctx.drawImage(sp.glow, X - Wd * pad, Y - Hd * pad, Wd * (1 + 2 * pad), Hd * (1 + 2 * pad));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(pic, X, Y, Wd, Hd);
      if (flare > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, flare * 0.3);
        ctx.drawImage(pic, X, Y, Wd, Hd);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // The rest is for tools/rig.html, which shows the picture as the wallpaper does.
  return { Portrait, BOX, FOCUS, FIGURE, SOURCES, GRADE, rigFor, lidsFor, fitOf, pose, graded, fetchImage };
})();
