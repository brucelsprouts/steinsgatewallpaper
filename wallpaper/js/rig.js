'use strict';
// Rig: brings a still picture to life the way Wallpaper Engine's image effects (Shake,
// Water waves, Depth parallax) and the spring bones of its puppet warp do. Nothing is cut
// out and nothing has to be filled in behind: every pixel of the one picture is pushed a
// little, by how strongly each effect was painted there. Where a part moves, the picture
// around it stretches and squeezes to follow over the soft edge of what was painted, so
// nothing can tear open, and whatever is held stays exactly where it is.
//
// A rig is a list of effects, each with its own mask (painted in tools/rig.html, stored
// three to a PNG beside the picture, at half its size) and settings:
//   hold      what must never bend: the other effects leave it be (though breathing and
//             parallax still carry it, whole)
//   sway      trails behind as the picture drifts, and blows in the breeze (hair)
//   swing     turns about a pivot the same way (an arm in its sleeve)
//   wave      ripples running across it (hair, loose cloth)
//   breathe   rises and falls with each breath
//   parallax  shifts with the cursor as if nearer (or, with less than 0, farther)
//   blink     shuts the eyes now and then. It has two masks: the eye, and inside it the
//             upper lid (its lash) that comes down over it
// The masks are painted on the picture standing still. For each pixel it draws, the shader
// finds which pixel of the picture has been pushed there (a few rounds of fixed-point
// iteration), so each mask moves along with what it was painted on. A mask's soft edge
// should be at least as wide as the part it moves travels: a sharp one folds the picture
// over itself, which shows as a seam. A blink is the one exception: it pushes nothing.
// After the rest is worked out, its lid is drawn again further down, its bottom edge
// coming down to the bottom of the eye, and where the lid was or has passed shows skin (the
// colour at a spot chosen on her face). So it covers the eye completely, whatever is above
// it, where a push could only squeeze the eye and a look further up would pull hair down.
// Or the shut eyes can be drawn: a picture of their own (img/makise-lids.png beside
// img/makise.webp: the picture's size, transparent but for the shut lids), which is simply
// shown over her, moving with her, for as long as each blink lasts. Then nothing comes
// down and the blink's masks aren't needed.
//
// A rig lives beside its picture: img/makise.webp has img/makise-rig.js (a script, so it
// loads from a local file too) and the masks it names.
const Rig = (() => {
  const { TAU, hash } = Kit;
  const MAX = 15;     // masks in one rig (three to each of five textures): a blink has two
  const SCALE = 0.5;  // the masks' size, against the picture's
  // How far up and down a blink looks for its lid and the bottom of its eye (picture px):
  // REACH steps of STEP, so an eye up to about 90 px from the top of its lid to its bottom.
  const STEP = 2, REACH = 48;

  // The settings an effect takes: default, range, step, label, unit and what it does.
  const P = (v, min, max, step, label, unit, tip) => ({ v, min, max, step, label, unit, tip });
  const SPRING = {
    gain: P(1.5, 0, 4, 0.05, 'Strength', '×', 'How much of its lag behind the picture shows'),
    wind: P(3, 0, 20, 0.1, 'Wind', 'px', 'How far an average breeze pushes it'),
    hz: P(0.55, 0.1, 3, 0.01, 'Stiffness', 'Hz', 'How quickly it swings back'),
    damp: P(0.3, 0.02, 1, 0.01, 'Damping', '', 'How soon it settles'),
    max: P(12, 1, 40, 0.5, 'Limit', 'px', 'About the most it ever moves'),
    idle: P(0, 0, 20, 0.1, 'Idle', 'px', 'How far it drifts about on its own, slowly, as if she shifted it'),
  };
  // The kinds of effect: their names and colours in the editor, whether held areas stay
  // still under them by default, and their settings (in the picture's own px).
  const KINDS = {
    hold: { label: 'Hold still', color: [255, 72, 72], params: {},
      tip: 'What must never bend. Sway, swing and waves leave it be; breathing and parallax still carry it, whole' },
    sway: { label: 'Sway', color: [255, 168, 64], hold: true, params: SPRING,
      tip: 'Trails behind as she drifts, and blows in the breeze' },
    swing: { label: 'Swing', color: [130, 222, 100], hold: true, point: 'pivot',
      params: { ...SPRING, max: P(6, 1, 40, 0.5, 'Limit', 'px', 'About the most its tip ever moves'),
        length: P(500, 50, 1500, 10, 'Length', 'px', 'From the pivot to the tip: how far the swing reaches') },
      tip: 'Turns about its pivot as it trails and blows: an arm in its sleeve' },
    wave: { label: 'Waves', color: [80, 196, 255], hold: true,
      params: {
        amount: P(1, 0, 10, 0.05, 'Strength', 'px', 'How far the ripples push, sideways to the way they run'),
        length: P(250, 20, 1500, 5, 'Length', 'px', 'From one ripple to the next'),
        speed: P(60, 0, 400, 1, 'Speed', 'px/s', 'How fast they run'),
        dir: P(90, 0, 360, 1, 'Direction', '°', 'Which way they run: 0 right, 90 down'),
        gust: P(2, 0, 6, 0.05, 'Gusts', '×', 'How much stronger they get in a gust'),
        vary: P(1.4, 0, 4, 0.05, 'Variation', '', 'How far out of step neighbouring strands run'),
      },
      tip: 'Ripples running across it, like hair or loose cloth in the wind' },
    breathe: { label: 'Breathe', color: [255, 112, 200], hold: false,
      params: {
        amount: P(1, 0, 10, 0.05, 'Strength', 'px', 'How far each breath moves it'),
        dir: P(270, 0, 360, 1, 'Direction', '°', 'Which way: 270 up'),
        period: P(4.8, 1, 15, 0.1, 'Period', 's', 'Seconds a breath'),
      },
      tip: 'Rises and falls with each breath' },
    parallax: { label: 'Parallax', color: [176, 136, 255], hold: false,
      params: { amount: P(5, -40, 40, 0.5, 'Depth', 'px', 'How far it shifts with the cursor: nearer, or below 0 farther') },
      tip: 'Shifts with the cursor, as if nearer (or farther) than the rest' },
    blink: { label: 'Blink', color: [250, 226, 80], lid: [90, 200, 255], hold: null, point: 'skin',
      params: {
        every: P(5, 1.5, 30, 0.1, 'Every', 's', 'Seconds between blinks on average, from a quarter of this to 1.75 times'),
        span: P(0.16, 0.06, 0.6, 0.01, 'Length', 's', 'How long a blink takes, shutting and opening again'),
        twice: P(0.15, 0, 1, 0.01, 'Doubles', '', 'How often a second blink follows straight after'),
        dir: P(90, 0, 360, 1, 'Direction', '°', 'Which way the lid comes down: 90 down'),
        shade: P(0.3, 0, 0.6, 0.01, 'Shade', '', 'How much darker the shut lid is than the skin it takes its colour from: most at its top, under her hair, easing off toward the lash'),
      },
      tip: 'Shuts the eyes now and then: the lid comes down over the eye until its lower edge reaches the bottom of the eye, and skin fills in above it. Paint the Eye over all of each eye, from the top of its lash to its lower lid, then the Lid inside it over the dark upper lash (a px or so beyond it), and drag the skin spot onto bare skin' },
  };
  // How many masks an effect of a kind has: a blink's eye and lid, one for the rest.
  const slots = kind => (kind === 'blink' ? 2 : 1);

  const num = (v, p) => (Number.isFinite(Number(v)) ? Math.min(p.max, Math.max(p.min, Number(v))) : p.v);

  // A rig as written (by the editor or by hand), checked and completed: unknown kinds,
  // any hold beyond the first and effects past MAX masks are dropped, settings kept in
  // range, defaults filled in. A blink pays Hold still no heed, so it has no say in it.
  // Each effect keeps its mask, [map, channel] into `maps`, if it has a valid one (and a
  // blink its lid's); a swing its pivot and a blink its skin spot (picture px).
  function normalize(src = {}) {
    const maps = Array.isArray(src.maps) ? src.maps.map(String) : [];
    const slot = m => (Array.isArray(m) && m[0] >= 0 && m[0] < maps.length && m[1] >= 0 && m[1] < 3 ? [m[0] | 0, m[1] | 0] : null);
    const point = v => (Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? [v[0], v[1]] : [0, 0]);
    const effects = [];
    let used = 0;
    for (const raw of Array.isArray(src.effects) ? src.effects : []) {
      const K = raw && KINDS[raw.kind];
      if (!K || used + slots(raw.kind) > MAX || (raw.kind === 'hold' && effects.some(e => e.kind === 'hold'))) continue;
      used += slots(raw.kind);
      const e = { kind: raw.kind, name: String(raw.name || K.label), on: raw.on !== false };
      if (raw.kind !== 'hold' && K.hold !== null) e.hold = typeof raw.hold === 'boolean' ? raw.hold : K.hold;
      for (const [k, p] of Object.entries(K.params)) e[k] = num(raw[k], p);
      if (K.point) e[K.point] = point(raw[K.point]);
      e.mask = slot(raw.mask);
      if (raw.kind === 'blink') e.lid = slot(raw.lid);
      effects.push(e);
    }
    const size = Array.isArray(src.size) && src.size.length === 2 ? src.size.map(Number) : null;
    return { size, maps, effects };
  }

  // A fresh effect of a kind, with its defaults.
  function make(kind, name) {
    return normalize({ maps: [], effects: [{ kind, name }] }).effects[0];
  }

  // Rig files call Rig.add() with their description; loading one waits for that.
  const added = new Map();
  function add(desc) { added.set(document.currentScript ? document.currentScript.src : '', desc); }
  // The rig at `url` (normalized), or null if there's none or it can't be read.
  function load(url) {
    return new Promise(resolve => {
      const s = document.createElement('script');
      const done = desc => { s.remove(); added.delete(s.src); resolve(desc ? normalize(desc) : null); };
      s.onload = () => done(added.get(s.src));
      s.onerror = () => done(null);
      s.src = url;
      document.head.appendChild(s);
    });
  }

  // ---------- Motion: the breeze, breathing and the springs ----------

  // The breeze at time t: a slow wander, and now and then a gust. `x` is its push (about
  // -2.5..2.5) and `gust` how strong a gust is blowing (0..1).
  function breeze(t) {
    const wander = 0.6 * Math.sin(t * 0.31) + 0.4 * Math.sin(t * 0.53 + 1.3);
    // About half of all 14 s spans bring a gust, at a random moment, lasting 3-5 s.
    const n = Math.floor(t / 14);
    let gust = 0, dir = 1;
    if (hash(n, 71) < 0.5) {
      const u = (t - n * 14 - hash(n, 72) * 9) / (3 + 2 * hash(n, 73));
      if (u > 0 && u < 1) gust = Math.sin(Math.PI * u) ** 2 * (0.6 + 0.4 * hash(n, 74));
      dir = hash(n, 75) < 0.7 ? 1 : -1;
    }
    return { x: wander + 1.5 * gust * dir, gust };
  }

  // How full of breath she is at time t (0..1): in quicker than out, every `period`
  // seconds, never quite in step with itself.
  function breath(t, period = 4.8) {
    const u = (((t + 0.7 * Math.sin(t / 17)) / period) % 1 + 1) % 1;
    return u < 0.4 ? 0.5 - 0.5 * Math.cos(Math.PI * u / 0.4) : 0.5 + 0.5 * Math.cos(Math.PI * (u - 0.4) / 0.6);
  }

  // How far an effect drifts about on its own at time t (about -1..1): slow waves out of
  // step with one another, timed by its own `seed` (0..1).
  function drift(t, seed) {
    return 0.5 * Math.sin(t * 0.29 + seed * 6.1) + 0.32 * Math.sin(t * 0.53 + seed * 9.7) + 0.18 * Math.sin(t * 1.07 + seed * 4.3);
  }
  // An effect's own seed, from its name.
  function seedOf(name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 100003;
    return hash(h, 61);
  }

  // How shut the eyes are `u` seconds into a blink `span` seconds long (0..1): shutting over
  // its first 30%, shut for the next 25%, opening (a little slower) over the rest.
  function blinkCurve(u, span) {
    const x = u / span;
    if (!(x > 0 && x < 1)) return 0;
    if (x < 0.3) return 0.5 - 0.5 * Math.cos(Math.PI * x / 0.3);
    if (x < 0.55) return 1;
    return 0.5 + 0.5 * Math.cos(Math.PI * (x - 0.55) / 0.45);
  }
  // How shut a blink's eyes are at time t (0..1): once at a random moment in each `every`
  // seconds (in its first three quarters), now and then twice in a row. From the time
  // alone, so every blink with the same `every` (both eyes) shuts at once.
  function shut(t, e) {
    const n = Math.floor(t / e.every);
    let c = 0;
    for (let k = n - 1; k <= n; k++) {
      const at = (k + 0.75 * hash(k, 81)) * e.every;
      c = Math.max(c, blinkCurve(t - at, e.span));
      if (hash(k, 82) < e.twice) c = Math.max(c, blinkCurve(t - at - e.span * (1.2 + 0.4 * hash(k, 83)), e.span));
    }
    return c;
  }

  // A spring trailing a moving anchor (px), pushed sideways by the breeze. Its settings
  // are the effect's own, read as it goes (so the editor's sliders act at once): `hz` how
  // fast it swings back, `damp` how soon it settles, `gain` how far its lag shows at full
  // strength, `wind` how far the breeze pushes it, `idle` how far it drifts about on its
  // own and `max` about the most it ever moves.
  class Spring {
    constructor(o) { this.o = o; this.seed = seedOf(o.name); this.x = this.y = this.vx = this.vy = this.bx = this.by = 0; }
    rest(w, t) { return (w * this.o.wind + drift(t, this.seed) * (this.o.idle || 0)) / Math.max(1e-3, this.o.gain); }
    snap(bx, by, w, t) {
      this.bx = bx; this.by = by; this.vx = this.vy = 0;
      this.x = bx + this.rest(w, t); this.y = by;
    }
    step(dt, bx, by, w, t) {
      const o = this.o, k = (TAU * o.hz) ** 2, c = 2 * o.damp * Math.sqrt(k);
      this.vx += (-k * (this.x - bx - this.rest(w, t)) - c * this.vx) * dt;
      this.vy += (-k * (this.y - by) - 1.6 * c * this.vy) * dt; // hanging: settles sooner up and down
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.bx = bx; this.by = by;
    }
    // How far it has swung from the anchor, at full strength; big swings ease off toward `max`.
    off() {
      const m = this.o.max, g = this.o.gain;
      return { x: m * Math.tanh(g * (this.x - this.bx) / m), y: m * Math.tanh(g * (this.y - this.by) / m) };
    }
  }

  const springy = e => e.kind === 'sway' || e.kind === 'swing';

  // Everything that moves over time: a spring for each sway and swing (trailing the
  // picture as it drifts), the phases of the waves, where the cursor is and the blinks.
  class Motion {
    constructor() {
      this.springs = new WeakMap();
      this.waves = new WeakMap();
      this.cursor = { x: 0, y: 0 };
      this.last = null; // when it was last stepped, and where the picture was
      this.gustAt = -1e9;
      this.blinkAt = -1e9;
    }

    // The breeze at time t, with a gust on top if one was called up (the editor's).
    air(t) {
      const b = breeze(t), u = (t - this.gustAt) / 4;
      if (!(u > 0 && u < 1)) return b;
      const g = Math.sin(Math.PI * u) ** 2;
      return { x: b.x + 1.5 * g, gust: Math.max(b.gust, g) };
    }
    blow(t) { this.gustAt = t; }

    // How shut a blink's eyes are at time t, with a blink on top if one was called up (the
    // editor's).
    shut(t, e) { return Math.max(shut(t, e), blinkCurve(t - this.blinkAt, e.span)); }
    blink(t) { this.blinkAt = t; }

    spring(e) {
      let s = this.springs.get(e);
      if (!s) {
        s = new Spring(e);
        const at = this.last || { t: 0, x: 0, y: 0 };
        s.snap(at.x, at.y, this.air(at.t).x, at.t);
        this.springs.set(e, s);
      }
      return s;
    }

    // Swing the effects along to time t, the picture having drifted to `body` (its px,
    // from home) and the cursor being at `cursor` (-1..1, smoothed the way the scene
    // smooths it). Stepped finely, so it moves the same at any frame rate; after a pause
    // or a jump the springs start again at rest.
    update(t, effects, body, cursor) {
      if (cursor) this.cursor = { x: cursor.x, y: cursor.y };
      const last = this.last, springs = effects.filter(springy).map(e => this.spring(e));
      this.last = { t, x: body.x, y: body.y };
      if (last && t > last.t) {
        for (const e of effects) {
          if (e.kind !== 'wave') continue;
          const w = this.waves.get(e) || { ph: 0, drift: 0 };
          w.ph = (w.ph + (t - last.t) * e.speed / e.length * TAU) % (TAU * 1000);
          w.drift = (w.drift + (t - last.t) * 0.3) % (TAU * 1000);
          this.waves.set(e, w);
        }
      }
      if (!last || t <= last.t || t - last.t > 0.5) {
        const w = this.air(t).x;
        for (const s of springs) s.snap(body.x, body.y, w, t);
        return;
      }
      const n = Math.ceil((t - last.t) * 120), dt = (t - last.t) / n;
      for (let i = 1; i <= n; i++) {
        const u = i / n, x = last.x + (body.x - last.x) * u, y = last.y + (body.y - last.y) * u;
        const tt = last.t + (t - last.t) * u, w = this.air(tt).x;
        for (const s of springs) s.step(dt, x, y, w, tt);
      }
    }

    // What the shader needs of each effect at time t: two vec4s each, the second's w
    // saying whether held areas stay still under it. Effects switched off give nothing.
    values(t, effects) {
      const out = new Float32Array(Math.max(2, effects.length * 2) * 4), b = this.air(t), c = this.cursor;
      effects.forEach((e, i) => {
        const A = i * 8, B = A + 4, rad = (e.dir || 0) * Math.PI / 180;
        out[B + 3] = e.hold ? 1 : 0;
        if (e.kind === 'swing') { out[A] = e.pivot[0]; out[A + 1] = e.pivot[1]; }
        if (!e.on) return;
        if (e.kind === 'hold') out[A] = 1;
        else if (e.kind === 'sway') { const o = this.spring(e).off(); out[A] = o.x; out[A + 1] = o.y; }
        else if (e.kind === 'swing') out[A + 2] = -this.spring(e).off().x / e.length; // its tip trails as the spring says
        else if (e.kind === 'wave') {
          const w = this.waves.get(e) || { ph: 0, drift: 0 };
          out.set([Math.cos(rad), Math.sin(rad), TAU / e.length, w.ph, e.amount * (1 + e.gust * b.gust), e.vary, w.drift], A);
        } else if (e.kind === 'breathe') {
          const k = e.amount * breath(t, e.period);
          out[A] = Math.cos(rad) * k; out[A + 1] = Math.sin(rad) * k;
        } else if (e.kind === 'parallax') {
          // Nearer moves against the cursor, as the scene's nearer layers do.
          out[A] = -c.x * e.amount; out[A + 1] = -c.y * e.amount * 0.7;
        } else if (e.kind === 'blink') {
          out.set([Math.cos(rad), Math.sin(rad), this.shut(t, e), e.shade, e.skin[0], e.skin[1]], A);
        }
      });
      return out;
    }
  }

  // ---------- The push: on the GPU, and the same on the CPU for the tests ----------

  const CH = 'rgb';
  // The shader for a list of effects whose masks are spread over `n` textures, and with
  // `lids` drawn shut eyes in the texture after them. `field(q)` is how far the picture's
  // pixel at q (its px) has been pushed.
  function fragment(effects, n, lids = false) {
    const used = effects.filter(e => e.mask && e.kind !== 'blink');
    const M = e => `a${e.mask[0]}.${CH[e.mask[1]]}`;
    const hold = effects.findIndex(e => e.kind === 'hold' && e.mask);
    const sum = effects.map((e, i) => {
      if (!e.mask || e.kind === 'hold' || e.kind === 'blink') return '';
      const A = `fx[${2 * i}]`, B = `fx[${2 * i + 1}]`, m = `${M(e)} * mix(1.0, free, ${B}.w)`;
      if (e.kind === 'swing') return `  d += turn(q - ${A}.xy, ${m} * ${A}.z);`;
      if (e.kind === 'wave') return `  d += ${m} * ripple(q, ${A}, ${B});`;
      return `  d += ${m} * ${A}.xy;`;
    }).filter(Boolean).join('\n');
    const maps = Array.from({ length: n }, (_, i) => i);
    const blinks = lids ? [] : effects.map((e, i) => [e, i]).filter(([e]) => e.kind === 'blink' && e.mask && e.lid);
    const drawn = lids ? effects.map((e, i) => [e, i]).filter(([e]) => e.kind === 'blink') : [];
    return `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv;
uniform sampler2D pic${maps.map(i => `, m${i}`).join('')}${lids ? ', lids' : ''};
uniform vec2 size;      // the picture, in its own px
uniform float fade;     // how much of its height dissolves at the bottom
uniform float still;    // 1 holds it still (the editor, while painting)
uniform vec4 fx[${Math.max(2, effects.length * 2)}];
// The editor's view of up to two masks: how strongly, which texture and channel, what colour.
uniform float ovK, ovMap, ov2K, ov2Map; uniform vec4 ovSel, ov2Sel; uniform vec3 ovCol, ov2Col;
// How far a point r from a pivot moves, turned by a about it.
vec2 turn(vec2 r, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * r.x - s * r.y, s * r.x + c * r.y) - r;
}
// A ripple at q: running along A.xy, A.z radians a px, at phase A.w; pushing B.x px
// sideways, neighbouring strands B.y out of step (drifting with B.z).
vec2 ripple(vec2 q, vec4 A, vec4 B) {
  vec2 n = vec2(-A.y, A.x);
  return B.x * sin(dot(q, A.xy) * A.z - A.w + B.y * sin(dot(q, n) * 0.06 + B.z)) * n;
}
vec2 field(vec2 q) {
  vec2 t = q / size;
${maps.map(i => `  vec4 a${i} = texture2D(m${i}, t);`).join('\n')}
  float free = ${hold >= 0 ? `1.0 - fx[${2 * hold}].x * ${M(effects[hold])}` : '1.0'};
  vec2 d = vec2(0.0);
${sum}
  return d;
}${blinks.map(([e, i]) => blinkShader(e, i)).join('')}
vec4 shown(vec2 t, float m) {
${maps.map(i => `  if (m < ${i}.5) return texture2D(m${i}, t);`).join('\n')}
  return vec4(0.0);
}
void main() {
  vec2 p = uv * size, q = p;
  if (still < 0.5 && ${used.length ? 'true' : 'false'}) {
    // Plain rounds first, then damped ones, which settle even where the picture is
    // stretched to more than twice its size.
    q = p - field(p);
    q = p - field(q);
    q = mix(q, p - field(q), 0.6);
    q = mix(q, p - field(q), 0.6);
  }
  vec2 t = q / size;
  float inside = step(0.0, t.x) * step(t.x, 1.0) * step(0.0, t.y) * step(t.y, 1.0);
  vec4 c = texture2D(pic, t) * inside;${blinks.length ? `
  if (still < 0.5) {
${blinks.map(([, i]) => `    c = blink${i}(q, c);`).join('\n')}
  }` : ''}${drawn.length ? `
  // The drawn shut eyes, all at once for as long as a blink lasts.
  float shut = ${drawn.map(([, i]) => `step(0.001, fx[${2 * i}].z)`).join(' + ')};
  if (still < 0.5 && shut > 0.0) {
    vec4 l = texture2D(lids, t) * inside;
    c = c * (1.0 - l.a) + l;
  }` : ''}
  if (ovK > 0.0) c = mix(c, vec4(ovCol, 1.0), ovK * dot(shown(t, ovMap), ovSel));
  if (ov2K > 0.0) c = mix(c, vec4(ov2Col, 1.0), ov2K * dot(shown(t, ov2Map), ov2Sel));
  gl_FragColor = c * (1.0 - smoothstep(1.0 - fade, 1.0, uv.y));
}`;
  }

  // The shader's part for a blink, the `i`th effect: blink<i>(q, c) is the colour c drawn
  // at the picture's px q with the eyes as shut as fx[2i].z says. Its lid comes down along
  // fx[2i].xy, each column as far as takes the lid's lower edge to the bottom of the eye
  // there; what the lid has left or passed over shows the skin at fx[2i+1].xy,
  // in a warm shadow as deep as fx[2i].w at its top. The edges are where the masks cross
  // half strength. blinked() does the same.
  function blinkShader(e, i) {
    const [em, ec] = e.mask, [lm, lc] = e.lid, S = STEP.toFixed(1);
    const fetch = em === lm
      ? `vec4 a = texture2D(m${em}, r / size);\n  return vec2(a.${CH[ec]}, a.${CH[lc]});`
      : `return vec2(texture2D(m${em}, r / size).${CH[ec]}, texture2D(m${lm}, r / size).${CH[lc]});`;
    return `
// Blink ${i}: its eye (x) and lid (y) masks at r.
vec2 eyelid${i}(vec2 r) {
  ${fetch}
}
vec4 blink${i}(vec2 q, vec4 c) {
  vec4 A = fx[${2 * i}], B = fx[${2 * i + 1}];
  vec2 h = eyelid${i}(q);
  float here = max(h.x, h.y); // the lid is part of the eye
  if (A.z <= 0.0 || here <= 0.0) return c;
  // Down the column through q, in px from q: where the lid's top and bottom edges are, and
  // where the eye ends below it.
  float top = -1e4, bot = -1e4, end = -1e4, pl = 0.0, pe = 0.0;
  for (int k = 0; k <= ${2 * REACH}; k++) {
    float o = float(k - ${REACH}) * ${S};
    vec2 m = eyelid${i}(q + o * A.xy);
    float l = m.y, e = max(m.x, m.y);
    if (k > 0) {
      if (top < -1e3) { if (pl <= 0.5 && l > 0.5) top = o - ${S} * (l - 0.5) / (l - pl); }
      else if (bot < -1e3 && l <= 0.5) bot = o - ${S} * (0.5 - l) / (pl - l);
      if (bot > -1e3 && e <= 0.5) { end = o - ${S} * (0.5 - e) / (pe - e); break; }
    }
    pl = l; pe = e;
  }
  float d = A.z * max(0.0, end - bot); // how far the lid has come down here
  if (end < -1e3 || d <= 0.0) return c;
  // Behind it, skin from where its top was down to its middle (eased in over its first px
  // of travel), shaded warm, most at the top and a third as much by the lash; and the eye
  // below that.
  vec4 skin = (texture2D(pic, B.xy / size) + texture2D(pic, (B.xy + vec2(2.0, 0.0)) / size)
    + texture2D(pic, (B.xy - vec2(2.0, 0.0)) / size) + texture2D(pic, (B.xy + vec2(0.0, 2.0)) / size)
    + texture2D(pic, (B.xy - vec2(0.0, 2.0)) / size)) * 0.2;
  skin.rgb *= 1.0 - A.w * (1.0 - 0.67 * clamp(-top / max(d, 1.0), 0.0, 1.0)) * vec3(0.55, 1.0, 1.3);
  float behind = clamp(0.5 - top, 0.0, 1.0) * clamp(top + d + 0.5 * (bot - top) + 0.5, 0.0, 1.0) * min(1.0, d);
  // The part of the lid that has come down to q, over that: solid inside its edges, whose
  // softness is the masks' (they're at half size), halved.
  vec2 r = q - d * A.xy;
  vec4 o = mix(mix(c, skin, behind), texture2D(pic, r / size), clamp(2.0 * eyelid${i}(r).y - 0.5, 0.0, 1.0));
  return mix(c, o, min(1.0, 2.0 * here));
}`;
  }

  // The push the shader gives the picture's pixel at q ([x, y], its px), worked out the
  // same way on the CPU (for the tests): `vals` from Motion.values, and `mask(map, q)`
  // giving a texture's channels there (0..1).
  function push(effects, vals, mask, q) {
    const at = e => mask(e.mask[0], q)[e.mask[1]];
    const h = effects.findIndex(e => e.kind === 'hold' && e.mask);
    const free = h >= 0 ? 1 - vals[h * 8] * at(effects[h]) : 1;
    let dx = 0, dy = 0;
    effects.forEach((e, i) => {
      if (!e.mask || e.kind === 'hold' || e.kind === 'blink') return;
      const A = i * 8, B = A + 4, m = at(e) * (1 + (free - 1) * vals[B + 3]);
      if (e.kind === 'swing') {
        const rx = q[0] - vals[A], ry = q[1] - vals[A + 1], a = m * vals[A + 2], c = Math.cos(a), s = Math.sin(a);
        dx += c * rx - s * ry - rx; dy += s * rx + c * ry - ry;
      } else if (e.kind === 'wave') {
        const ux = vals[A], uy = vals[A + 1], nx = -uy, ny = ux;
        const s = Math.sin((q[0] * ux + q[1] * uy) * vals[A + 2] - vals[A + 3] + vals[B + 1] * Math.sin((q[0] * nx + q[1] * ny) * 0.06 + vals[B + 2]));
        dx += m * vals[B] * s * nx; dy += m * vals[B] * s * ny;
      } else { dx += m * vals[A]; dy += m * vals[A + 1]; }
    });
    return [dx, dy];
  }

  // Which pixel of the picture the shader draws at p: found the shader's way (before the
  // eyes blink).
  function source(effects, vals, mask, p) {
    let q = p;
    for (const k of [1, 1, 0.6, 0.6]) {
      const d = push(effects, vals, mask, q);
      q = [q[0] + (p[0] - d[0] - q[0]) * k, q[1] + (p[1] - d[1] - q[1]) * k];
    }
    return q;
  }

  // The colour the shader draws at the picture's px q once the eyes blink (its blink<i>()):
  // `colour(r)` gives the picture's colour at r ([r, g, b, a], premultiplied), the rest as
  // for push().
  function blinked(effects, vals, mask, q, colour) {
    const mix = (a, b, k) => a.map((v, j) => v + (b[j] - v) * k), clamp = v => Math.min(1, Math.max(0, v));
    let c = colour(q);
    effects.forEach((e, i) => {
      if (e.kind !== 'blink' || !e.mask || !e.lid) return;
      const A = i * 8, B = A + 4, ux = vals[A], uy = vals[A + 1], s = vals[A + 2];
      const eyelid = r => [mask(e.mask[0], r)[e.mask[1]], mask(e.lid[0], r)[e.lid[1]]];
      const h = eyelid(q), here = Math.max(h[0], h[1]);
      if (!(s > 0) || here <= 0) return;
      let top = -1e4, bot = -1e4, end = -1e4, pl = 0, pe = 0;
      for (let k = 0; k <= 2 * REACH; k++) {
        const o = (k - REACH) * STEP, m = eyelid([q[0] + o * ux, q[1] + o * uy]), l = m[1], ee = Math.max(m[0], m[1]);
        if (k > 0) {
          if (top < -1e3) { if (pl <= 0.5 && l > 0.5) top = o - STEP * (l - 0.5) / (l - pl); }
          else if (bot < -1e3 && l <= 0.5) bot = o - STEP * (0.5 - l) / (pl - l);
          if (bot > -1e3 && ee <= 0.5) { end = o - STEP * (0.5 - ee) / (pe - ee); break; }
        }
        pl = l; pe = ee;
      }
      const d = s * Math.max(0, end - bot);
      if (end < -1e3 || d <= 0) return;
      const sx = vals[B], sy = vals[B + 1], taps = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].map(([x, y]) => colour([sx + x, sy + y]));
      const shade = vals[A + 3] * (1 - 0.67 * clamp(-top / Math.max(d, 1)));
      const skin = taps.reduce((a, t) => a.map((v, j) => v + t[j] * 0.2), [0, 0, 0, 0]).map((v, j) => (j < 3 ? v * (1 - shade * [0.55, 1, 1.3][j]) : v));
      const behind = clamp(0.5 - top) * clamp(top + d + 0.5 * (bot - top) + 0.5) * Math.min(1, d);
      const r = [q[0] - d * ux, q[1] - d * uy];
      const o = mix(mix(c, skin, behind), colour(r), clamp(2 * eyelid(r)[1] - 0.5));
      c = mix(c, o, Math.min(1, 2 * here));
    });
    return c;
  }

  // Whether drawn shut eyes show at this moment (`vals` from Motion.values): for the whole
  // of any blink, with no in-between.
  function lidded(effects, vals) {
    return effects.some((e, i) => e.kind === 'blink' && vals[i * 8 + 2] > 0.001);
  }

  const VERT = `
attribute vec2 a;
varying vec2 uv;
void main() {
  uv = vec2(a.x, 1.0 - a.y);
  gl_Position = vec4(a * 2.0 - 1.0, 0.0, 1.0);
}`;

  // Draws the picture brought to life, on the GPU. WebGL won't take a picture the browser
  // counts as foreign (as a local file can be), and may be missing altogether; then
  // there's nothing to draw with and the picture is shown still.
  class Renderer {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.gl = null;
      this.ok = false; // a picture is in and drawable
      this.tex = [];
      this.progs = new Map();
      this.canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault(); this.ok = false; this.gl = null; this.tex = []; this.progs.clear();
      });
    }

    // The GL context, made once. False if there's no WebGL.
    init() {
      if (this.gl) return true;
      const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
      if (!gl) return false;
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.clearColor(0, 0, 0, 0);
      this.gl = gl;
      return true;
    }

    // Upload a picture or a mask into texture unit `i`: an image or canvas, or
    // {width, height, data} with RGBA bytes. The picture goes in premultiplied, so its
    // soft edges filter without dark fringes; masks go in exactly as they are.
    texture(i, src, picture) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + i);
      if (!this.tex[i]) {
        this.tex[i] = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!picture);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, picture ? gl.BROWSER_DEFAULT_WEBGL : gl.NONE);
      if (src.data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, src.width, src.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    }

    // The program for these effects over `n` mask textures (and the drawn shut eyes after
    // them, if there are some), compiled once for each layout.
    use(effects, n) {
      const gl = this.gl, src = fragment(effects, n, this.lids);
      let p = this.progs.get(src);
      if (!p) {
        const shader = (type, text) => {
          const s = gl.createShader(type);
          gl.shaderSource(s, text);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
          return s;
        };
        const prog = gl.createProgram();
        gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, src));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        const u = {};
        for (const k of ['pic', 'size', 'fade', 'still', 'fx', 'ovK', 'ovMap', 'ovSel', 'ovCol', 'ov2K', 'ov2Map', 'ov2Sel', 'ov2Col', 'lids', ...Array.from({ length: n }, (_, i) => `m${i}`)]) {
          u[k] = gl.getUniformLocation(prog, k);
        }
        p = { prog, u, a: gl.getAttribLocation(prog, 'a') };
        this.progs.set(src, p);
      }
      gl.useProgram(p.prog);
      gl.enableVertexAttribArray(p.a);
      gl.vertexAttribPointer(p.a, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(p.u.pic, 0);
      for (let i = 0; i < n; i++) gl.uniform1i(p.u[`m${i}`], i + 1);
      if (this.lids) gl.uniform1i(p.u.lids, n + 1);
      this.p = p;
      this.n = n;
    }

    // Take a picture to bring to life: `pic` (a canvas or image, at the size it's to be
    // drawn), its masks (`maps`, covering the same part of it, at any size) and the
    // effects; `size` is that part of the picture in its own px and `fade` how much of
    // its height dissolves at the bottom; `lids`, if given, the drawn shut eyes (graded and
    // sized as `pic` is). False if they can't be used.
    set(pic, maps, effects, { size, fade = 0, lids = null }) {
      this.ok = false;
      try {
        if (!this.init()) return false;
        const gl = this.gl;
        for (let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR; i++); // forget earlier errors
        this.canvas.width = pic.width;
        this.canvas.height = pic.height;
        gl.viewport(0, 0, pic.width, pic.height);
        this.texture(0, pic, true);
        maps.forEach((m, i) => this.texture(i + 1, m, false));
        this.lids = !!lids;
        this.lidsPic = lids;
        if (lids) this.texture(maps.length + 1, lids, true);
        this.use(effects, maps.length);
        this.size = size;
        this.fade = fade;
        this.ok = gl.getError() === gl.NO_ERROR;
      } catch (e) {
        this.ok = false; // a foreign picture, or a shader the GPU won't take
      }
      return this.ok;
    }

    // The editor's changes: another picture (or grading or fade), with its drawn shut eyes
    // graded alike ...
    picture(pic, { size, fade = 0, lids = null }) {
      if (!this.ok) return;
      this.canvas.width = pic.width;
      this.canvas.height = pic.height;
      this.gl.viewport(0, 0, pic.width, pic.height);
      this.texture(0, pic, true);
      if (lids && this.lids) { this.lidsPic = lids; this.texture(this.n + 1, lids, true); }
      this.size = size;
      this.fade = fade;
    }

    // ... one mask texture again, or (given `x`, `y`) just a part of it, from RGBA bytes ...
    map(i, src, x, y) {
      if (!this.ok || !this.tex[i + 1]) return;
      const gl = this.gl;
      if (x == null) return this.texture(i + 1, src, false);
      gl.activeTexture(gl.TEXTURE1 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.tex[i + 1]);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, src.width, src.height, gl.RGBA, gl.UNSIGNED_BYTE, src.data);
    }

    // ... and another list of effects, or of masks (which moves the drawn shut eyes along
    // to the texture after them).
    effects(effects, n) {
      if (!this.ok) return;
      try {
        if (this.lids && n !== this.n && this.lidsPic) this.texture(n + 1, this.lidsPic, true);
        this.use(effects, n);
      } catch (e) { this.ok = false; }
    }

    // Draw a moment, given Motion.values() for it. The editor may hold the picture still
    // and show a mask or two over it: `overlay` {map, channel, color: [r, g, b], alpha}, or
    // a list of them. Returns the canvas it's drawn on, or null.
    draw(vals, { still = false, overlay = null } = {}) {
      if (!this.ok) return null;
      const gl = this.gl, u = this.p.u;
      gl.uniform2f(u.size, this.size[0], this.size[1]);
      gl.uniform1f(u.fade, this.fade);
      gl.uniform1f(u.still, still ? 1 : 0);
      gl.uniform4fv(u.fx, vals);
      const ovs = [].concat(overlay || []);
      ['ov', 'ov2'].forEach((n, k) => {
        const o = ovs[k];
        gl.uniform1f(u[n + 'K'], o ? o.alpha : 0);
        if (!o) return;
        gl.uniform1f(u[n + 'Map'], o.map);
        gl.uniform4f(u[n + 'Sel'], +(o.channel === 0), +(o.channel === 1), +(o.channel === 2), 0);
        gl.uniform3f(u[n + 'Col'], o.color[0] / 255, o.color[1] / 255, o.color[2] / 255);
      });
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return this.canvas;
    }
  }

  return { KINDS, MAX, SCALE, STEP, REACH, slots, normalize, make, add, load, breeze, breath, shut, Spring, Motion, Renderer, fragment, push, source, blinked, lidded };
})();
