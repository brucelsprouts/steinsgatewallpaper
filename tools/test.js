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
  const fit = Portrait.fitOf({ naturalWidth: rig.size[0], naturalHeight: rig.size[1] }, 0.6);
  const hair = rig.effects.find(e => e.kind === 'sway'), arms = rig.effects.filter(e => e.kind === 'swing');
  const out = [];
  let cam = -1, last = 0;
  for (let i = 0; i <= 15 * fps; i++) {
    const t = i / fps;
    cam += ((t < 5 ? -1 : 1) - cam) * (1 - Math.exp(-(t - last) / 0.78));
    last = t;
    m.update(t, rig.effects, { x: (at ? at(t) : -cam * 12.6) / fit, y: 0 });
    out.push({ t, ...m.spring(hair).off(), arms: arms.map(a => m.spring(a).off().x) });
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
    const rest = Math.max(...after.map(s => Math.abs(s.arms[side])));
    assert.ok(rest < 3.3, `arm ${side} still ${rest.toFixed(1)} px out`);
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

test('rig: the rig shipped for makise.webp fits it, and its shader reads every mask', () => {
  const { Rig } = loadRig(), rig = shippedRig(Rig), size = webpSize(path.join(IMG, 'makise.webp'));
  assert.deepStrictEqual([...rig.size], size, 'made for a picture of another size');
  assert.strictEqual(rig.effects.filter(e => e.kind === 'hold').length, 1);
  for (const m of rig.maps) {
    const png = readPNG(path.join(IMG, m));
    assert.ok(Math.abs(png.width / png.height / (size[0] / size[1]) - 1) < 0.02, `${m} is ${png.width}x${png.height}`);
  }
  const src = Rig.fragment(rig.effects, rig.maps.length);
  for (const e of rig.effects) assert.ok(e.mask && src.includes(`a${e.mask[0]}.${'rgb'[e.mask[1]]}`), `${e.name} has no mask`);
  const count = s => src.split(s).length - 1;
  assert.strictEqual(count('d += turn('), rig.effects.filter(e => e.kind === 'swing').length);
  assert.strictEqual(count('d += ') - count('d += turn('), rig.effects.filter(e => !['hold', 'swing'].includes(e.kind)).length);
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

// ---------- Schematics: how the sheets fade and drift (nothing is drawn without a screen) ----------

function loadSchematic() {
  const ctx = { Math };
  vm.createContext(ctx);
  const src = ['kit.js', 'schematic.js'].map(f => fs.readFileSync(path.join(__dirname, '../wallpaper/js', f), 'utf8')).join('\n;\n');
  vm.runInContext(src + ';this.Schematic = Schematic;', ctx);
  return ctx;
}

test('schematic: the sheets take turns, each a while fully in, always about as much drawing', () => {
  const { Schematic } = loadSchematic();
  const N = 600, full = [0, 0, 0], out = [0, 0, 0];
  for (let k = 0; k < N; k++) {
    const t = k / N * Schematic.FADE, f = Schematic.fades(t), sum = f.reduce((a, b) => a + b, 0);
    assert.strictEqual(f.length, 3);
    assert.ok(sum >= 1.2 && sum <= 1.8, `${sum.toFixed(2)} sheets showing at ${t.toFixed(1)}s`);
    f.forEach((v, i) => {
      assert.ok(v >= 0 && v <= 1, `sheet ${i} at ${v}`);
      if (v === 1) full[i]++;
      if (v === 0) out[i]++;
    });
  }
  // Each sheet is fully in, and fully out, for at least a fifth of its cycle.
  for (let i = 0; i < 3; i++) assert.ok(full[i] > N / 5 && out[i] > N / 5, `sheet ${i} fully in ${full[i]}/${N}, out ${out[i]}/${N}`);
});

test('schematic: the sheets drift slowly and smoothly, however long it runs', () => {
  const { Schematic } = loadSchematic();
  const { w, h } = Schematic.SHEET, cam = { x: 0, y: 0 };
  const apart = (a, b, n) => Math.abs((b - a) - n * Math.round((b - a) / n));
  for (let i = 0; i < 3; i++) {
    for (const t0 of [0, 3600, 86400 * 30]) {
      const a = Schematic.place(i, t0, cam), b = Schematic.place(i, t0 + 1, cam);
      for (const p of [a, b]) assert.ok(p.x >= 0 && p.x < w && p.y >= 0 && p.y < h, `sheet ${i} at ${p.x},${p.y}`);
      const moved = Math.hypot(apart(a.x, b.x, w), apart(a.y, b.y, h));
      assert.ok(moved < 8, `sheet ${i} moved ${moved.toFixed(1)} px in a second at ${t0}s`);
      assert.ok(Math.abs(b.zoom - a.zoom) < 0.01 && Math.abs(b.turn - a.turn) < 0.01, `sheet ${i} jumped at ${t0}s`);
    }
  }
});

test('schematic: the sheets drift with the cursor, as the deepest layer', () => {
  const { Schematic } = loadSchematic();
  const { w } = Schematic.SHEET;
  for (let i = 0; i < 3; i++) {
    const a = Schematic.place(i, 10, { x: 0, y: 0 }), b = Schematic.place(i, 10, { x: 1, y: 0 });
    // The point at the middle of the frame slides back along the sheet: the sheet moves
    // the way the cursor did.
    const d = (b.x - a.x) - w * Math.round((b.x - a.x) / w);
    assert.ok(d < -30, `sheet ${i} moved ${d.toFixed(1)} px along itself`);
  }
});

process.exitCode = failures ? 1 : 0;
console.log(failures ? `${failures} failing` : 'all passing');
