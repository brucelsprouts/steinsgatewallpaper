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
  // pins the starting worldline, ?seed=3 picks the ink (stills and recordings use 1),
  // ?inkRest=20 shortens how long each bloom of ink rests before dissolving.
  const fakeNow = q.get('now') ? new Date(q.get('now')).getTime() : null;
  const still = q.has('still') ? Number(q.get('still')) : null;
  const shiftAt = q.has('shiftAt') ? Number(q.get('shiftAt')) : null;
  const cursor = q.get('cursor') ? q.get('cursor').split(',').map(Number) : null;
  const manual = q.has('manual'); // tools/record.html drives frames itself
  const seed = q.has('seed') ? Number(q.get('seed')) : still != null || manual ? 1 : (Math.random() * 1e9) | 0;
  const inkRest = q.has('inkRest') ? Number(q.get('inkRest')) : null;
  let simT = 0;
  const clock = () => new Date(fakeNow != null ? fakeNow + simT * 1000 : Date.now());
  const theme = () => (Config.get('glow') === 'white' ? 'cold' : 'warm');

  const scene = new Scene.Scene(Kit.rng(seed), inkRest != null ? { rest: [inkRest, inkRest] } : {});
  const meter = new Nixie.Meter({ ...Scene.METER, aspect: q.has('aspect') ? Number(q.get('aspect')) : undefined });
  const controller = new Display.Controller(meter, clock);
  const smoke = new Atmos.Smoke(), light = new Atmos.Light();
  smoke.cam = light.cam = scene.dust.cam; // they drift with the near air
  // Clocks spin on every shift and click; a real worldline shift also throws fresh ink
  // and a burst of leaked light.
  controller.onShift = (t, worldline) => {
    scene.shifts.push(t);
    if (worldline) { scene.ink.shift(t); light.flare(t); }
  };
  if (q.get('worldline')) controller.worldline = q.get('worldline'); // debug: pin the boot worldline
  if (cursor) { scene.pointer(cursor[0], cursor[1]); scene.settle(); }

  let view, vignette, grunge, grain, lensDust;

  function buildSprites() {
    meter.build(view.S, theme());
    scene.build(view.S, view, theme());
    const hot = { x: Scene.METER.cx, y: Scene.METER.cy };
    smoke.build(view, hot);
    light.build(view);
    grunge = Atmos.grunge(view);
    lensDust = Atmos.lensDust(view);
    grain = Atmos.grain(view, { ...hot, rx: 560, ry: 230 });
    // Vignette at quarter resolution with an eased falloff.
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
    // Light pooling on the clockwork and a haze of smoke, then the textured border and
    // the vignette. Over those, as if on the film and the lens: light leaks, dust and
    // grain (which also hides 8-bit banding in the dark gradients).
    light.draw(ctx, view, t, 'hot');
    smoke.draw(ctx, view, t);
    ctx.drawImage(grunge, 0, 0, view.W, view.H);
    ctx.drawImage(vignette, 0, 0, view.W, view.H);
    light.draw(ctx, view, t, 'leak');
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.35;
    ctx.drawImage(lensDust, 0, 0, view.W, view.H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'difference';
    ctx.drawImage(grain, 0, 0, view.W, view.H);
    ctx.globalCompositeOperation = 'source-over';
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
  // Recordings and stills drive frames themselves: never start the live loop for them.
  function syncRunning() { if (manual || still != null) return; (hostPaused || document.hidden) ? stop() : start(); }

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

  // Console helpers: SG.shift() triggers a worldline shift, SG.ink() brings fresh ink.
  // The rest drive recordings.
  let simLast = 0;
  window.SG = {
    config: Config,
    shift: () => controller.shift(manual ? simLast : elapsed()),
    ink: () => scene.ink.shift(manual ? simLast : elapsed()),
    click: () => controller.click(manual ? simLast : elapsed()),
    pointer: (x, y) => scene.pointer(x, y),
    state: () => ({ target: meter.target, shifting: meter.shifting, worldline: controller.worldline, ink: scene.ink.blooms.length }),
    renderAt(t) {
      for (let s = simLast + 1 / 30; s < t; s += 1 / 30) step(s);
      step(t);
      render(t);
      simLast = t;
    },
  };
})();
