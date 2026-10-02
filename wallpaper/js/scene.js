'use strict';
// Composition: clockwork on several depth planes around the meter, cursor parallax,
// and draw order. Coordinates are in the 2560x1440 design space.
const Scene = (() => {
  const A = Mech.Assembly;
  const METER = { cx: 860, cy: 780, tubeH: 240 };

  // depth < 0 sits behind the meter (drifts with the cursor), > 0 in front (against it).
  function compose() {
    const behind = [
      // Faint ring fragment arcing high over the meter.
      new A({ x: 700, y: -330, depth: -0.85, blur: 8, res: 0.4, alpha: 0.075, rx: 0.55, ry: 0.12, seed: 3, drift: 10,
        parts: [{ type: 'dial', r: 780, hands: false, track: false, turn: -1 }] }),
      // The astrolabe: a giant tilted dial, rings stepping against each other.
      new A({ x: 2000, y: 560, depth: -0.7, blur: 5, res: 0.45, alpha: 0.13, rx: 0.42, ry: -0.38, roll: 0.1, seed: 1, hands: 0.7,
        parts: [{ type: 'dial', r: 820, ring24: true }] }),
      // A big slow gear low on the right.
      new A({ x: 2330, y: 1330, depth: -0.55, blur: 4, res: 0.45, alpha: 0.1, rx: 0.25, ry: 0.5, seed: 2,
        beat: { period: 3, dur: 1.2, teeth: 0.25 },
        parts: [{ type: 'gear', pitch: 44, teeth: 48, spokes: 6 }] }),
      // Gear train, lower middle-right.
      new A({ x: 1640, y: 1180, depth: -0.32, blur: 1.6, res: 0.7, alpha: 0.16, rx: 0.18, ry: -0.3, seed: 4,
        parts: [
          { type: 'gear', pitch: 30, teeth: 44, spokes: 5 },
          { type: 'gear', teeth: 26, spokes: 4, mesh: { to: 0, angle: -0.95 } },
          { type: 'gear', teeth: 14, spokes: 0, holes: 0, mesh: { to: 1, angle: -1.75 } },
        ] }),
      // Akihabara time (UTC+9), upper right.
      new A({ x: 2300, y: 230, depth: -0.25, blur: 1.8, res: 0.7, alpha: 0.14, rx: 0.32, ry: 0.5, roll: -0.18, seed: 5,
        parts: [{ type: 'dial', r: 270, tz: 9 }] }),
      // Small crisp clock with a ticking second hand, and its escapement gears.
      new A({ x: 2110, y: 860, depth: -0.08, blur: 0, res: 1, alpha: 0.19, rx: 0.1, ry: -0.22, seed: 6,
        beat: { period: 1, dur: 0.35, teeth: 0.25 },
        parts: [
          { type: 'dial', r: 150, seconds: true },
          { type: 'gear', x: 130, y: 185, pitch: 14, teeth: 22, spokes: 4 },
          { type: 'gear', teeth: 12, spokes: 0, mesh: { to: 1, angle: 0.5 } },
        ] }),
    ];
    const front = [
      // Out-of-focus silhouettes between viewer and meter, cropped by the frame.
      new A({ x: 2470, y: 1440, depth: 0.9, blur: 13, res: 0.3, alpha: 1, rx: 0.3, ry: -0.35, seed: 7, drift: 20,
        beat: { period: 4, dur: 1.6, teeth: 0.25 },
        parts: [{ type: 'gear', style: 'solid', pitch: 72, teeth: 40, spokes: 6 }] }),
      new A({ x: 2610, y: 20, depth: 0.7, blur: 10, res: 0.3, alpha: 1, rx: 0.2, ry: 0.4, seed: 8, drift: 16,
        beat: { period: 4, dur: 1.6, teeth: 0.25 },
        parts: [{ type: 'gear', style: 'solid', pitch: 62, teeth: 26, spokes: 5 }] }),
    ];
    return { behind, front };
  }

  class Scene {
    constructor() {
      this.planes = compose();
      this.shifts = [];
      this.cam = { x: 0, y: 0 };
      this.target = { x: 0, y: 0 };
      this.lastT = null;
    }

    // Normalised cursor position in [-1, 1].
    pointer(x, y) { this.target.x = x; this.target.y = y; }

    build(S, view, theme) {
      const pal = Mech.PALETTES[theme] || Mech.PALETTES.warm;
      for (const a of [...this.planes.behind, ...this.planes.front]) a.build(S, pal);
      // Darken the clockwork around the meter so it keeps a pool of negative space.
      const k = 0.25, c = Kit.canvas(view.W * k, view.H * k), g = c.getContext('2d');
      g.setTransform(view.S * k, 0, 0, view.S * k, view.ox * k, view.oy * k);
      g.translate(METER.cx, METER.cy);
      g.scale(1, 0.58);
      const r = g.createRadialGradient(0, 0, 0, 0, 0, 820);
      for (let i = 0; i <= 10; i++) {
        const x = i / 10;
        r.addColorStop(x, `rgba(4,3,3,${(0.9 * (1 - x * x * (3 - 2 * x))).toFixed(3)})`);
      }
      g.fillStyle = r;
      g.fillRect(-900, -1500, 1800, 3000);
      this.clearing = c;
    }

    update(t) {
      const dt = this.lastT == null ? 0 : Math.max(0, t - this.lastT);
      this.lastT = t;
      const k = 1 - Math.exp(-dt / 0.9); // glide toward the cursor, ~1 s to settle
      this.cam.x += (this.target.x - this.cam.x) * k;
      this.cam.y += (this.target.y - this.cam.y) * k;
    }

    drawBehind(ctx, view, t, now) {
      ctx.save();
      for (const a of this.planes.behind) a.draw(ctx, view, t, this.cam, now, this.shifts);
      ctx.restore();
      ctx.drawImage(this.clearing, 0, 0, view.W, view.H);
    }

    drawFront(ctx, view, t, now) {
      ctx.save();
      for (const a of this.planes.front) a.draw(ctx, view, t, this.cam, now, this.shifts);
      ctx.restore();
    }
  }

  return { Scene, METER };
})();
