// Behaviour checks for the display controller, the ink, the light and Makise's rig: node tools/test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const zlib = require('zlib');

function load(settings) {
  const values = { display: 'time', glow: 'orange', shift: true, ...settings };
  const ctx = {
    Config: { get: k => values[k], set: (k, v) => { values[k] = v; } },
    Math, Date, String, Infinity,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../wallpaper/js/display.js'), 'utf8') + ';this.Display = Display;', ctx);
  return { Display: ctx.Display, values };
}

function fakeMeter() {
  return { target: '', shifts: [], flashes: [], startShift(t) { this.shifts.push(t); }, flash(t) { this.flashes.push(t); } };
}

const NOW = new Date(2026, 9, 2, 9, 5, 7); // 2026-10-02 09:05:07 local
let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failures++; console.log(`FAIL ${name}\n     ${e.message}`); }
}

test('time is 24-hour HH.MM.SS', () => {
  const { Display } = load();
  assert.strictEqual(Display.formatTime(new Date(2026, 9, 2, 21, 4, 9)), '21.04.09');
});

test('date is YY.MM.DD', () => {
  const { Display } = load();
  assert.strictEqual(Display.formatDate(NOW), '26.10.02');
});

test('boot shows the time and rolls the tubes in', () => {
  const { Display } = load();
  const m = fakeMeter(), c = new Display.Controller(m, () => NOW);
  c.boot(0);
  assert.strictEqual(m.target, '09.05.07');
  assert.deepStrictEqual(m.shifts, [0]);
});

test('random shift lands 20-60 minutes after boot', () => {
  const { Display } = load();
  for (const r of [0, 0.5, 0.999]) {
    const c = new Display.Controller(fakeMeter(), () => NOW, () => r);
    c.boot(0);
    assert.ok(c.nextShift >= 1200 && c.nextShift <= 3600, `nextShift ${c.nextShift}`);
  }
});

test('time mode: shift shows a new worldline for 10 s, then rolls back', () => {
  const { Display } = load();
  const m = fakeMeter(), c = new Display.Controller(m, () => NOW);
  let spins = 0;
  c.onShift = () => spins++;
  c.boot(0);
  const before = c.worldline;
  c.shift(100);
  c.tick(100);
  assert.ok(Display.WORLDLINES.includes(m.target), `target ${m.target}`);
  assert.notStrictEqual(m.target, before);
  c.tick(109.9);
  assert.strictEqual(m.target, c.worldline);
  c.tick(110.1);
  assert.strictEqual(m.target, '09.05.07');
  assert.deepStrictEqual(m.shifts, [0, 100, 110.1]); // boot, shift, roll back
  assert.strictEqual(spins, 1);                       // clocks spin once per shift
});

test('worldline mode: shift lands on a new value and stays', () => {
  const { Display } = load({ display: 'worldline' });
  const m = fakeMeter(), c = new Display.Controller(m, () => NOW);
  c.boot(0);
  c.tick(0);
  const first = m.target;
  c.shift(50);
  c.tick(500);
  assert.notStrictEqual(m.target, first);
  assert.ok(Display.WORLDLINES.includes(m.target));
});

test('every shift picks a different worldline', () => {
  const { Display } = load({ display: 'worldline' });
  const c = new Display.Controller(fakeMeter(), () => NOW);
  c.boot(0);
  for (let i = 1; i < 50; i++) {
    const prev = c.worldline;
    c.shift(i * 20);
    assert.notStrictEqual(c.worldline, prev);
  }
});

test('shift off: no random shifts', () => {
  const { Display } = load({ shift: false });
  const m = fakeMeter(), c = new Display.Controller(m, () => NOW);
  c.boot(0);
  c.shift(5);
  c.tick(4000);
  assert.deepStrictEqual(m.shifts, []);
  assert.strictEqual(m.target, '09.05.07');
});

test('the scheduled shift fires by itself', () => {
  const { Display } = load();
  const m = fakeMeter(), c = new Display.Controller(m, () => NOW, () => 0);
  c.boot(0);
  c.tick(1199);
  assert.strictEqual(m.shifts.length, 1);
  c.tick(1200);
  assert.strictEqual(m.shifts.length, 2);
});

test('time mode: a click spins the clocks and flashes, keeping the time', () => {
  const { Display } = load();
  const m = fakeMeter(), c = new Display.Controller(m, () => NOW);
  let spins = 0;
  c.onShift = () => spins++;
  c.boot(0);
  const wl = c.worldline;
  c.click(30);
  c.tick(30.5);
  assert.strictEqual(m.target, '09.05.07');
  assert.strictEqual(c.worldline, wl);
  assert.deepStrictEqual(m.flashes, [30]);
  assert.deepStrictEqual(m.shifts, [0]);
  assert.strictEqual(spins, 1);
});

test('date mode: a click keeps the date too', () => {
  const { Display } = load({ display: 'date' });
  const m = fakeMeter(), c = new Display.Controller(m, () => NOW);
  c.boot(0);
  c.click(30);
  c.tick(31);
  assert.strictEqual(m.target, '26.10.02');
  assert.deepStrictEqual(m.flashes, [30]);
});

test('worldline mode: a click shifts to a new worldline', () => {
  const { Display } = load({ display: 'worldline' });
  const m = fakeMeter(), c = new Display.Controller(m, () => NOW);
  c.boot(0);
  c.tick(0);
  const first = m.target;
  c.click(30);
  c.tick(31);
  assert.notStrictEqual(m.target, first);
  assert.deepStrictEqual(m.flashes, []);
});

test('shift off: clicks do nothing at all', () => {
  const { Display } = load({ shift: false });
  const m = fakeMeter(), c = new Display.Controller(m, () => NOW);
  let spins = 0;
  c.onShift = () => spins++;
  c.boot(0);
  c.click(30);
  assert.deepStrictEqual(m.flashes, []);
  assert.strictEqual(spins, 0);
});

// ---------- Living ink: the schedule only (nothing is painted without a screen) ----------

function loadInk() {
  const ctx = { Math };
  vm.createContext(ctx);
  const src = ['kit.js', 'paint.js', 'ink.js'].map(f => fs.readFileSync(path.join(__dirname, '../wallpaper/js', f), 'utf8')).join('\n;\n');
  vm.runInContext(src + ';this.Kit = Kit; this.Ink = Ink;', ctx);
  return ctx;
}

// Run a field for `secs` at 1 s steps, checking `each(field, t)` along the way.
function simulate(field, secs, each, from = 0) {
  for (let t = from; t <= secs; t += 1) { field.update(t); each(field, t); }
}

test('ink: boots with its minimum of resting elements and forms another within seconds', () => {
  const { Kit, Ink } = loadInk();
  const f = new Ink.Field(Kit.rng(1), { x: 0, y: 0 });
  f.update(0);
  assert.strictEqual(f.blooms.length, Ink.MIN);
  assert.ok(f.blooms.every(b => b.phase(0)[0] === 'resting'));
  for (let t = 0; t <= 6; t += 0.5) f.update(t);
  assert.strictEqual(f.blooms.length, Ink.MIN + 1);
});

test('ink: new ink comes every few seconds and there is plenty of it', () => {
  const { Kit, Ink } = loadInk();
  for (const seed of [1, 2, 3]) {
    const f = new Ink.Field(Kit.rng(seed), { x: 0, y: 0 });
    let spawned = 0, last = null, sum = 0, n = 0;
    simulate(f, 1800, (field, t) => {
      const newest = field.blooms[field.blooms.length - 1];
      if (newest !== last) { spawned++; last = newest; }
      if (t > 120) { sum += field.active(t); n++; }
    });
    assert.ok(spawned >= 1800 / 15, `only ${spawned} elements in half an hour`);
    assert.ok(sum / n >= Ink.MIN, `on average only ${(sum / n).toFixed(1)} elements at once`);
  }
});

test('ink: drifts away from the centrepiece', () => {
  const { Kit, Ink } = loadInk();
  const away = { x: 560, y: 610 };
  const f = new Ink.Field(Kit.rng(4), { x: 0, y: 0 }, { away });
  let out = 0, all = 0;
  simulate(f, 900, () => {});
  for (const b of f.blooms) {
    all++;
    if (b.vx * (b.x - away.x) + b.vy * (b.y - away.y) > 0) out++;
  }
  assert.ok(all >= Ink.MIN && out >= all * 0.8, `${out} of ${all} drift away`);
});

