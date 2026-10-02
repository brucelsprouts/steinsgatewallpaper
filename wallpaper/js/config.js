'use strict';
// Settings from three sources, later ones winning:
//   defaults -> URL query (?theme=cold&layout=quiet...) -> Lively / Wallpaper Engine properties.
const Config = (() => {
  const defaults = {
    theme: 'warm',        // warm | cold
    layout: 'main',       // main (full scene) | quiet (secondary-monitor variant)
    mode: 'time',         // time | divergence | date
    hour12: true,         // time mode: 12- or 24-hour
    worldlines: 'canon',  // canon (mostly 1.048596) | fixed | random
    hold: 60,             // seconds the divergence number holds after the hourly shift
    hourlyShift: true,
    brightness: 100,      // tube brightness, %
    drift: 40,            // how far clocks wander, %
    dust: true,
    fps: 30,
  };

  // Lively dropdowns report an index; map them back to our values.
  const choices = {
    theme: ['warm', 'cold'],
    layout: ['main', 'quiet'],
    mode: ['time', 'divergence', 'date'],
    worldlines: ['canon', 'fixed', 'random'],
  };

  const values = { ...defaults };
  const listeners = [];
  const actions = {};

  function coerce(key, v) {
    const d = defaults[key];
    if (typeof d === 'boolean') return v === true || v === 'true' || v === '1' || v === 1;
    if (typeof d === 'number') { const n = Number(v); return Number.isFinite(n) ? n : d; }
    if (choices[key] && typeof v === 'number') return choices[key][v] ?? d;
    if (choices[key] && !choices[key].includes(String(v))) return d;
    return String(v);
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

  // Lively Wallpaper: livelyPropertyListener(name, value).
  window.livelyPropertyListener = (name, val) => {
    if (name === 'shiftNow') { actions.shift?.(); return; }
    set(name, val);
  };
  window.livelyWallpaperPlaybackChanged = data => {
    try { actions.pause?.(JSON.parse(data).IsPaused); } catch (e) { /* ignore malformed payloads */ }
  };

  // Wallpaper Engine: properties arrive as { key: { value } }.
  window.wallpaperPropertyListener = {
    applyUserProperties(p) {
      for (const k in p) if (p[k] && 'value' in p[k]) set(k, p[k].value);
    },
    applyGeneralProperties(p) {
      if (p.fps) set('fps', Math.min(defaults.fps, p.fps));
    },
    setPaused(paused) { actions.pause?.(paused); },
  };

  return {
    get: k => values[k],
    all: () => ({ ...values }),
    set,
    onChange: fn => listeners.push(fn),
    on: (name, fn) => { actions[name] = fn; },
    query: q,
  };
})();
