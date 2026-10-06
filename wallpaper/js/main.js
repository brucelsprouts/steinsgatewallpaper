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
  // ?inkRest=20 shortens how long each bloom of ink rests before dissolving,
  // ?inkBlend=overlay&inkGain=0.6 lays the ink on another way, ?speed=5 runs time faster.
  const fakeNow = q.get('now') ? new Date(q.get('now')).getTime() : null;
  const still = q.has('still') ? Number(q.get('still')) : null;
  const shiftAt = q.has('shiftAt') ? Number(q.get('shiftAt')) : null;
  const cursor = q.get('cursor') ? q.get('cursor').split(',').map(Number) : null;
  const manual = q.has('manual'); // tools/record.html drives frames itself
  const seed = q.has('seed') ? Number(q.get('seed')) : still != null || manual ? 1 : (Math.random() * 1e9) | 0;
  const inkRest = q.has('inkRest') ? Number(q.get('inkRest')) : null;
  let simT = 0;
  const clock = () => new Date(fakeNow != null ? fakeNow + simT * 1000 : Date.now());
  const theme = () => 'warm'; // the scene's light: always orange (a 'cold' white one exists too)
  // How far the centrepiece's glow spreads (glowSize 0-100, 50 as designed: half as far to
  // twice), and how strong the meter's is (glow 0-100, 50 as designed).
  const spread = () => 2 ** ((Config.get('glowSize') - 50) / 50);
  const meterGlow = () => Config.get('glow') / 50;

  // The ink's strength: the setting (0-100, 50 as designed) scales its usual gain, or
  // the one ?inkGain asks for.
  const inkGain = () => (q.has('inkGain') ? Number(q.get('inkGain')) : Ink.GAIN) * Config.get('ink') / 50;
  const scene = new Scene.Scene(Kit.rng(seed), {
    rest: inkRest != null ? [inkRest, inkRest] : undefined,
    blend: q.get('inkBlend') || undefined,
    gain: inkGain(),
  });
  const meter = new Nixie.Meter({ ...Scene.METER, aspect: q.has('aspect') ? Number(q.get('aspect')) : undefined });
  const portrait = new Portrait.Portrait();
  const controller = new Display.Controller(meter, clock);
  const smoke = new Atmos.Smoke(), light = new Atmos.Light(Kit.rng(seed + 7)), lens = new Atmos.LensDust();
  const grain = new Atmos.Grain(), bloom = new Atmos.Bloom();
  // The texture of a printed key visual, kept quiet so it stays in the background: a
  // mottled backdrop behind everything, a screentone of pale dots in the pool of dark
  // around the centrepiece, a finer halftone on Makise's coat and a worn print over it
  // all. The setting (0-100, 50 as designed) scales them all.
  const backdrop = new Atmos.Backdrop(), print = new Atmos.Print();
  const screen = new Atmos.Tone({ cell: 12, color: 'rgb(228,218,206)', blend: 'screen' });
  const onMakise = new Atmos.Tone({ cell: 7, color: 'rgb(60,60,60)', blend: 'soft-light', res: 1, seed: 67 });
  const texture = () => Config.get('texture') / 50;
  // The schematics: one faint drafting drawing behind everything, slowly redrawing
  // itself. The setting (0-100, 50 as designed) scales how bright its lines are.
  const drafting = new Schematic.Field(Kit.rng(seed + 11));
  drafting.quiet([Scene.ASTROLABE]); // it leaves the big clock room to read
  const schematic = () => Config.get('schematic') / 50;
  backdrop.cam = drafting.cam = scene.dust.cam;
  smoke.cam = light.cam = scene.dust.cam; // they drift with the near air
  scene.dust.beam = (x, y, t) => light.beamAt(x, y, t); // dust glints in the light shafts
  // Clocks spin on every shift and click, and the picture flickers; a real worldline
  // shift also throws fresh ink and a burst of leaked light, and
  // redraws the schematics.
  controller.onShift = (t, worldline) => {
    scene.shifts.push(t);
    portrait.hit(t, worldline);
    if (worldline) { scene.ink.shift(t); light.flare(t); drafting.shift(t); }
  };
  if (q.get('worldline')) controller.worldline = q.get('worldline'); // debug: pin the boot worldline
  if (cursor) { scene.pointer(cursor[0], cursor[1]); scene.settle(); }

  // The centrepiece showing: the picture, unless the settings say the meter or the
  // picture can't be loaded.
  const centre = () => (Config.get('centre') === 'makise' && portrait.ok !== false ? 'makise' : 'nixie');

  let view, vignette, grunge;

  function buildSprites() {
    const makise = centre() === 'makise', f = makise ? Portrait.FOCUS : Scene.FOCUS;
    meter.glow = meterGlow();
    meter.build(view.S, theme(), spread());
    if (makise) portrait.build(view.S, theme());
    scene.build(view.S, view, theme(), f);
    smoke.build(view, f);
    backdrop.build(view, f);
    drafting.build(view);
    // Round the meter the schematics keep a clear middle; round Makise they run on behind
    // her, and only their shapes keep off her.
    drafting.centre(f, makise ? { figure: Portrait.FIGURE } : { clear: true });
    // The screentone: around the middle of the centrepiece, and out into the empty strip
    // down the left edge.
    // The screentone and the halftone are Makise's alone.
    if (makise) {
      screen.build(view, [{ x: f.x, y: f.y + 40, rx: 560, ry: 460, a: 0.9 }, { x: 70, y: 600, rx: 300, ry: 290, a: 0.85 }]);
      // The halftone on Makise: her coat on either side.
      onMakise.build(view, [{ x: 850, y: 800, rx: 170, ry: 240, a: 0.8 }, { x: 330, y: 900, rx: 120, ry: 180, a: 0.7 }]);
    }
    print.build(view);
    light.build(view);
    grunge = Atmos.grunge(view);
    liftCorners(grunge, 0.6, 0.5);
    lens.build();
    bloom.build(view);
    grain.build(view, makise ? { x: f.x, y: f.y, rx: 520, ry: 640 } : { x: f.x, y: f.y, rx: 560, ry: 230 });
    // Vignette at quarter resolution with an eased falloff.
    const k = 0.25, W = view.W, H = view.H;
    vignette = Kit.canvas(W * k, H * k);
    const g = vignette.getContext('2d');
    const r = g.createRadialGradient(W * k / 2, H * k / 2, H * k * 0.3, W * k / 2, H * k / 2, W * k * 0.62);
    for (let i = 0; i <= 12; i++) {
      const x = i / 12;
      r.addColorStop(x, `rgba(0,0,0,${(0.82 * x * x * (3 - 2 * x)).toFixed(4)})`);
    }
    g.fillStyle = r;
    g.fillRect(0, 0, W * k, H * k);
    liftCorners(vignette, 0.55, 0.45);
  }

  // Ease a darkening layer off in the left-hand corners, so the clockwork beside the
  // centrepiece isn't lost. `top` and `bottom` are how much of it to take away at the
  // very corner; where the two meet, halfway down the edge, a little goes too.
  function liftCorners(c, top, bottom) {
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'destination-out';
    for (const [y, amount] of [[0, top], [c.height, bottom]]) {
      const lift = g.createRadialGradient(0, y, 0, 0, y, c.width * 0.42);
      lift.addColorStop(0, `rgba(0,0,0,${amount})`);
      lift.addColorStop(0.5, `rgba(0,0,0,${amount * 0.45})`);
      lift.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lift;
      g.fillRect(0, 0, c.width, c.height);
    }
    g.globalCompositeOperation = 'source-over';
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
    // The schematics: faint lines on the black, everything else drawn over them. Round the
    // meter they go in first, so the pool of dark the scene keeps round it dims them too;
    // round Makise they go in after it, so they fill the space round her.
    const sk = schematic(), m = scene.meterOffset(t), makise = centre() === 'makise';
    if (sk > 0 && !makise) drafting.draw(ctx, view, t, 0.2 * sk, m);
    scene.drawBehind(ctx, view, t, now);
    if (sk > 0 && makise) drafting.draw(ctx, view, t, 0.2 * sk, m);
    // The backdrop and the screentone go in after the pool of dark the scene keeps around
    // the centrepiece, so they reach the whole frame and show in that pool; the backdrop
    // eases off around the centrepiece by itself. The screentone and the halftone on
    // Makise move with the centrepiece.
    const tx = texture();
    if (tx > 0) backdrop.draw(ctx, view, t, 0.045 * tx);
    if (makise) {
      if (tx > 0) screen.draw(ctx, view, 0.085 * tx, m);
      portrait.draw(ctx, view, t, m);
      if (tx > 0) onMakise.draw(ctx, view, 0.45 * tx, m);
    } else meter.draw(ctx, { ...view, ox: view.ox + m.x * view.S, oy: view.oy + m.y * view.S }, t);
    scene.drawFront(ctx, view, t, now);
    // Light pooling on the clockwork, shafts of light and a haze of smoke, a bloom on
    // everything bright, then the textured border, the vignette and the worn print over
    // it all. Over those, as if on the film and the lens: light leaks, dust and grain
    // (which also hides 8-bit banding in the dark gradients).
    light.draw(ctx, view, t, 'hot');
    light.draw(ctx, view, t, 'rays');
    smoke.draw(ctx, view, t);
    bloom.draw(ctx, cv, view);
    ctx.drawImage(grunge, 0, 0, view.W, view.H);
    ctx.drawImage(vignette, 0, 0, view.W, view.H);
    if (tx > 0) print.draw(ctx, view, { wear: 0.25 * tx, scratches: 0.2 * tx });
    light.draw(ctx, view, t, 'leak');
    lens.draw(ctx, view, t);
    grain.draw(ctx, view);
  }

  function step(t) {
    simT = t;
    if (shiftAt != null && !step.fired && t >= shiftAt) { step.fired = true; controller.shift(t); }
    controller.tick(t);
    meter.update(t);
    scene.update(t);
    portrait.update(t, scene.meterOffset(t), scene.meterCam);
    light.update(t);
    drafting.update(t);
  }

  // ---------- Loop: capped frame rate, fully stopped while paused or hidden ----------
  // Seconds since boot; a preview may run time faster (?speed=5 or SG.speed(5)).
  let speed = Number(q.get('speed')) > 0 ? Number(q.get('speed')) : 1, base = 0, mark = performance.now();
  const elapsed = (ms = performance.now()) => base + (ms - mark) / 1000 * speed;
  let raf = 0, last = 0, hostPaused = false, cost = 0, frames = 0;

  function frame(nowMs) {
    raf = requestAnimationFrame(frame);
    if (nowMs - last < 1000 / Config.fps() - 2) return;
    last = nowMs;
    const t = Math.max(lastT, elapsed(nowMs)), c0 = performance.now();
    step(t);
    render(t);
    // What a frame costs, for the preview; the first second (textures going up to the
    // GPU, ink still being painted) is left out.
    const ms = performance.now() - c0;
    if (++frames > 30) cost = cost ? cost + (ms - cost) * 0.05 : ms;
  }
  const running = () => raf !== 0;
  function start() { if (!running()) { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  // Recordings and stills drive frames themselves: never start the live loop for them.
  function syncRunning() { if (manual || still != null) return; (hostPaused || document.hidden) ? stop() : start(); }

  Config.on('pause', p => { hostPaused = !!p; syncRunning(); });
  document.addEventListener('visibilitychange', syncRunning);

  Config.onChange((key, v) => {
    if (key === 'centre') { controller.setMode(Config.get('display'), elapsed()); buildSprites(); }
    else if (key === 'glowSize') buildSprites();
    else if (key === 'glow') meter.glow = meterGlow();
    else if (key === 'ink') scene.ink.style({ blend: scene.ink.blend, gain: inkGain() });
    else if (key === 'parallax' && !v) scene.pointer(0, 0);
    if (!running()) render(lastT);
  });

  // Lively and Wallpaper Engine forward desktop mouse input to the page.
  if (!cursor) {
    window.addEventListener('pointermove', e => {
      if (!Config.get('parallax')) return;
      scene.pointer(e.clientX / window.innerWidth * 2 - 1, e.clientY / window.innerHeight * 2 - 1);
    });
  }
  window.addEventListener('pointerdown', e => { if (e.button === 0) controller.click(elapsed()); });
  // Resizing clears the canvas; repaint at once so a paused wallpaper never goes blank.
  window.addEventListener('resize', () => { resize(); render(lastT); });

  resize();
  controller.boot(0);
  // The picture loads alongside; once it's in, it's baked (or, if it can't be had, the
  // meter takes its place). Stills and recordings wait for it.
  const settled = portrait.load().then(ok => {
    if (!view) return;
    if (ok && centre() === 'makise') portrait.build(view.S, theme());
    else if (!ok && Config.get('centre') === 'makise') buildSprites();
  });
  if (manual) {
    settled.then(() => render(0));
  } else if (still != null) {
    // Deterministic single frame for screenshots: simulate at 30 fps up to `still`.
    settled.then(() => {
      for (let t = 0; t <= still + 1e-6; t += 1 / 30) step(t);
      render(still);
      document.title += ' (still)';
    });
  } else {
    syncRunning();
    settled.then(() => { if (!running()) render(lastT); });
  }

  // Console helpers: SG.shift() triggers a worldline shift, SG.ink() brings fresh ink
  // (SG.ink('blot') a given kind), SG.leak() a light leak. The rest drive recordings
  // and tools/preview.html.
  let simLast = 0;
  const simNow = () => (manual ? simLast : elapsed());
  window.SG = {
    config: Config,
    shift: () => controller.shift(simNow()),
    ink: kind => scene.ink.shift(simNow(), kind)?.kind ?? null,
    leak: () => light.add(simNow(), 0, 3).edge,
    click: () => controller.click(simNow()),
    pointer: (x, y) => scene.pointer(x, y),
    speed(s) { if (s > 0) { base = elapsed(); mark = performance.now(); speed = s; } },
    paint(style) {
      scene.ink.style({ blend: scene.ink.blend, gain: scene.ink.gain, ...style });
      if (!running()) render(lastT);
    },
    state: () => ({
      centre: centre(), target: meter.target, shifting: meter.shifting, worldline: controller.worldline,
      t: lastT, seed, speed, running: running(), ms: cost, frames,
      paint: { blend: scene.ink.blend, gain: scene.ink.gain },
      ink: scene.ink.blooms.map(b => ({ kind: b.kind, color: b.color, rgb: Ink.INKS[b.color], phase: b.phase(lastT)[0] })),
    }),
    renderAt(t) {
      for (let s = simLast + 1 / 30; s < t; s += 1 / 30) step(s);
      step(t);
      render(t);
      simLast = t;
    },
  };
})();