test('ink: over three hours, never crowded or bare, zones never shared, colours never close', () => {
  const { Kit, Ink } = loadInk();
  for (const seed of [1, 2, 3]) {
    const f = new Ink.Field(Kit.rng(seed), { x: 0, y: 0 });
    let spawned = 0, last = null;
    simulate(f, 3 * 3600, (field, t) => {
      const n = field.blooms.length, active = field.active(t);
      assert.ok(active <= Ink.MAX, `${active} elements at ${t}s`);
      if (t > 10) assert.ok(n >= 3 && active >= 2, `only ${n} elements (${active} not dissolving) at ${t}s`);
      assert.strictEqual(new Set(field.blooms.map(b => b.zone)).size, n);
      for (const a of field.blooms) {
        for (const b of field.blooms) {
          if (a !== b && a.color === b.color) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= Ink.NEAR, `two ${a.color} elements close together at ${t}s`);
        }
      }
      const newest = field.blooms[field.blooms.length - 1];
      if (newest !== last) { spawned++; last = newest; }
    });
    assert.ok(spawned > 400, `only ${spawned} elements in three hours`);
  }
});

test('ink: elements keep spreading and floating after they form', () => {
  const { Kit, Ink } = loadInk();
  const f = new Ink.Field(Kit.rng(3), { x: 0, y: 0 });
  f.update(0);
  const b = f.spawn(0, 'blot');
  const t1 = b.born + b.form + b.dry + 5, t2 = t1 + 20;
  const s1 = Ink.state(b, t1), s2 = Ink.state(b, t2);
  assert.ok(s2.tau > s1.tau + 0.05, `spread only ${s2.tau - s1.tau} in 20 s`);
  const moved = Math.hypot(s2.move.x - s1.move.x, s2.move.y - s1.move.y);
  assert.ok(moved > 5, `drifted only ${moved} px in 20 s`);
  assert.ok(s2.move.s > s1.move.s && s2.move.a !== s1.move.a, 'neither grew nor turned');
});

test('ink: kinds vary and never repeat back to back', () => {
  const { Kit, Ink } = loadInk();
  const f = new Ink.Field(Kit.rng(7), { x: 0, y: 0 }), kinds = [];
  let last = null;
  simulate(f, 3600, field => {
    const newest = field.blooms[field.blooms.length - 1];
    if (newest !== last) { kinds.push(newest.kind); last = newest; }
  });
  for (let i = 1; i < kinds.length; i++) assert.notStrictEqual(kinds[i], kinds[i - 1]);
  assert.deepStrictEqual([...new Set(kinds)].sort(), Object.keys(Ink.KINDS).sort());
});

test('ink: a worldline shift throws a splash and dissolves the oldest', () => {
  const { Kit, Ink } = loadInk();
  const f = new Ink.Field(Kit.rng(1), { x: 0, y: 0 });
  let t = 0;
  while (f.active(t) < Ink.MAX && t < 3600) f.update(++t);
  assert.strictEqual(f.active(t), Ink.MAX, 'never filled up');
  const oldest = f.blooms.filter(b => b.phase(t)[0] === 'resting').sort((a, b) => a.born - b.born)[0];
  f.shift(t);
  const splash = f.blooms[f.blooms.length - 1];
  assert.strictEqual(splash.kind, 'splash');
  assert.strictEqual(oldest.phase(t + 0.5)[0], 'fading');
  simulate(f, t + 100, () => {}, t + 1);
  assert.ok(!f.blooms.includes(oldest));
});

test('ink: the preview can ask for any kind, and is told when there is no room', () => {
  const { Kit, Ink } = loadInk();
  const f = new Ink.Field(Kit.rng(5), { x: 0, y: 0 });
  simulate(f, 20, () => {});
  const made = [];
  for (let i = 0; i < 12; i++) made.push(f.shift(20, 'blot'));
  assert.ok(made[0] && made[0].kind === 'blot');
  assert.ok(made.includes(null), 'never ran out of zones or colours');
  assert.strictEqual(new Set(f.blooms.map(b => b.zone)).size, f.blooms.length);
});

test('ink: paint defaults to overlay at 62%, and only knows overlay and screen', () => {
  const { Kit, Ink } = loadInk();
  const f = new Ink.Field(Kit.rng(1), { x: 0, y: 0 });
  assert.deepStrictEqual([f.blend, f.gain], ['overlay', 0.62]);
  f.style({ blend: 'screen', gain: '1.2' });
  assert.deepStrictEqual([f.blend, f.gain], ['screen', 1.2]);
  f.style({ blend: 'difference', gain: -3 });
  assert.deepStrictEqual([f.blend, f.gain], ['overlay', 0]);
});

// ---------- Light: where the shafts come from (nothing is drawn without a screen) ----------

function loadAtmos() {
  const ctx = { Math };
  vm.createContext(ctx);
  const src = ['kit.js', 'atmos.js'].map(f => fs.readFileSync(path.join(__dirname, '../wallpaper/js', f), 'utf8')).join('\n;\n');
  vm.runInContext(src + ';this.Kit = Kit; this.Atmos = Atmos;', ctx);
  return ctx;
}

test('light: the shafts pan from side to side over the top, slowly', () => {
  const { Kit, Atmos } = loadAtmos();
  for (const seed of [1, 7]) {
    const light = new Atmos.Light(Kit.rng(seed));
    let left = false, right = false, top = false, fastest = 0, prev = light.sun(0);
    for (let t = 0; t <= 720; t++) {
      const s = light.sun(t);
      if (s.x < 0) left = true;
      if (s.x > 2560) right = true;
      if (s.x > 900 && s.x < 1700 && s.y < 0) top = true;
      fastest = Math.max(fastest, Math.hypot(s.x - prev.x, s.y - prev.y));
      prev = s;
    }
    assert.ok(left && right && top, 'did not travel from side to side over the top');
    assert.ok(fastest < 40, `moved ${fastest.toFixed(0)} px in a second`);
  }
});

test('light: its pool stays off the centrepiece and the shafts fade before it', () => {
  const { Kit, Atmos } = loadAtmos();
  const light = new Atmos.Light(Kit.rng(2));
  for (let t = 0; t <= 720; t += 5) {
    assert.ok(light.pool(t).x >= 1250, `pool at ${light.pool(t).x} at ${t}s`);
    assert.ok(light.beamAt(560, 610, t) < 0.25, `meter lit ${light.beamAt(560, 610, t).toFixed(2)} at ${t}s`);
  }
});

// ---------- Makise's rig: its springs, the rig shipped for her, and what it does ----------

function loadRig() {
  const ctx = { Math, Promise };
  vm.createContext(ctx);
  const src = ['kit.js', 'rig.js', 'portrait.js'].map(f => fs.readFileSync(path.join(__dirname, '../wallpaper/js', f), 'utf8')).join('\n;\n');
  vm.runInContext(src + ';this.Rig = Rig; this.Portrait = Portrait;', ctx);
  return ctx;
}

const IMG = path.join(__dirname, '../wallpaper/img');
// The rig beside makise.webp, as the wallpaper reads it.
function shippedRig(Rig) {
  let desc = null;
  vm.runInNewContext(fs.readFileSync(path.join(IMG, 'makise-rig.js'), 'utf8'), { Rig: { add: d => { desc = d; } } });
  return Rig.normalize(desc);
}
// A WebP's size, from its header.
function webpSize(file) {
  const b = fs.readFileSync(file), kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}
