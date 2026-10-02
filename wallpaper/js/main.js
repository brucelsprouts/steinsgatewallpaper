'use strict';
// Boot, layout, render loop, input, frame cap and pausing.
(() => {
  const DESIGN_W = 2560, DESIGN_H = 1440;
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const q = Config.query;

  // Debug hooks (not settings): ?now=2026-10-02T09:59:55 fakes the wall clock,
  // ?still=3.2 renders a single frame that many seconds after boot, ?shiftAt=5 fires
  // a worldline shift then, ?cursor=0.8,-0.4 pins the parallax camera, ?worldline=1.048596
  // pins the starting worldline.
  const fakeNow = q.get('now') ? new Date(q.get('now')).getTime() : null;
  const still = q.has('still') ? Number(q.get('still')) : null;
  const shiftAt = q.has('shiftAt') ? Number(q.get('shiftAt')) : null;
  const cursor = q.get('cursor') ? q.get('cursor').split(',').map(Number) : null;
  const manual = q.has('manual'); // tools/record.html drives frames itself
  let simT = 0;
  const clock = () => new Date(fakeNow != null ? fakeNow + simT * 1000 : Date.now());
  const theme = () => (Config.get('glow') === 'white' ? 'cold' : 'warm');

  const scene = new Scene.Scene();
  const meter = new Nixie.Meter({ ...Scene.METER, aspect: q.has('aspect') ? Number(q.get('aspect')) : undefined });
  const controller = new Display.Controller(meter, clock);
  controller.onShift = t => scene.shifts.push(t);
  if (q.get('worldline')) controller.worldline = q.get('worldline'); // debug: pin the boot worldline
  if (cursor) { scene.pointer(cursor[0], cursor[1]); scene.settle(); }

  let view, vignette, dither, grunge, scratches;

  function buildSprites() {
    meter.build(view.S, theme());
    scene.build(view.S, view, theme());
    grunge = Atmos.grunge(view);
    scratches = Atmos.scratches(view);
    // Vignette at quarter resolution with an eased falloff; dither hides 8-bit banding.
    const k = 0.25, W = view.W, H = view.H;
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

  // Static additive noise tile.
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
    if (view && W === cv.width && H === cv.height) return;
    cv.width = W; cv.height = H;
    // Fit the 2560x1440 design to the limiting dimension; extra space stays dark.
    const S = Math.min(W / DESIGN_W, H / DESIGN_H);
    view = { S, ox: (W - DESIGN_W * S) / 2, oy: (H - DESIGN_H * S) / 2, W, H };
    buildSprites();
  }

  let lastT = 0;
  function render(t) {
    lastT = t;
    const now = clock();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#040303';
    ctx.fillRect(0, 0, view.W, view.H);
    scene.drawBehind(ctx, view, t, now);
    const m = scene.meterOffset(t);
    meter.draw(ctx, { ...view, ox: view.ox + m.x * view.S, oy: view.oy + m.y * view.S }, t);
    scene.drawFront(ctx, view, t, now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Textured border, then the smooth vignette, then scratches "on the glass".
    ctx.drawImage(grunge, 0, 0, view.W, view.H);
    ctx.drawImage(vignette, 0, 0, view.W, view.H);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.22;
    ctx.drawImage(scratches, 0, 0);
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
    scene.update(t);
  }

  // ---------- Loop: capped frame rate, fully stopped while paused or hidden ----------
  const t0 = performance.now();
  const elapsed = () => (performance.now() - t0) / 1000;
  let raf = 0, last = 0, hostPaused = false;

  function frame(nowMs) {
    raf = requestAnimationFrame(frame);
    if (nowMs - last < 1000 / Config.fps() - 2) return;
    last = nowMs;
    const t = (nowMs - t0) / 1000;
    step(t);
    render(t);
  }
  const running = () => raf !== 0;
  function start() { if (!running()) { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  function syncRunning() { (hostPaused || document.hidden) ? stop() : start(); }

  Config.on('pause', p => { hostPaused = !!p; syncRunning(); });
  document.addEventListener('visibilitychange', syncRunning);

  Config.onChange((key, v) => {
    if (key === 'glow') buildSprites();
    else if (key === 'display') controller.setMode(v, elapsed());
    if (!running()) render(lastT);
  });

  // Lively and Wallpaper Engine forward desktop mouse input to the page.
  if (!cursor) {
    window.addEventListener('pointermove', e => {
      scene.pointer(e.clientX / window.innerWidth * 2 - 1, e.clientY / window.innerHeight * 2 - 1);
    });
  }
  window.addEventListener('pointerdown', e => { if (e.button === 0) controller.click(elapsed()); });
  // Resizing clears the canvas; repaint at once so a paused wallpaper never goes blank.
  window.addEventListener('resize', () => { resize(); render(lastT); });

  resize();
  controller.boot(0);
  if (manual) {
    render(0);
  } else if (still != null) {
    // Deterministic single frame for screenshots: simulate at 30 fps up to `still`.
    for (let t = 0; t <= still + 1e-6; t += 1 / 30) step(t);
    render(still);
    document.title += ' (still)';
  } else {
    syncRunning();
  }

  // Console helper: SG.shift() triggers a worldline shift. The rest drive recordings.
  let simLast = 0;
  window.SG = {
    config: Config,
    shift: () => controller.shift(manual ? simLast : elapsed()),
    click: () => controller.click(manual ? simLast : elapsed()),
    pointer: (x, y) => scene.pointer(x, y),
    renderAt(t) {
      for (let s = simLast + 1 / 30; s < t; s += 1 / 30) step(s);
      step(t);
      render(t);
      simLast = t;
    },
  };
})();
