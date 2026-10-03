'use strict';
// The user settings, from: defaults -> URL query -> Lively / Wallpaper Engine.
//   centre:  makise (a picture, img/makise.png) | nixie (the divergence meter)
//   display: time | date | worldline (what the nixie meter shows)
//   glow:    orange | white
//   shift:   worldline shifts on/off (random every 20-60 min, and on click)
const Config = (() => {
  const defaults = { centre: 'makise', display: 'time', glow: 'orange', shift: true };
  // Lively dropdowns report an index; map them back to our values.
  const choices = { centre: ['makise', 'nixie'], display: ['time', 'date', 'worldline'], glow: ['orange', 'white'] };

  const values = { ...defaults };
  const listeners = [];
  const actions = {};
  let hostFps = 30;

  function coerce(key, v) {
    const d = defaults[key];
    if (typeof d === 'boolean') return v === true || v === 'true' || v === '1' || v === 1;
    if (typeof v === 'number') return choices[key][v] ?? d;
    return choices[key].includes(String(v)) ? String(v) : d;
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
    get: k => values[k],
    set,
    onChange: fn => listeners.push(fn),
    on: (name, fn) => { actions[name] = fn; },
    fps: () => Math.min(30, hostFps),
    query: q,
  };
})();