// An 8-bit PNG (grey, RGB, or either with alpha): { width, height, channels, data }.
function readPNG(file) {
  const b = fs.readFileSync(file), idat = [];
  let pos = 8, width, height, channels;
  while (pos < b.length) {
    const len = b.readUInt32BE(pos), type = b.toString('ascii', pos + 4, pos + 8), d = b.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      [width, height, channels] = [d.readUInt32BE(0), d.readUInt32BE(4), { 0: 1, 2: 3, 4: 2, 6: 4 }[d[9]]];
      assert.ok(d[8] === 8 && channels && !d[12], `${path.basename(file)} is not a plain 8-bit PNG`);
    }
    if (type === 'IDAT') idat.push(d);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), n = channels, row = width * n, out = Buffer.alloc(height * row);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (row + 1)], o = y * row, l = y * (row + 1) + 1;
    for (let x = 0; x < row; x++) {
      const a = x >= n ? out[o + x - n] : 0, up = y ? out[o - row + x] : 0, c = x >= n && y ? out[o - row + x - n] : 0;
      let v = raw[l + x];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const q = a + up - c, pa = Math.abs(q - a), pb = Math.abs(q - up), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      out[o + x] = v & 255;
    }
  }
  return { width, height, channels, data: out };
}
// Sampling a rig's masks the way the GPU does (bilinear): `mask(map, [x, y])` with x and y
// in the picture's px gives that map's red, green and blue there (0..1).
function masks(rig) {
  const maps = rig.maps.map(m => readPNG(path.join(IMG, m))), [W, H] = rig.size;
  return (m, q) => {
    const M = maps[m], x = Math.min(M.width - 1.001, Math.max(0, q[0] * M.width / W - 0.5));
    const y = Math.min(M.height - 1.001, Math.max(0, q[1] * M.height / H - 0.5));
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const v = (ii, jj, c) => M.data[(jj * M.width + ii) * M.channels + c] / 255;
    return [0, 1, 2].map(c => (v(i, j, c) * (1 - fx) + v(i + 1, j, c) * fx) * (1 - fy) + (v(i, j + 1, c) * (1 - fx) + v(i + 1, j + 1, c) * fx) * fy);
  };
}

// The hair (a sway) and the arms (swings) of the shipped rig over a run where she moves
// 25 design px to the left at 5 s (`at(t)`, by default the way her depth plane follows a
// flick of the cursor), stepped at `fps`. How far each has swung, in the picture's px.
function trail(fps, at) {
  const { Rig, Portrait } = loadRig(), rig = shippedRig(Rig), m = new Rig.Motion();
  for (const e of rig.effects) if ('idle' in e) e.idle = 0; // the springs alone, not their own drifting
  const fit = Portrait.fitOf({ naturalWidth: rig.size[0], naturalHeight: rig.size[1] }, 0.6);
  const hair = rig.effects.find(e => e.kind === 'sway'), arms = rig.effects.filter(e => e.kind === 'swing');
  const out = [];
  let cam = -1, last = 0;
  for (let i = 0; i <= 15 * fps; i++) {
    const t = i / fps;
    cam += ((t < 5 ? -1 : 1) - cam) * (1 - Math.exp(-(t - last) / 0.78));
    last = t;
    m.update(t, rig.effects, { x: (at ? at(t) : -cam * 12.6) / fit, y: 0 });
    // Where the breeze alone would hold each arm.
    const rests = arms.map(a => a.max * Math.tanh(m.air(t).x * a.wind / a.max));
    out.push({ t, ...m.spring(hair).off(), arms: arms.map(a => m.spring(a).off().x), rests });
  }
  return out;
}

test('rig: the hair trails a move, swings back and settles', () => {
  const run = trail(30), at = (a, b) => run.filter(s => s.t >= a && s.t < b).map(s => s.x);
  const before = Math.max(...at(4, 5)), behind = Math.max(...at(5, 6.5));
  assert.ok(behind > before + 5, `trailed ${behind.toFixed(1)} px (was ${before.toFixed(1)})`);
  assert.ok(Math.min(...at(5.5, 8)) < before, 'never swung back');
  const settled = at(10, 15).map(x => Math.abs(x - before));
  assert.ok(Math.max(...settled) < 6.5, `still swinging ${Math.max(...settled).toFixed(1)} px from rest`);
});

test('rig: the arms trail a move too, more gently than the hair, and settle', () => {
  const run = trail(30), during = run.filter(s => s.t >= 5 && s.t < 7), after = run.filter(s => s.t >= 11);
  const hair = Math.max(...during.map(s => Math.abs(s.x)));
  for (const side of [0, 1]) {
    const arm = Math.max(...during.map(s => Math.abs(s.arms[side])));
    assert.ok(arm > 0.8 && arm < hair, `arm ${side} swung ${arm.toFixed(1)} px (hair ${hair.toFixed(1)})`);
    const rest = Math.max(...after.map(s => Math.abs(s.arms[side] - s.rests[side])));
    assert.ok(rest < 3.3, `arm ${side} still ${rest.toFixed(1)} px from where the breeze holds it`);
  }
});

test('rig: the hair moves the same at any frame rate', () => {
  const glide = t => 12.6 - 25.2 * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, (t - 5) / 0.8))));
  const a = trail(30, glide), b = trail(60, glide).filter((s, i) => i % 2 === 0);
  const worst = Math.max(...a.map((s, i) => Math.hypot(s.x - b[i].x, s.y - b[i].y)));
  assert.ok(worst < 0.4, `30 and 60 fps differ by ${worst.toFixed(2)} px`);
});

test('rig: a rig is checked and completed as it loads', () => {
  const { Rig } = loadRig(), K = Rig.KINDS;
  const r = Rig.normalize({ size: [10, 20], maps: ['a.png'], effects: [
    { kind: 'hold', mask: [0, 0] }, { kind: 'hold', mask: [0, 1] }, { kind: 'spin', mask: [0, 2] },
    { kind: 'sway', name: 'Hair', gain: 99, mask: [0, 1] }, { kind: 'wave', mask: [3, 0] }, { kind: 'swing', pivot: [5, 'x'], on: false },
  ] });
  assert.deepStrictEqual([...r.effects.map(e => e.kind)], ['hold', 'sway', 'wave', 'swing'], 'unknown kinds and a second hold dropped');
  const [, sway, wave, swing] = r.effects;
  assert.strictEqual(sway.gain, K.sway.params.gain.max, 'kept in range');
  assert.strictEqual(sway.hz, K.sway.params.hz.v, 'defaults filled in');
  assert.ok(sway.hold && !Rig.make('parallax').hold, 'sway leaves held areas be, parallax carries them');
  assert.strictEqual(wave.mask, null, 'a mask on a map it does not have');
  assert.deepStrictEqual([...swing.pivot], [0, 0]);
  assert.strictEqual(swing.on, false);
  const many = Rig.normalize({ maps: [], effects: Array.from({ length: 20 }, () => ({ kind: 'wave' })) });
  assert.strictEqual(many.effects.length, Rig.MAX);
  // A blink has two masks, its eye's and its lid's, and a skin spot; the most a rig holds is
  // counted in masks.
  const eyes = Rig.normalize({ maps: ['a.png', 'b.png'], effects: [
    { kind: 'blink', mask: [0, 2], lid: [1, 0], skin: [40, 50] }, { kind: 'blink', mask: [0, 1], lid: [5, 0] },
    ...Array.from({ length: 20 }, () => ({ kind: 'blink' })), { kind: 'wave' },
  ] });
  const [b1, b2] = eyes.effects;
  assert.deepStrictEqual([[...b1.mask], [...b1.lid], [...b1.skin]], [[0, 2], [1, 0], [40, 50]]);
  assert.strictEqual(b2.lid, null, 'a lid on a map it does not have');
  assert.deepStrictEqual([...b2.skin], [0, 0]);
  assert.strictEqual(eyes.effects.filter(e => e.kind === 'blink').length, Math.floor(Rig.MAX / 2));
  assert.strictEqual(eyes.effects[eyes.effects.length - 1].kind, 'wave', 'and a one-mask effect in the last place');
});

test('rig: an effect switched off moves nothing', () => {
  const { Rig } = loadRig(), rig = shippedRig(Rig), m = new Rig.Motion();
  for (let t = 0; t <= 20; t += 1 / 30) m.update(t, rig.effects, { x: Math.sin(t) * 9, y: 0 }, { x: 0.8, y: -0.5 });
  const on = m.values(20, rig.effects);
  assert.ok(on.every(Number.isFinite));
  for (const e of rig.effects) e.on = false;
  const off = m.values(20, rig.effects);
  rig.effects.forEach((e, i) => {
    const moves = e.kind === 'swing' ? [off[i * 8 + 2]] : [...off.slice(i * 8, i * 8 + 3), off[i * 8 + 4]];
    assert.ok(moves.every(v => v === 0), `${e.name} still moves`);
  });
});

