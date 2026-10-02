'use strict';
// Boot, layout, render loop, frame cap and pausing.
(() => {
  const DESIGN_W = 2560, DESIGN_H = 1440;
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const q = Config.query;

  // Debug hooks: ?now=2026-10-02T09:59:55 fakes the wall clock; ?still=3.2 renders one
  // frame at that many seconds after boot; ?shiftAt=5 triggers a worldline shift then.
  const fakeNow = q.get('now') ? new Date(q.get('now')).getTime() : null;
  const still = q.has('still') ? Number(q.get('still')) : null;
  const shiftAt = q.has('shiftAt') ? Number(q.get('shiftAt')) : null;
  let simT = 0;
  const clock = () => new Date(fakeNow != null ? fakeNow + simT * 1000 : Date.now());

  const LAYOUTS = {
    main: { meter: { cx: 860, cy: 780, tubeH: 240 } },
    quiet: { meter: { cx: 860, cy: 780, tubeH: 240 } },
  };

  let view, meter, controller, vignette, dither;

  function makeScene() {
    const L = LAYOUTS[Config.get('layout')] || LAYOUTS.main;
    meter = new Nixie.Meter({ ...L.meter, aspect: q.has('aspect') ? Number(q.get('aspect')) : undefined });
    meter.master = Config.get('brightness') / 100;
    controller = new Display.Controller(meter, clock);
  }

  function buildSprites() {
    meter.build(view.S, Config.get('theme'));
    // Vignette at quarter resolution with an eased falloff; it is a smooth gradient,
    // so upscaling is invisible. Dither (below) hides 8-bit banding.
    const k = 0.25, W = cv.width, H = cv.height;
    vignette = Kit.canvas(W * k, H * k);
    const g = vignette.getContext('2d');
    const r = g.createRadialGradient(W * k / 2, H * k / 2, H * k * 0.3, W * k / 2, H * k / 2, W * k * 0.62);
    for (let i = 0; i <= 12; i++) {
      const x = i / 12;
      r.addColorStop(x, `rgba(0,0,0,${(0.9 * x * x * (3 - 2 * x)).toFixed(4)})`);
    }
    g.fillStyle = r;
    g.fillRect(0, 0, W * k, H * k);
    dither = ditherPattern();
  }

  // Static additive noise tile: breaks up banding in dark gradients on 8-bit panels.
  function ditherPattern() {
    const n = Kit.canvas(256, 256), g = n.getContext('2d');
    const img = g.createImageData(256, 256), r = Kit.rng(99);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = r() * 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return ctx.createPattern(n, 'repeat');
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(window.innerWidth * dpr), H = Math.round(window.innerHeight * dpr);
    if (W === cv.width && H === cv.height && view) return;
    cv.width = W; cv.height = H;
    // Fit the 2560x1440 design to the limiting dimension; extra space stays dark.
    const S = Math.min(W / DESIGN_W, H / DESIGN_H);
    view = { S, ox: (W - DESIGN_W * S) / 2, oy: (H - DESIGN_H * S) / 2, W, H };
    buildSprites();
  }

  let lastT = 0;
  function render(t) {
    lastT = t;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#040303';
    ctx.fillRect(0, 0, view.W, view.H);
    meter.draw(ctx, view, t);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(vignette, 0, 0, view.W, view.H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.016;
    ctx.fillStyle = dither;
    ctx.fillRect(0, 0, view.W, view.H);
  }

  function step(t) {
    simT = t;
    if (shiftAt != null && !step.fired && t >= shiftAt) { step.fired = true; controller.shift(t); }
    controller.tick(t);
    meter.update(t);
  }

  // ---------- Loop: capped frame rate, fully stopped while paused or hidden ----------
  const t0 = performance.now();
  let raf = 0, last = 0, hostPaused = false;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const interval = 1000 / Math.max(1, Config.get('fps'));
    if (now - last < interval - 2) return;
    last = now;
    const t = (now - t0) / 1000;
    step(t);
    render(t);
  }
  function running() { return raf !== 0; }
  function start() { if (!running()) { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  function syncRunning() { (hostPaused || document.hidden) ? stop() : start(); }

  Config.on('pause', p => { hostPaused = !!p; syncRunning(); });
  Config.on('shift', () => controller.shift((performance.now() - t0) / 1000));
  document.addEventListener('visibilitychange', syncRunning);

  Config.onChange((key, v) => {
    const t = (performance.now() - t0) / 1000;
    if (key === 'theme') buildSprites();
    else if (key === 'brightness') meter.master = v / 100;
    else if (key === 'mode') controller.setMode(v, t);
    else if (key === 'layout') { makeScene(); buildSprites(); controller.boot(t); }
    if (!running()) render(lastT);
  });
  // Resizing clears the canvas; repaint at once so a paused wallpaper never goes blank.
  window.addEventListener('resize', () => { resize(); render(lastT); });

  makeScene();
  resize();

  if (still != null) {
    // Deterministic single frame for screenshots: simulate at 30 fps up to `still`.
    controller.boot(0);
    for (let t = 0; t <= still + 1e-6; t += 1 / 30) step(t);
    render(still);
    document.title += ' (still)';
  } else {
    controller.boot(0);
    syncRunning();
  }

  // Console helper: SG.shift() triggers a worldline shift.
  window.SG = { config: Config, shift: () => controller.shift((performance.now() - t0) / 1000) };
})();
