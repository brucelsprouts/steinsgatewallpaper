'use strict';
// Composition: clockwork, drafted overlays and living ink on many depth planes around
// the meter, cursor parallax and draw order. Coordinates are in the 2560x1440 design space.
//
// Parallax pivots mid-scene: depth < 0 drifts with the cursor, depth > 0 against it,
// each in proportion to its distance from the pivot. The meter sits at +0.3, so it
// moves opposite the deep clockwork; foreground silhouettes move the most.
const Scene = (() => {
  const A = Mech.Assembly, O = Paint.Overlay;
  // Well clear of the astrolabe on its right, even with the cursor pulling them together,
  // and low enough that the numbers sit level with the middle of the frame. The numbers
  // without their glass tubes.
  const METER = { cx: 560, cy: 695, tubeH: 210, depth: 0.3, tubes: false };
  // What the scene darkens around the meter, so it keeps a pool of negative space.
  const FOCUS = { x: METER.cx, y: METER.cy, rx: 760, ry: 440 };
  const P = 42; // parallax travel in design px per unit of depth
  // The astrolabe's face (design px: centre and radius): the schematics leave it room to read.
  const ASTROLABE = { x: 2000, y: 560, r: 820 };

  function compose() {
    return [
      // ---- Deep clockwork ----
      // Sharp, but faint: the depth is in how dim they are and how they move, not in blur.
      // A half clock hanging from the top, its lowest numerals beside the centrepiece's
      // head rather than behind it, and a degree scale inside it that steps the other way.
      new A({ x: 380, y: -300, depth: -0.8, blur: 0.35, res: 1, alpha: 0.2, rx: 0.2, ry: 0.05, seed: 3, drift: 10,
        parts: [
          { type: 'dial', r: 780, hands: false, track: false, turn: -1 },
          { type: 'dial', r: 560, face: 'scale', hands: false, track: false, turn: 1 },
        ] }),
      // The astrolabe: a giant dial whose rings step against each other, as bright as the
      // half clock so it reads through the schematics drawn across it.
      new A({ x: ASTROLABE.x, y: ASTROLABE.y, depth: -0.6, blur: 0.4, res: 1, alpha: 0.2, rx: 0.22, ry: -0.2, roll: 0.1, seed: 1, hands: 0.7,
        parts: [{ type: 'dial', r: ASTROLABE.r, ring24: true }] }),
      new A({ x: 2330, y: 1330, depth: -0.45, blur: 0.35, res: 1, alpha: 0.1, rx: 0.15, ry: 0.2, seed: 2,
        beat: { period: 3, dur: 1.2, teeth: 0.25 },
        parts: [{ type: 'gear', pitch: 44, teeth: 48, spokes: 6, curved: true }] }),

      // ---- Middle: near the pivot, barely moving ----
      new A({ x: 1640, y: 1180, depth: -0.15, blur: 0.4, alpha: 0.15, rx: 0.1, ry: -0.16, seed: 4,
        parts: [
          { type: 'gear', pitch: 30, teeth: 44, spokes: 5, curved: true },
          { type: 'gear', teeth: 26, spokes: 4, mesh: { to: 0, angle: -0.95 } },
          { type: 'gear', teeth: 14, spokes: 0, mesh: { to: 1, angle: -1.75 } },
        ] }),
      // Akihabara time (UTC+9), upper right.
      new A({ x: 2300, y: 230, depth: 0, blur: 0.5, alpha: 0.14, rx: 0.16, ry: 0.22, roll: -0.15, seed: 5,
        parts: [{ type: 'dial', r: 270, tz: 9 }] }),
      // Small clock with its escapement, beating with the real seconds.
      new A({ x: 2110, y: 860, depth: 0.2, alpha: 0.19, rx: 0.08, ry: -0.12, seed: 6,
        beat: { period: 1, dur: 0.35, teeth: 0.25 },
        parts: [
          { type: 'dial', r: 150, seconds: true },
          { type: 'gear', x: -262, y: 200, pitch: 18, teeth: 15, profile: 'escape', spokes: 4, curved: true, jewel: true },
          { type: 'pallet', x: -262, y: 127, L: 52 },
          { type: 'balance', x: -262, y: 0, r: 62 },
          { type: 'gear', x: 130, y: 185, pitch: 14, teeth: 22, spokes: 4, jewel: true },
          { type: 'gear', teeth: 12, spokes: 0, jewel: true, mesh: { to: 4, angle: 0.5 } },
        ] }),

      // ---- In front of the meter ----
      new O({ kind: 'marks', x: 1900, y: 1250, spread: 300, depth: 0.35, alpha: 0.12, seed: 41 }),
      new A({ x: 2470, y: 1440, depth: 0.9, blur: 0.6, alpha: 1, rx: 0.12, ry: -0.15, seed: 7, drift: 18, shine: 0,
        beat: { period: 4, dur: 1.6, teeth: 0.25 },
        parts: [{ type: 'gear', style: 'solid', pitch: 72, teeth: 40, spokes: 6, edge: 0.42 }] }),
      new A({ x: 2610, y: 20, depth: 0.75, blur: 0.5, alpha: 1, rx: 0.1, ry: 0.15, seed: 8, drift: 14, shine: 0,
        beat: { period: 4, dur: 1.6, teeth: 0.25 },
        parts: [{ type: 'gear', style: 'solid', pitch: 62, teeth: 26, spokes: 5 }] }),
      // Climbing the left edge beside her: a big gear, and a small one meshing with it in
      // the empty band beside her hair.
      new A({ x: -240, y: 1400, depth: 1.0, blur: 0.7, alpha: 1, rx: 0.1, ry: 0.12, seed: 15, drift: 16, shine: 0,
        beat: { period: 5, dur: 1.8, teeth: 0.25 },
        parts: [
          { type: 'gear', style: 'solid', pitch: 64, teeth: 48, spokes: 6, curved: true },
          { type: 'gear', style: 'solid', teeth: 16, spokes: 4, curved: true, mesh: { to: 0, angle: -1.2 } },
        ] }),
    ].sort((a, b) => a.depth - b.depth);
  }

  // Each layer glides toward the cursor at its own pace: deep layers lag a little more.
  const lag = d => 1.05 - 0.45 * Kit.clamp((d + 1) / 2.2);

  class Scene {
    // `random` drives the ink (seed it for repeatable stills); `ink` passes options to it.
    constructor(random = Math.random, ink = {}) {
      this.items = compose();
      this.dust = new Atmos.Dust();
      this.shifts = [];
      this.target = { x: 0, y: 0 };
      this.meterCam = { x: 0, y: 0 };
      this.ink = new Ink.Field(random, this.target, { away: { x: METER.cx, y: METER.cy }, ...ink });
      this.focus = FOCUS;
      this.lastT = null;
    }

    // Normalised cursor position in [-1, 1].
    pointer(x, y) { this.target.x = x; this.target.y = y; }

    // Snap every layer to the target (used for pinned-camera stills).
    settle() {
      const cams = [this.meterCam, this.dust.cam, ...this.items.map(i => i.cam), ...this.ink.blooms.map(b => b.cam)];
      for (const c of cams) { c.x = this.target.x; c.y = this.target.y; }
    }

    // `focus` is the centrepiece's pool of negative space (design px: centre and radii).
    build(S, view, theme, focus = FOCUS) {
      const pal = Mech.PALETTES[theme] || Mech.PALETTES.warm;
      for (const it of this.items) it.build(S, pal);
      this.dust.build(S, theme);
      this.ink.build(S);
      // Darken whatever sits behind the centrepiece so it keeps a pool of negative space.
      this.focus = focus;
      const k = 0.25, R = focus.rx, sy = focus.ry / focus.rx;
      const c = Kit.canvas(R * 2 * view.S * k, R * 2 * sy * view.S * k), g = c.getContext('2d');
      g.setTransform(view.S * k, 0, 0, view.S * k * sy, R * view.S * k, R * sy * view.S * k);
      const r = g.createRadialGradient(0, 0, 0, 0, 0, R);
      for (let i = 0; i <= 10; i++) {
        const x = i / 10;
        r.addColorStop(x, `rgba(4,3,3,${(0.9 * (1 - x * x * (3 - 2 * x))).toFixed(3)})`);
      }
      g.fillStyle = r;
      g.fillRect(-R, -R, R * 2, R * 2);
      this.clearing = c;
    }

    update(t) {
      const dt = this.lastT == null ? 0 : Math.max(0, t - this.lastT);
      this.lastT = t;
      const glide = (c, d) => {
        const k = 1 - Math.exp(-dt / lag(d));
        c.x += (this.target.x - c.x) * k;
        c.y += (this.target.y - c.y) * k;
      };
      for (const it of this.items) glide(it.cam, it.depth);
      glide(this.meterCam, METER.depth);
      glide(this.dust.cam, 0.4);
      this.ink.update(t);
      for (const b of this.ink.blooms) glide(b.cam, b.depth);
    }

    // Where the meter sits this frame, in design px relative to its home.
    meterOffset(t) {
      return {
        x: -this.meterCam.x * P * METER.depth + Math.sin(t / 83) * 4,
        y: -this.meterCam.y * P * METER.depth * 0.7 + Math.cos(t / 101) * 3,
      };
    }

    drawBehind(ctx, view, t, now) {
      const deep = b => b.depth < METER.depth;
      ctx.save();
      this.ink.frame(t);
      this.ink.draw(ctx, view, t, 'under', deep);
      for (const it of this.items) if (it.depth < METER.depth) it.draw(ctx, view, t, now, this.shifts);
      this.ink.draw(ctx, view, t, 'over', deep);
      ctx.restore();
      const m = this.meterOffset(t), f = this.focus;
      const w = this.clearing.width / (view.S * 0.25), h = this.clearing.height / (view.S * 0.25);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.clearing,
        view.ox + (f.x + m.x - w / 2) * view.S, view.oy + (f.y + m.y - h / 2) * view.S, w * view.S, h * view.S);
    }

    drawFront(ctx, view, t, now) {
      const near = b => b.depth >= METER.depth;
      ctx.save();
      this.ink.draw(ctx, view, t, 'under', near);
      this.ink.draw(ctx, view, t, 'over', near);
      for (const it of this.items) if (it.depth >= METER.depth) it.draw(ctx, view, t, now, this.shifts);
      const m = this.meterOffset(t);
      this.dust.draw(ctx, view, t, { x: this.focus.x + m.x, y: this.focus.y + m.y });
      ctx.restore();
    }
  }

  return { Scene, METER, FOCUS, ASTROLABE };
})();