test('rig: she blinks now and then, at random, quickly, now and then twice', () => {
  const { Rig } = loadRig(), e = Rig.make('blink');
  // Each blink (from shutting to open again), at 1 ms steps over an hour.
  const blinks = [];
  let open = true;
  for (let i = 0; i < 3600 * 1000; i++) {
    const t = i / 1000, c = Rig.shut(t, e);
    if (c > 0 && open) blinks.push(t);
    open = c === 0;
  }
  assert.ok(blinks.length > 600 && blinks.length < 1000, `${blinks.length} blinks an hour`);
  const gaps = blinks.slice(1).map((t, i) => t - blinks[i]);
  const doubles = gaps.filter(g => g < 3 * e.span).length;
  assert.ok(doubles > blinks.length * 0.05 && doubles < blinks.length * 0.3, `${doubles} doubles in ${blinks.length}`);
  const apart = gaps.filter(g => g >= 3 * e.span);
  assert.ok(Math.min(...apart) > 0.25 * e.every - 3 * e.span, `blinks ${Math.min(...apart).toFixed(2)} s apart`);
  assert.ok(Math.max(...apart) < 1.75 * e.every + 3 * e.span, `no blink for ${Math.max(...apart).toFixed(2)} s`);
  // Shut for a frame or two: at 30 fps at least two frames 85% shut, at 15 fps at least one.
  for (const fps of [30, 15]) {
    const phase = 0.37 / fps;
    for (const b of blinks.slice(0, 300)) {
      let frames = 0;
      for (let f = Math.ceil((b - phase) * fps); f / fps + phase < b + e.span; f++) if (Rig.shut(f / fps + phase, e) >= 0.85) frames++;
      assert.ok(frames >= (fps === 30 ? 2 : 1), `${frames} shut frames at ${fps} fps for the blink at ${b.toFixed(3)}`);
    }
  }
});

// A picture to blink, `size` px square, made of the parts of a drawn eye at x 40..60: its
// lash at rows 30..35, the eye below it down to row 55, skin elsewhere. Its colour at a
// point says which part it is, one channel each: [lash, eye, skin, 1]. The blink's eye is
// painted over rows 29..56 (the lash and a row either side, and the eye and a row below)
// and its lid over rows 29..36, with a px of softness, the skin spot at (20, 80).
function drawnEye(Rig) {
  const rig = Rig.normalize({ size: [100, 100], maps: ['a.png'], effects: [
    { kind: 'hold', mask: [0, 0] }, { kind: 'blink', mask: [0, 1], lid: [0, 2], skin: [20, 80], shade: 0 },
  ] });
  const band = (v, a, b) => Math.min(1, Math.max(0, Math.min(v - a, b - v) + 0.5));
  const at = (q, a, b) => Math.min(band(q[0], 40, 60), band(q[1], a, b));
  // All of it held: a blink pays that no heed.
  const mask = (m, q) => [1, at(q, 28.5, 56.5), at(q, 28.5, 36.5)];
  const part = q => (q[0] >= 40 && q[0] <= 60 && q[1] >= 30 && q[1] < 36 ? 0 : q[0] >= 40 && q[0] <= 60 && q[1] >= 36 && q[1] < 56 ? 1 : 2);
  const colour = q => { const c = [0, 0, 0, 1]; c[part(q)] = 1; return c; };
  return { rig, mask, colour };
}

test('rig: shut, a blink brings its lid down to the bottom of the eye, with skin above; open, it changes nothing', () => {
  const { Rig } = loadRig(), { rig, mask, colour } = drawnEye(Rig);
  const blink = rig.effects[1], m = new Rig.Motion();
  assert.ok(!('hold' in blink), 'a blink has no hold setting');
  m.blink(100);
  const shut = m.values(100 + blink.span * 0.42, rig.effects);
  assert.strictEqual(shut[8 + 2], 1, 'shut');
  const at = y => Rig.blinked(rig.effects, shut, mask, [50.5, y + 0.5], colour);
  // The lash (with a row either side, its soft edges) lands on the bottom of the eye:
  // rows 49..56.
  for (let y = 50; y <= 55; y++) assert.ok(at(y)[0] > 0.95, `row ${y}: lash ${at(y)[0].toFixed(2)}`);
  // Above it, where the lash was and the eye it passed over, skin; nowhere any eye.
  for (let y = 30; y <= 47; y++) assert.ok(at(y)[2] > 0.95, `row ${y}: skin ${at(y)[2].toFixed(2)}`);
  for (let y = 25; y <= 55; y++) assert.ok(at(y)[1] < 0.02, `row ${y} shows the eye ${at(y)[1].toFixed(2)}`);
  // Outside it, and above the lid, nothing changes.
  for (const p of [[50.5, 60.5], [30.5, 50.5], [50.5, 10.5], [65.5, 40.5], [50.5, 27.5]]) {
    assert.deepStrictEqual([...Rig.blinked(rig.effects, shut, mask, p, colour)], colour(p), `${p} changed`);
  }
  // Half shut, the lid is halfway down, with the eye below it.
  m.blink(200);
  let t = 200;
  while (m.shut(t, blink) < 0.5) t += 0.0005;
  const half = m.values(t, rig.effects), d = 20 * m.shut(t, blink);
  const y0 = Math.ceil(30 + d), y1 = Math.floor(35 + d);
  for (let y = y0; y <= y1; y++) assert.ok(Rig.blinked(rig.effects, half, mask, [50.5, y + 0.5], colour)[0] > 0.9, `half shut, row ${y} has no lash`);
  for (let y = y1 + 2; y <= 55; y++) assert.ok(Rig.blinked(rig.effects, half, mask, [50.5, y + 0.5], colour)[1] > 0.9, `half shut, row ${y} hides the eye`);
  assert.deepStrictEqual([...Rig.push(rig.effects, shut, mask, [50, 50])], [0, 0], 'the push leaves it to the blink');
  t = 0;
  while (Rig.shut(t, blink) > 0 || Math.abs(t - 100) < 1 || Math.abs(t - 200) < 1) t += 0.25;
  const open = m.values(t, rig.effects);
  for (let y = 20; y <= 60; y += 2) {
    assert.deepStrictEqual([...Rig.blinked(rig.effects, open, mask, [50.5, y + 0.5], colour)], colour([50.5, y + 0.5]), 'open, it changes nothing');
  }
  const src = Rig.fragment(rig.effects, 1);
  assert.ok(src.includes('vec4 blink1(vec2 q, vec4 c)') && src.includes('c = blink1(q, c);') && !src.includes('d += a0.g'), 'the shader blinks after the push');
  assert.ok(src.includes('return vec2(a.g, a.b);'), 'reading its eye and lid');
});

test('rig: a shut lid takes the colour of its skin spot, shaded warm, most under the hair', () => {
  const { Rig } = loadRig(), { rig, mask, colour } = drawnEye(Rig);
  const blink = rig.effects[1], m = new Rig.Motion();
  blink.shade = 0.3;
  const skin = [0.9, 0.8, 0.7, 1], paint = q => (Math.hypot(q[0] - 20, q[1] - 80) < 4 ? skin : colour(q));
  m.blink(100);
  const shut = m.values(100 + blink.span * 0.42, rig.effects);
  const top = Rig.blinked(rig.effects, shut, mask, [50.5, 30.5], paint), low = Rig.blinked(rig.effects, shut, mask, [50.5, 46.5], paint);
  for (const c of [top, low]) assert.ok(c[0] < skin[0] && c[0] > 0.7 && c[2] < skin[2] && c[2] / c[0] < skin[2] / skin[0], `${c.map(v => v.toFixed(2))} is not the skin, shaded warm`);
  assert.ok(top[1] < low[1] - 0.05, 'darker at its top');
});

