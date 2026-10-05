'use strict';
// The user settings, from: defaults -> URL query -> Lively / Wallpaper Engine.
//   centre:    makise (a picture, img/makise.webp) | time | date | worldline (the nixie
//              meter, showing that)
//   glow:      0-100, the centrepiece's glow: Makise's backlight, or the tubes' bloom
//   glowSize:  0-100, how far that glow spreads (50 as designed)
//   ink:       0-100, how strong the ink is (50 as designed)
//   texture:   0-100, how strong the printed texture is: the mottled backdrop, the
//              halftone patches and the worn print over everything (50 as designed)
//   schematic: 0-100, how bright the schematics behind everything are: one faint
//              drafting drawing, slowly redrawing itself (50 as designed, 0 turns it off)
//   motion:    Makise's hair, arms and breath moving, and her float
//   parallax:  the scene drifting with the cursor
//   shift:     worldline shifts on/off (random every 20-60 min, and on click)
// `display` (what the meter shows) is read from `centre`: time while it's Makise.
const Config = (() => {
  const defaults = { centre: 'makise', glow: 50, glowSize: 50, ink: 50, texture: 50, schematic: 50, motion: true, parallax: true, shift: true };
  // Lively dropdowns report an index; map them back to our values.
  const choices = { centre: ['makise', 'time', 'date', 'worldline'] };
  // Older links and saved settings: `centre=nixie` was the meter, `display` what it showed.
  const legacy = { nixie: 'time' };

  const values = { ...defaults };
  const listeners = [];
  const actions = {};
  let hostFps = 30;

  function coerce(key, v) {
    const d = defaults[key];
    if (typeof d === 'boolean') return v === true || v === 'true' || v === '1' || v === 1;
    if (typeof d === 'number') return Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : d;
    if (typeof v === 'number') return choices[key][v] ?? d;
    v = legacy[v] || String(v);
    return choices[key].includes(v) ? v : d;
  }

  function set(key, v) {
    if (!(key in defaults)) return;
    const nv = coerce(key, v);
    if (values[key] === nv) return;
    values[key] = nv;
    for (const fn of listeners) fn(key, nv);
  }

  const q = new URLSearchParams(location.search);
  for (const [k, v] of q) if (k in defaults) values[k] = coerce(k, v);
  if (values.centre === 'time' && ['date', 'worldline'].includes(q.get('display'))) values.centre = q.get('display');

  // Lively Wallpaper.
  window.livelyPropertyListener = (name, val) => set(name, val);
  window.livelyWallpaperPlaybackChanged = data => {
    try { actions.pause?.(JSON.parse(data).IsPaused); } catch (e) { /* ignore malformed payloads */ }
  };

  // Wallpaper Engine: properties arrive as { key: { value } }.
  window.wallpaperPropertyListener = {
    applyUserProperties(p) {
      for (const k in p) if (p[k] && 'value' in p[k]) set(k, p[k].value);
    },
    // Respect a lower frame limit chosen in Wallpaper Engine's own settings.
    applyGeneralProperties(p) { if (p.fps) hostFps = p.fps; },
    setPaused(paused) { actions.pause?.(paused); },
  };

  return {
    get: k => (k === 'display' ? (values.centre === 'makise' ? 'time' : values.centre) : values[k]),
    set,
    onChange: fn => listeners.push(fn),
    on: (name, fn) => { actions[name] = fn; },
    fps: () => Math.min(30, hostFps),
    query: q,
  };
})();
