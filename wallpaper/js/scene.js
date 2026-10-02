'use strict';
// Composition: clockwork and painted overlays on many depth planes around the meter,
// cursor parallax and draw order. Coordinates are in the 2560x1440 design space.
//
// Parallax pivots mid-scene: depth < 0 drifts with the cursor, depth > 0 against it,
// each in proportion to its distance from the pivot. The meter sits at +0.3, so it
// moves opposite the deep clockwork; foreground silhouettes move the most.
const Scene = (() => {
  const A = Mech.Assembly, O = Paint.Overlay;
  const METER = { cx: 860, cy: 780, tubeH: 240, depth: 0.3 };
  const P = 42; // parallax travel in design px per unit of depth

  function compose() {
    return [
      // ---- Washes of colour far back ----
      new O({ kind: 'wash', color: 'teal', x: 2050, y: 420, r: 560, depth: -0.95, alpha: 0.11, res: 0.5, seed: 11, breathe: 0.15 }),
      new O({ kind: 'wash', color: 'crimson', x: 2420, y: 1170, r: 430, depth: -0.9, alpha: 0.11, res: 0.5, seed: 12, breathe: 0.2 }),
      new O({ kind: 'wash', color: 'violet', x: 330, y: 230, r: 480, depth: -0.95, alpha: 0.09, res: 0.5, seed: 13, breathe: 0.2 }),
      new O({ kind: 'wash', color: 'rose', x: 1380, y: 1390, r: 380, depth: -0.85, alpha: 0.07, res: 0.5, seed: 14, breathe: 0.25 }),

      // ---- Deep clockwork ----
      new A({ x: 700, y: -330, depth: -0.8, blur: 2.5, res: 0.7, alpha: 0.07, rx: 0.2, ry: 0.05, seed: 3, drift: 10,
        parts: [{ type: 'dial', r: 780, hands: false, track: false, turn: -1 }] }),
      new O({ kind: 'worldlines', x: 930, y: 1150, width: 1500, height: 200, depth: -0.7, alpha: 0.11, seed: 21, op: 'screen' }),
      // The astrolabe: a giant dial whose rings step against each other.
      new A({ x: 2000, y: 560, depth: -0.6, blur: 1.6, res: 0.8, alpha: 0.12, rx: 0.22, ry: -0.2, roll: 0.1, seed: 1, hands: 0.7,
        parts: [{ type: 'dial', r: 820, ring24: true }] }),
      new A({ x: 440, y: 200, depth: -0.55, blur: 1.2, res: 0.85, alpha: 0.1, rx: 0.12, ry: 0.15, seed: 9,
        parts: [
          { type: 'gear', pitch: 18, teeth: 30, spokes: 4, curved: true },
          { type: 'gear', teeth: 16, spokes: 0, holes: 5, mesh: { to: 0, angle: 0.6 } },
        ] }),
      new A({ x: 2330, y: 1330, depth: -0.45, blur: 1.2, res: 0.85, alpha: 0.1, rx: 0.15, ry: 0.2, seed: 2,
        beat: { period: 3, dur: 1.2, teeth: 0.25 },
        parts: [{ type: 'gear', pitch: 44, teeth: 48, spokes: 6, curved: true }] }),
      new O({ kind: 'splatter', x: 2060, y: 640, r: 330, depth: -0.35, alpha: 0.16, seed: 31, drops: 90, drips: 2, spikes: 26 }),

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
      new O({ kind: 'splatter', color: 'teal', x: 2390, y: 370, r: 150, depth: 0.05, alpha: 0.22, seed: 32, drops: 40, spikes: 18 }),
      new O({ kind: 'splatter', color: 'rose', x: 1520, y: 240, r: 110, depth: 0.1, alpha: 0.18, seed: 33, drops: 30, spikes: 16 }),
      new O({ kind: 'splatter', color: 'crimson', x: 2470, y: 700, r: 120, depth: -0.2, alpha: 0.26, seed: 37, drops: 30, spikes: 14, drips: 1 }),
      new O({ kind: 'splatter', color: 'amber', x: 1830, y: 1370, r: 90, depth: 0.15, alpha: 0.22, seed: 38, drops: 24, spikes: 12 }),
      new A({ x: 250, y: 1215, depth: 0.1, blur: 0.4, alpha: 0.13, rx: 0.08, ry: 0.14, seed: 10,
        parts: [
          { type: 'gear', pitch: 26, teeth: 34, spokes: 6, curved: true },
          { type: 'gear', teeth: 18, spokes: 4, mesh: { to: 0, angle: -0.7 } },
          { type: 'gear', teeth: 12, spokes: 0, mesh: { to: 1, angle: -2.1 } },
        ] }),
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
      new O({ kind: 'scratches', x: 1500, y: 1010, spread: 260, len: 140, depth: 0.4, alpha: 0.1, seed: 42, angle: -0.6 }),
      new O({ kind: 'splatter', x: 1760, y: 300, r: 140, depth: 0.45, alpha: 0.2, seed: 34, drops: 45, drips: 1 }),
      new A({ x: 2470, y: 1440, depth: 0.9, blur: 2.5, res: 0.8, alpha: 1, rx: 0.12, ry: -0.15, seed: 7, drift: 18, shine: 0.35,
        beat: { period: 4, dur: 1.6, teeth: 0.25 },
        parts: [{ type: 'gear', style: 'solid', pitch: 72, teeth: 40, spokes: 6 }] }),
      new A({ x: 2610, y: 20, depth: 0.75, blur: 2, res: 0.8, alpha: 1, rx: 0.1, ry: 0.15, seed: 8, drift: 14, shine: 0.35,
        beat: { period: 4, dur: 1.6, teeth: 0.25 },
        parts: [{ type: 'gear', style: 'solid', pitch: 62, teeth: 26, spokes: 5 }] }),
      new A({ x: -70, y: 1500, depth: 1.0, blur: 3, res: 0.7, alpha: 1, rx: 0.1, ry: 0.12, seed: 15, drift: 16, shine: 0.3,
        beat: { period: 5, dur: 1.8, teeth: 0.25 },
        parts: [{ type: 'gear', style: 'solid', pitch: 58, teeth: 34, spokes: 6, curved: true }] }),
      // Out-of-focus paint flecks closest to the viewer.
      new O({ kind: 'splatter', x: 2280, y: 1240, r: 240, depth: 1.2, blur: 2.5, alpha: 0.15, seed: 35, core: 0.12, drops: 50, mist: 120 }),
      new O({ kind: 'splatter', x: 170, y: 110, r: 200, depth: 1.1, blur: 3, alpha: 0.1, seed: 36, core: 0.1, drops: 40, mist: 100 }),
    ].sort((a, b) => a.depth - b.depth);
  }

  // Each layer glides toward the cursor at its own pace: deep layers lag a little more.
  const lag = d => 1.05 - 0.45 * Kit.clamp((d + 1) / 2.2);

  class Scene {
    constructor() {
      this.items = compose();
      this.shifts = [];
      this.target = { x: 0, y: 0 };
      this.meterCam = { x: 0, y: 0 };
      this.lastT = null;
    }

    // Normalised cursor position in [-1, 1].
    pointer(x, y) { this.target.x = x; this.target.y = y; }

    // Snap every layer to the target (used for pinned-camera stills).
    settle() {
      for (const c of [this.meterCam, ...this.items.map(i => i.cam)]) { c.x = this.target.x; c.y = this.target.y; }
    }

    build(S, view, theme) {
      const pal = Mech.PALETTES[theme] || Mech.PALETTES.warm;
      for (const it of this.items) it.build(S, pal);
      // Darken whatever sits behind the meter so it keeps a pool of negative space.
      const k = 0.25, R = 820;
      const c = Kit.canvas(R * 2 * view.S * k, R * 2 * view.S * k), g = c.getContext('2d');
      g.setTransform(view.S * k, 0, 0, view.S * k * 0.58, R * view.S * k, R * view.S * k);
      const r = g.createRadialGradient(0, 0, 0, 0, 0, R);
      for (let i = 0; i <= 10; i++) {
        const x = i / 10;
        r.addColorStop(x, `rgba(4,3,3,${(0.9 * (1 - x * x * (3 - 2 * x))).toFixed(3)})`);
      }
      g.fillStyle = r;
      g.fillRect(-R, -R / 0.58, R * 2, R * 2 / 0.58);
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
    }

    // Where the meter sits this frame, in design px relative to its home.
    meterOffset(t) {
      return {
        x: -this.meterCam.x * P * METER.depth + Math.sin(t / 83) * 4,
        y: -this.meterCam.y * P * METER.depth * 0.7 + Math.cos(t / 101) * 3,
      };
    }

    drawBehind(ctx, view, t, now) {
      ctx.save();
      for (const it of this.items) if (it.depth < METER.depth) it.draw(ctx, view, t, now, this.shifts);
      ctx.restore();
      const m = this.meterOffset(t), w = this.clearing.width / (view.S * 0.25), h = this.clearing.height / (view.S * 0.25);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.clearing,
        view.ox + (METER.cx + m.x - w / 2) * view.S, view.oy + (METER.cy + m.y - h / 2) * view.S, w * view.S, h * view.S);
    }

    drawFront(ctx, view, t, now) {
      ctx.save();
      for (const it of this.items) if (it.depth >= METER.depth) it.draw(ctx, view, t, now, this.shifts);
      ctx.restore();
    }
  }

  return { Scene, METER };
})();