test('rig: drawn shut eyes show whole for all of each blink, and not at all otherwise', () => {
  const { Rig, Portrait } = loadRig(), { rig } = drawnEye(Rig);
  const blink = rig.effects[1], m = new Rig.Motion();
  assert.strictEqual(Portrait.lidsFor('img/makise.webp'), 'img/makise-lids.png');
  m.blink(100);
  const during = [0.01, 0.2, 0.5, 0.8, 0.99].map(u => Rig.lidded(rig.effects, m.values(100 + blink.span * u, rig.effects)));
  assert.deepStrictEqual(during, [true, true, true, true, true], 'shut all through the blink, with no in-between');
  let t = 1000;
  while (Rig.shut(t, blink) > 0) t += 0.25;
  assert.ok(!Rig.lidded(rig.effects, m.values(t, rig.effects)), 'open, they don\'t show');
  blink.on = false;
  assert.ok(!Rig.lidded(rig.effects, m.values(100 + blink.span * 0.5, rig.effects)), 'a blink switched off shows nothing');
  const src = Rig.fragment(rig.effects, 1, true);
  assert.ok(src.includes(', lids;') && src.includes('step(0.001, fx[2].z)') && src.includes('texture2D(lids, t)'), 'the shader lays them over the pushed picture');
  assert.ok(!src.includes('vec4 blink1('), 'the lid no longer comes down');
  assert.ok(!Rig.fragment(rig.effects, 1).includes('lids'), 'without them, the lid comes down as before');
});

test('rig: with Idle a spring drifts about on its own, slowly, each in its own time', () => {
  const { Rig } = loadRig(), m = new Rig.Motion();
  const fx = [Rig.make('swing', 'Left arm'), Rig.make('swing', 'Left forearm')];
  for (const e of fx) { e.wind = 0; e.idle = 3; }
  const xs = [[], []];
  for (let i = 0; i <= 150 * 30; i++) {
    const t = i / 30;
    m.update(t, fx, { x: 0, y: 0 });
    if (t > 10) fx.forEach((e, j) => xs[j].push(m.spring(e).off().x));
  }
  for (const x of xs) {
    assert.ok(Math.max(...x) > 1.2 && Math.min(...x) < -1.2, `drifts ${Math.min(...x).toFixed(1)}..${Math.max(...x).toFixed(1)} px`);
    assert.ok(Math.max(...x.slice(1).map((v, i) => Math.abs(v - x[i]))) < 0.1, 'and slowly');
  }
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length, [ma, mb] = xs.map(mean);
  const cov = mean(xs[0].map((v, i) => (v - ma) * (xs[1][i] - mb))), sd = (a, m0) => Math.sqrt(mean(a.map(v => (v - m0) ** 2)));
  assert.ok(cov / sd(xs[0], ma) / sd(xs[1], mb) < 0.9, 'the two drift in step');
  assert.strictEqual(Rig.make('sway').idle, 0, 'no drifting unless asked');
});

test('rig: the rig shipped for makise.webp fits it, and its shader reads every mask', () => {
  const { Rig } = loadRig(), rig = shippedRig(Rig), size = webpSize(path.join(IMG, 'makise.webp'));
  assert.deepStrictEqual([...rig.size], size, 'made for a picture of another size');
  assert.strictEqual(rig.effects.filter(e => e.kind === 'hold').length, 1);
  for (const m of rig.maps) {
    const png = readPNG(path.join(IMG, m));
    assert.ok(Math.abs(png.width / png.height / (size[0] / size[1]) - 1) < 0.02, `${m} is ${png.width}x${png.height}`);
  }
  const src = Rig.fragment(rig.effects, rig.maps.length);
  rig.effects.forEach((e, i) => {
    const used = slot => slot && (src.includes(`a${slot[0]}.${'rgb'[slot[1]]}`) || src.includes(`texture2D(m${slot[0]}, r / size).${'rgb'[slot[1]]}`));
    assert.ok(used(e.mask), `${e.name} has no mask`);
    if (e.kind === 'blink') assert.ok(used(e.lid) && src.includes(`c = blink${i}(q, c);`), `${e.name} has no lid`);
  });
  const count = s => src.split(s).length - 1;
  assert.strictEqual(count('d += turn('), rig.effects.filter(e => e.kind === 'swing').length);
  assert.strictEqual(count('d += ') - count('d += turn('), rig.effects.filter(e => !['hold', 'swing', 'blink'].includes(e.kind)).length);
  assert.strictEqual(count('c = blink'), rig.effects.filter(e => e.kind === 'blink').length);
  // Every mask in a place of its own.
  const slots = rig.effects.flatMap(e => [e.mask, e.lid].filter(Boolean).map(m => m.join()));
  assert.strictEqual(new Set(slots).size, slots.length, 'two masks share a place');
});

test('rig: the shipped rig blinks both eyes shut, and nothing else', () => {
  const { Rig } = loadRig(), rig = shippedRig(Rig), mask = masks(rig);
  const blinks = rig.effects.filter(e => e.kind === 'blink');
  assert.strictEqual(blinks.length, 1, 'one blink, so both eyes shut at once');
  const m = new Rig.Motion();
  m.blink(50);
  const vals = m.values(50 + blinks[0].span * 0.42, rig.effects);
  // Columns of each eye, as measured on the picture: the top and bottom rows of its upper
  // lash, and the bottom row of the eye.
  const EYES = [[372, 147, 150, 170], [380, 145, 148, 170], [388, 147, 149, 167], [448, 122, 128, 147], [452, 122, 127, 147], [458, 121, 126, 148]];
  // (The row under the lash comes down with it, as the lid's soft lower edge.)
  const inEye = r => EYES.some(([x, , lash, end]) => Math.abs(r[0] - x) < 2.5 && r[1] >= lash + 2 && r[1] < end + 1);
  const inLash = r => EYES.some(([x, top, lash]) => Math.abs(r[0] - x) < 2.5 && r[1] >= top && r[1] < lash + 1);
  const tag = f => r => [f(r) ? 1 : 0, 0, 0, 1];
  const [skin] = blinks.map(e => e.skin);
  assert.ok(!inEye(skin) && !inLash(skin), 'the skin spot is on the eye');
  for (const [x, top, lash, end] of EYES) {
    // Shut, none of the eye shows ...
    for (let y = lash + 2; y <= end; y++) {
      const c = Rig.blinked(rig.effects, vals, mask, [x + 0.5, y + 0.5], tag(inEye));
      assert.ok(c[0] < 0.05, `shut, ${x},${y} shows ${c[0].toFixed(2)} of the eye`);
    }
    // ... and the lash has come down onto the bottom of it.
    const low = [0, 1, 2].map(k => Rig.blinked(rig.effects, vals, mask, [x + 0.5, end - k + 0.5], tag(inLash))[0]);
    assert.ok(Math.max(...low) > 0.95, `shut, the lash at ${x} is not down at ${end} (${low.map(v => v.toFixed(2))})`);
    const up = Rig.blinked(rig.effects, vals, mask, [x + 0.5, top + 0.5], tag(inLash))[0];
    assert.ok(up < 0.05, `shut, the lash at ${x} is still up at ${top}`);
  }
  const same = r => [r[0], r[1], 0, 1];
  for (let y = 0; y < rig.size[1] * 0.6; y += 5) {
    for (let x = 0; x < rig.size[0]; x += 5) {
      if (x > 350 && x < 475 && y > 110 && y < 180) continue;
      assert.deepStrictEqual([...Rig.blinked(rig.effects, vals, mask, [x, y], same)], [x, y, 0, 1], `the blink changes ${x},${y}`);
    }
  }
});

test('rig: her left forearm bends at the elbow, a little, without dragging the coat beside it', () => {
  const { Rig } = loadRig(), rig = shippedRig(Rig), mask = masks(rig);
  const fore = rig.effects.find(e => e.name === 'Left forearm'), at = q => mask(fore.mask[0], q)[fore.mask[1]];
  assert.ok(fore && fore.kind === 'swing' && fore.max <= 4, 'a small swing');
  assert.ok(at([712, 820]) > 0.9 && at([700, 720]) > 0.9, 'the hand and forearm turn with it');
  assert.ok(at([600, 420]) < 0.02, 'the upper arm leaves it to the shoulder');
  for (const q of [[580, 700], [590, 800], [600, 880]]) assert.ok(at(q) < 0.02, `the coat at ${q} is dragged ${at(q).toFixed(2)}`);
});

// The shipped rig at its strongest: the springs as far as 3 minutes of hard flicks of the
// cursor ever take them, gusting, breathing in, the cursor in a corner.
function strongest(Rig, rig, sign) {
  const m = new Rig.Motion(), most = new Map();
  let cam = { x: 0, y: 0 }, aim = { x: 1, y: 1 };
  for (let i = 0; i <= 30 * 180; i++) {
    const t = i / 30;
    if (i % 120 === 0) aim = { x: -aim.x, y: Kit_hash(i) * 2 - 1 };
    const k = 1 - Math.exp(-1 / 30 / 0.78);
    cam = { x: cam.x + (aim.x - cam.x) * k, y: cam.y + (aim.y - cam.y) * k };
    m.update(t, rig.effects, { x: -cam.x * 10.4 + Math.sin(t / 9.7) * 2.5, y: -cam.y * 7.3 + Math.sin(t * 0.84) * 4 }, cam);
    for (const e of rig.effects) {
      if (e.kind !== 'sway' && e.kind !== 'swing') continue;
      const o = m.spring(e).off(), was = most.get(e) || [0, 0];
      most.set(e, [Math.max(was[0], Math.abs(o.x)), Math.max(was[1], Math.abs(o.y))]);
    }
  }
  for (const [e, [x, y]] of most) {
    const s = m.spring(e), toward = v => Math.atanh(Math.min(0.999, v / e.max)) * e.max / Math.max(1e-3, e.gain);
    s.x = s.bx + sign * toward(x);
    s.y = s.by + sign * toward(y);
  }
  m.cursor = { x: sign, y: sign };
  m.blow(0);
  return m;
}
const Kit_hash = i => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;

test('rig: at their strongest the hair, arms and waves never move what is held', () => {
  const { Rig } = loadRig(), rig = shippedRig(Rig), mask = masks(rig);
  const hold = rig.effects.find(e => e.kind === 'hold');
  const heldAt = q => mask(hold.mask[0], q)[hold.mask[1]];
  // Her face, the shirt beside the long lock and under it, the tie, belt, shorts and both
  // thighs right up to the coat: all held.
  const body = { face: [418, 190], eye: [454, 138], shirt: [380, 450], 'shirt by the lock': [474, 330],
    'shirt below the lock': [490, 470], tie: [400, 500], belt: [400, 640], shorts: [400, 700],
    'left thigh by the coat': [279, 820], 'right thigh by the coat': [539, 800] };
  for (const [name, q] of Object.entries(body)) assert.ok(heldAt(q) > 0.99, `${name} is held only ${heldAt(q).toFixed(2)}`);
  for (const sign of [1, -1]) {
    const m = strongest(Rig, rig, sign);
    for (const e of rig.effects) e.on = e.hold !== false; // breathing and parallax may carry the body
    for (const ph of [0, 2.1, 4.2]) {
      for (const e of rig.effects) if (e.kind === 'wave') m.waves.set(e, { ph, drift: ph });
      const vals = m.values(2, rig.effects);
      for (let y = 0; y < rig.size[1] * 0.6; y += 4) {
        for (let x = 0; x < rig.size[0]; x += 4) {
          if (heldAt([x, y]) < 0.999) continue;
          const d = Rig.push(rig.effects, vals, mask, [x, y]);
          assert.ok(Math.hypot(d[0], d[1]) < 0.02, `held ${x},${y} moved ${d.map(v => v.toFixed(2))}`);
        }
      }
    }
  }
});

test('rig: at its strongest nothing folds over or tears, and the shader finds every pixel', () => {
  const { Rig } = loadRig(), rig = shippedRig(Rig), mask = masks(rig), W = rig.size[0], H = Math.round(rig.size[1] * 0.6);
  for (const sign of [1, -1]) {
    const m = strongest(Rig, rig, sign);
    for (const ph of [0, 1.6, 3.1, 4.7]) {
      for (const e of rig.effects) if (e.kind === 'wave') m.waves.set(e, { ph, drift: ph });
      const vals = m.values(2, rig.effects), s = 3, gw = Math.floor(W / s), gh = Math.floor(H / s), D = new Float32Array(gw * gh * 2);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) D.set(Rig.push(rig.effects, vals, mask, [i * s, j * s]), (j * gw + i) * 2);
      // Where the picture is pushed, it must stay the right way round: a fold would draw
      // some of it twice and lose what's beside it.
      for (let j = 1; j < gh - 1; j++) {
        for (let i = 1; i < gw - 1; i++) {
          const o = (j * gw + i) * 2, r = gw * 2;
          const det = (1 + (D[o + 2] - D[o - 2]) / (2 * s)) * (1 + (D[o + r + 1] - D[o - r + 1]) / (2 * s))
            - (D[o + r] - D[o - r]) / (2 * s) * (D[o + 3] - D[o - 1]) / (2 * s);
          assert.ok(det > 0.15, `folds at ${i * s},${j * s} (${det.toFixed(2)})`);
        }
      }
      for (let y = 0; y < H; y += 6) {
        for (let x = 0; x < W; x += 6) {
          const q = Rig.source(rig.effects, vals, mask, [x, y]), d = Rig.push(rig.effects, vals, mask, q);
          const miss = Math.hypot(q[0] + d[0] - x, q[1] + d[1] - y);
          assert.ok(miss < 1.5, `the shader misses ${x},${y} by ${miss.toFixed(2)} px`);
        }
      }
    }
  }
});

// ---------- Schematics: the woven drawing, its lines and shapes, where they go and their lives (nothing is drawn without a screen) ----------

function loadSchematic() {
  const ctx = { Math };
  vm.createContext(ctx);
  const src = ['kit.js', 'schematic.js'].map(f => fs.readFileSync(path.join(__dirname, '../wallpaper/js', f), 'utf8')).join('\n;\n');
  vm.runInContext(src + ';this.Kit = Kit; this.Schematic = Schematic;', ctx);
  return ctx;
}

// The wallpaper's own: Makise's pool of negative space and the ellipses her figure covers
// (portrait.js), the meter's pool and the big clock's face (scene.js).
const MAKISE_FOCUS = { x: 600, y: 790, rx: 720, ry: 800 };
const MAKISE_FIGURE = [{ x: 620, y: 680, rx: 230, ry: 440 }, { x: 615, y: 1150, rx: 330, ry: 130 }];
const METER_FOCUS = { x: 560, y: 695, rx: 760, ry: 440 };
const ASTROLABE = { x: 2000, y: 560, r: 820 };
const behind = (x, y) => MAKISE_FIGURE.some(f => ((x - f.x) / f.rx) ** 2 + ((y - f.y) / f.ry) ** 2 < 1);
const onFace = (x, y, k = 1) => Math.hypot(x - ASTROLABE.x, y - ASTROLABE.y) < ASTROLABE.r * k;
// A field set up as the wallpaper sets it up, round Makise or the meter.
function place(field, centre = 'makise') {
  if (centre === 'makise') field.centre(MAKISE_FOCUS, { figure: MAKISE_FIGURE });
  else field.centre(METER_FOCUS, { clear: true });
  field.quiet([ASTROLABE]);
  return field;
}
// A drawing run at 30 fps from the start to `until` s, `each(t, field, Schematic)` called every half second.
function runField(seed, until, each, centre = 'makise') {
  const { Kit, Schematic } = loadSchematic();
  const field = place(new Schematic.Field(Kit.rng(seed)), centre);
  for (let k = 0; k <= until * 30; k++) {
    field.update(k / 30);
    if (k % 15 === 0 && each) each(k / 30, field, Schematic);
  }
  return { field, Schematic };
}
const isLine = e => e.kind === 'line';
// How far x, y lies from line l (design px).
function offLine(l, x, y) {
  const dx = l.x1 - l.x0, dy = l.y1 - l.y0, u = Math.max(0, Math.min(1, ((x - l.x0) * dx + (y - l.y0) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(l.x0 + dx * u - x, l.y0 + dy * u - y);
}

test('schematic: lines draw on along their length, and their shapes start as the pen passes them', () => {
  const { Kit, Schematic: S } = loadSchematic();
  const f = { born: 10, inT: 3, dies: 50, outT: 2 }, at = t => [...S.phase(f, t)];
  assert.deepStrictEqual(at(10), [0, 0]);
  assert.deepStrictEqual(at(13), [1, 0]);
  assert.deepStrictEqual(at(52), [1, 1]);
  for (const n of [1, 3, 5]) {
    for (let i = 0; i < n; i++) {
      assert.strictEqual(S.stagger(0, i, n), 0);
      assert.strictEqual(S.stagger(1, i, n), 1);
      if (i) assert.ok(S.stagger(0.3, i, n) <= S.stagger(0.3, i - 1, n), 'a later part ran ahead of an earlier one');
    }
  }
  for (let i = 0; i <= 20; i++) {
    assert.ok(Math.abs(Kit.ease.inOut(S.reach(i / 20)) - i / 20) < 1e-9, `the pen isn't ${i / 20} of the way along when it should be`);
  }
  const { field } = runField(3, 120);
  for (const e of field.items) {
    if (isLine(e) || e.leaving) continue;
    const L = e.deps[0], due = L.born + L.inT * S.reach(e.u);
    assert.ok(e.born >= due && e.born <= due + 0.5, `a ${e.kind} started ${(e.born - due).toFixed(2)} s from when the pen passed it`);
  }
});

test('schematic: every shape lies on its lines, and goes when any of them goes', () => {
  let shapes = 0;
  runField(4, 600, (t, field) => {
    for (const e of field.items) {
      if (isLine(e)) continue;
      shapes++;
      // A circle resting on a line touches it, its centre its radius away.
      const L = e.deps[0], on = [e.kind === 'rest' ? [e.px, e.py, L] : [e.x, e.y, L]];
      if (e.kind === 'rest') assert.ok(Math.abs(offLine(L, e.x, e.y) - e.R) < 0.5, 'a circle not resting on its line');
      if (e.kind === 'link') on.push([e.x1, e.y1, e.deps[1]]);
      else if (e.deps[1]) on.push([e.x, e.y, e.deps[1]]);
      if (e.kind === 'diamond') e.corners.forEach(([x, y], i) => on.push([x, y, e.deps[i % 2]]));
      if (e.n && e.ux != null) { const gap = e.step || e.gap; on.push([e.x + e.ux * gap * (e.n - 1), e.y + e.uy * gap * (e.n - 1), L]); }
      for (const [x, y, l] of on) assert.ok(offLine(l, x, y) < 0.5, `a ${e.kind} ${offLine(l, x, y).toFixed(1)} px off its line`);
      if (!e.leaving) for (const d of e.deps) assert.ok(field.items.includes(d) && !d.leaving, `a ${e.kind} stayed after its line went, at ${t}s`);
    }
  });
  assert.ok(shapes > 1000, `only ${shapes} shapes looked at`);
});

test('schematic: it grows like a crystal: off lines, square to them or at 60°, in formations at many angles, not a grid', () => {
  let grown = 0, worst = 0;
  const all = new Array(18).fill(0); // line length by its angle, modulo 90°, in 5° steps
  runField(6, 900, (t, field) => {
    for (const l of field.items) {
      if (!isLine(l) || !l.from || l.checked) continue;
      l.checked = true;
      grown++;
      assert.ok(offLine(l.from, l.x0, l.y0) < 0.5, 'a growth set off from nowhere');
      const cos = Math.abs(l.ux * l.from.ux + l.uy * l.from.uy);
      assert.ok(cos < 1e-6 || Math.abs(cos - 0.5) < 1e-6, `a growth at ${(Math.acos(cos) * 180 / Math.PI).toFixed(0)}° to its line`);
    }
    if (t < 30 || t % 30) return;
    const now = new Array(18).fill(0);
    for (const l of field.lines) now[Math.floor(((Math.atan2(l.uy, l.ux) * 180 / Math.PI) % 90 + 90) % 90 / 5)] += l.len;
    const sum = now.reduce((s, v) => s + v, 0);
    worst = Math.max(worst, Math.max(...now) / sum);
    now.forEach((v, i) => { all[i] += v; });
  });
  const sum = all.reduce((s, v) => s + v, 0), shares = all.map(v => v / sum);
  assert.ok(grown > 200, `only ${grown} growths`);
  assert.ok(worst < 0.35, `${(worst * 100).toFixed(0)}% of the line at one angle at once: a grid`);
  assert.ok(Math.max(...shares) < 0.25 && shares.filter(v => v > 0.02).length >= 10, 'over time, the lines keep to too few angles');
});

test('schematic: lines apart, some broken: none alongside another its way, and some long ones in pieces', () => {
  let close = 0, broken = 0, long = 0;
  runField(10, 900, (t, field) => {
    if (t % 30) return;
    const ls = field.lines;
    for (let i = 0; i < ls.length; i++) {
      for (let j = i + 1; j < ls.length; j++) {
        const a = ls[i], b = ls[j];
        if (Math.abs(a.ux * b.uy - a.uy * b.ux) >= 0.03) continue;
        if (Math.min(offLine(a, b.x0, b.y0), offLine(a, b.x1, b.y1), offLine(b, a.x0, a.y0), offLine(b, a.x1, a.y1)) < 40) close++;
      }
    }
    for (const l of ls) if (l.len > 350) { long++; if (l.gaps.length) broken++; }
  });
  assert.ok(close <= 3, `${close} times a line lay alongside another its way`);
  assert.ok(broken > long * 0.15 && broken < long * 0.55, `${broken} of ${long} long lines broken`);
});

test('schematic: always the same number of growths, and always something drawing on or off', () => {
  let quiet = 0, longest = 0;
  runField(5, 3600, (t, field, S) => {
    const n = field.staying();
    assert.ok(n >= field.count - 1 && n <= field.count, `${n} growths at ${t}s`);
    const busy = field.items.some(e => { const [on, off] = S.phase(e, t); return (on > 0 && on < 1) || (off > 0 && off < 1); });
    quiet = busy ? 0 : quiet + 0.5;
    longest = Math.max(longest, quiet);
  });
  assert.ok(longest <= 8, `nothing drew on or off for ${longest}s`);
});

test('schematic: spread evenly round Makise and behind her, thinner over the big clock, with no shapes behind her or on it', () => {
  const blocks = [], face = [];
  runField(7, 1800, (t, field, S) => {
    if (t < 60 || t % 20) return;
    // The line in each block of the frame (256 x 240 px), against the average of those off
    // the clock's face.
    const ink = new Array(60).fill(0);
    for (const e of field.items) {
      if (e.leaving) continue;
      for (const [x, y] of S.KINDS[e.kind].pts(e)) {
        if (x < 0 || x >= 2560 || y < 0 || y >= 1440) continue;
        ink[Math.floor(y / 240) * 10 + Math.floor(x / 256)] += e.k;
      }
    }
    const mid = i => [(i % 10) * 256 + 128, Math.floor(i / 10) * 240 + 120];
    const open = ink.filter((v, i) => !onFace(...mid(i), 0.8)), on = ink.filter((v, i) => onFace(...mid(i), 0.6));
    const mean = open.reduce((s, v) => s + v, 0) / open.length;
    for (const v of open) blocks.push(v / mean);
    face.push(on.reduce((s, v) => s + v, 0) / on.length / mean);
    for (const e of field.items) {
      if (isLine(e) || e.leaving) continue;
      assert.ok(!behind(e.x, e.y), `a ${e.kind} behind Makise at ${t}s`);
      assert.ok(!onFace(e.x, e.y), `a ${e.kind} on the clock's face at ${t}s`);
    }
  });
  // A long line coming or going moves a block a long way, so a block may be nearly bare
  // for a moment, but seldom, and never much more than three times as full as the rest.
  blocks.sort((a, b) => a - b);
  const share = blocks.filter(v => v < 0.15).length / blocks.length, p5 = blocks[Math.floor(blocks.length * 0.05)];
  assert.ok(blocks[blocks.length - 1] < 3.5, `a block ${blocks[blocks.length - 1].toFixed(2)} times as full as the average`);
  assert.ok(share < 0.02 && p5 > 0.25, `blocks nearly bare ${(share * 100).toFixed(1)}% of the time, the barest 5% under ${p5.toFixed(2)} of the average`);
  const held = face.reduce((s, v) => s + v, 0) / face.length;
  assert.ok(held < 0.75, `the clock's face holds ${held.toFixed(2)} of the line anywhere else does`);
});

test('schematic: round the meter it keeps the clear middle, with no shapes in its core', () => {
  let shapes = 0;
  runField(13, 600, (t, field) => {
    for (const e of field.items) {
      if (isLine(e) || e.leaving) continue;
      shapes++;
      assert.ok(Math.hypot((e.x - 560) / 760, (e.y - 695) / 440) > 0.25, `a ${e.kind} in the clear middle at ${t}s`);
    }
  }, 'meter');
  assert.ok(shapes > 500, `only ${shapes} shapes looked at`);
});

test('schematic: as many growths as the open frame holds: fewer where it is cleared or kept quiet', () => {
  const { Kit, Schematic: S } = loadSchematic();
  const open = new S.Field(Kit.rng(1)), makise = place(new S.Field(Kit.rng(1))), meter = place(new S.Field(Kit.rng(1)), 'meter');
  assert.strictEqual(open.count, S.COUNT);
  assert.ok(makise.count >= 52 && makise.count <= 60, `${makise.count} growths round Makise`);
  assert.ok(meter.count >= 46 && meter.count <= 54 && meter.count < makise.count, `${meter.count} growths round the meter`);
});

test('schematic: few small shapes, lines first: no gears, no diamonds side by side, three dials at most', () => {
  const { Schematic } = loadSchematic();
  assert.ok(!Schematic.SHAPES.some(k => /gear|train/i.test(k)), 'gears among the shapes');
  runField(8, 1200, (t, field, S) => {
    const staying = field.items.filter(e => !e.leaving), shapes = staying.filter(e => !isLine(e));
    const diamonds = shapes.filter(e => e.kind === 'diamond');
    for (let i = 0; i < diamonds.length; i++) {
      for (let j = i + 1; j < diamonds.length; j++) {
        assert.ok(Math.hypot(diamonds[i].x - diamonds[j].x, diamonds[i].y - diamonds[j].y) >= 300, `diamonds side by side at ${t}s`);
      }
    }
    assert.ok(shapes.filter(e => e.kind === 'dial').length <= 3, `more than three dials at ${t}s`);
    for (const e of shapes) if (e.kind === 'ring') assert.ok(Math.max(...e.radii) <= 80, 'a big ring');
    const ink = list => list.reduce((s, e) => s + S.KINDS[e.kind].pts(e).length * e.k, 0);
    assert.ok(ink(staying.filter(isLine)) >= 2 * ink(shapes), `nearly as much shape as line at ${t}s`);
  });
});

test('schematic: a few circles from the opening, on the lines, well apart, never behind Makise or on the big clock', () => {
  const kinds = new Set();
  let sum = 0, samples = 0;
  runField(14, 1200, (t, field, S) => {
    const cs = field.items.filter(e => e.disc && !e.leaving);
    assert.ok(cs.length <= S.CIRCLES, `${cs.length} circles at ${t}s`);
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i].disc, k = cs[i].kind;
      kinds.add(k);
      assert.ok(a.x - a.R >= 0 && a.x + a.R <= 2560 && a.y - a.R >= 0 && a.y + a.R <= 1440, `a ${k} out of the frame`);
      // Short of the clock's numerals, and no more than a third of the way in behind her.
      assert.ok(Math.hypot(a.x - ASTROLABE.x, a.y - ASTROLABE.y) - a.R >= ASTROLABE.r * 0.9, `a ${k} on the clock's face`);
      assert.ok(!MAKISE_FIGURE.some(f => ((a.x - f.x) / (f.rx + a.R / 3)) ** 2 + ((a.y - f.y) / (f.ry + a.R / 3)) ** 2 < 1), `a ${k} behind Makise`);
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j].disc;
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.R + b.R + 80, `a ${k} and a ${cs[j].kind} close together at ${t}s`);
      }
    }
    if (t >= 60) { sum += cs.length; samples++; }
  });
  const mean = sum / samples;
  assert.ok(mean >= 5 && mean <= 10, `${mean.toFixed(1)} circles at a time on average`);
  for (const k of ['pulley', 'hourglass', 'fan', 'rest']) assert.ok(kinds.has(k), `no ${k} in 20 minutes`);
});

test('schematic: hourglasses turn a step now and then, like the clocks', () => {
  const { Schematic: S } = loadSchematic(), turn = S.KINDS.hourglass.angle;
  assert.ok(S.KINDS.hourglass.live, 'hourglasses drawn into the sheet, where they cannot turn');
  for (const e of [{ a: 0.3, every: 7, dir: 1, ph: 0.4 }, { a: -1, every: 10.5, dir: -1, ph: 0.9 }]) {
    let moving = 0, n = 0;
    for (let t = 0; t < 120; t += 0.05) {
      n++;
      if (Math.abs(turn(e, t + 0.05) - turn(e, t)) < 1e-9) {
        // Holding still: a whole number of steps round.
        const k = (turn(e, t) - e.a) / (Math.PI / 4);
        assert.ok(Math.abs(k - Math.round(k)) < 1e-6, `an hourglass held still part way through a step at ${t.toFixed(2)}s`);
      } else moving++;
    }
    assert.ok(moving / n < 0.12, `an hourglass turning ${(100 * moving / n).toFixed(0)}% of the time`);
  }
});

test('schematic: glints run only along lines, turning only where lines cross', () => {
  let seen = 0, turned = 0;
  runField(9, 900, (t, field) => {
    for (const gl of field.glints) {
      seen++;
      assert.ok(field.items.includes(gl.L) && isLine(gl.L) && !gl.L.leaving, 'a glint off any line');
      assert.ok(gl.u >= 0 && gl.u <= 1, 'a glint beyond its line');
      for (let i = 1; i < gl.path.length; i++) {
        const { x, y } = gl.path[i];
        assert.ok(offLine(gl.path[i - 1].L, x, y) < 0.5 && offLine(gl.path[i].L, x, y) < 0.5, 'a glint turned away from a crossing');
        turned++;
      }
    }
  });
  assert.ok(seen > 50 && turned > 0, `${seen} glints seen, ${turned} turns`);
});

test('schematic: a worldline shift wipes the drawing outward from the centrepiece and grows a new one', () => {
  const { Kit, Schematic: S } = loadSchematic();
  const field = place(new S.Field(Kit.rng(11)));
  let t = 0;
  for (; t < 100; t += 1 / 30) field.update(t);
  const before = new Set(field.items);
  field.shift(t);
  // Wiped outward: the nearest third of the shapes to the centrepiece go before the
  // farthest third.
  const shapes = [...before].filter(e => !isLine(e)).sort((a, b) => Math.hypot(a.x - 600, a.y - 790) - Math.hypot(b.x - 600, b.y - 790));
  const third = Math.floor(shapes.length / 3), when = list => list.reduce((a, e) => a + e.dies, 0) / list.length;
  assert.ok(third >= 5 && when(shapes.slice(0, third)) < when(shapes.slice(-third)), 'the far shapes went first');
  for (const end = t + 2; t < end; t += 1 / 30) field.update(t);
  assert.ok(field.items.every(e => !before.has(e)), 'lines or shapes from before the shift still there after 2 s');
  for (const end = t + 6; t < end; t += 1 / 30) field.update(t);
  assert.ok(field.staying() >= field.count - 2, `only ${field.staying()} growths 8 s after the shift`);
});

test('schematic: the sheet is drawn afresh only when something starts to erase, and nothing long gone is kept', () => {
  const { field } = runField(12, 900);
  assert.ok(field.retired > 100, `only ${field.retired} growths erased in 15 minutes`);
  assert.ok(field.redraws <= field.retired, `${field.redraws} redraws for ${field.retired} growths erased`);
  // The lines a line grew from, back through those already erased: an erased one lets go.
  const kept = new Set();
  for (const l of field.lines) for (let p = l.from; p && !field.items.includes(p); p = p.from) kept.add(p);
  assert.ok(kept.size <= field.lines.length, `${kept.size} erased lines still held`);
});

process.exitCode = failures ? 1 : 0;
console.log(failures ? `${failures} failing` : 'all passing');
