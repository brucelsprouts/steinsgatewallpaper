// Behaviour checks for the display controller: node tools/test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

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

function loadPortrait() {
  const ctx = { Math, Promise, Sway: { Warp: class {} } };
  vm.createContext(ctx);
  const src = ['kit.js', 'portrait.js'].map(f => fs.readFileSync(path.join(__dirname, '../wallpaper/js', f), 'utf8')).join('\n;\n');
  vm.runInContext(src + ';this.Portrait = Portrait;', ctx);
  return ctx;
}

// The hair over a run where the body moves 25 px to the left at 5 s (`at(t)`, by
// default the way the centrepiece's depth plane follows a flick of the cursor), stepped
// at `fps`.
function swing(fps, at) {
  const p = new (loadPortrait().Portrait.Portrait)();
  const out = [];
  let cam = -1, last = 0;
  for (let i = 0; i <= 15 * fps; i++) {
    const t = i / fps;
    cam += ((t < 5 ? -1 : 1) - cam) * (1 - Math.exp(-(t - last) / 0.78));
    last = t;
    p.update(t, { x: at ? at(t) : -cam * 12.6, y: 0 });
    out.push({ t, ...p.hair.off(), arms: p.arms.map(a => a.off().x) });
  }
  return out;
}

test('portrait: the hair trails a move, swings back and settles', () => {
  const run = swing(30), at = (a, b) => run.filter(s => s.t >= a && s.t < b).map(s => s.x);
  const before = Math.max(...at(4, 5)), trail = Math.max(...at(5, 6.5));
  assert.ok(trail > before + 6, `trailed ${trail.toFixed(1)} px (was ${before.toFixed(1)})`);
  assert.ok(Math.min(...at(5.5, 8)) < before, 'never swung back');
  const settled = at(10, 15).map(x => Math.abs(x - before));
  assert.ok(Math.max(...settled) < 8, `still swinging ${Math.max(...settled).toFixed(1)} px from rest`);
});

test('portrait: the arms trail a move too, more gently than the hair, and settle', () => {
  const run = swing(30), during = run.filter(s => s.t >= 5 && s.t < 7), after = run.filter(s => s.t >= 11);
  const hair = Math.max(...during.map(s => Math.abs(s.x)));
  for (const side of [0, 1]) {
    const arm = Math.max(...during.map(s => Math.abs(s.arms[side])));
    assert.ok(arm > 1 && arm < hair, `arm ${side} swung ${arm.toFixed(1)} px (hair ${hair.toFixed(1)})`);
    const rest = Math.max(...after.map(s => Math.abs(s.arms[side])));
    assert.ok(rest < 4, `arm ${side} still ${rest.toFixed(1)} px out`);
  }
});

test('portrait: the hair moves the same at any frame rate', () => {
  const glide = t => 12.6 - 25.2 * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, (t - 5) / 0.8))));
  const a = swing(30, glide), b = swing(60, glide).filter((s, i) => i % 2 === 0);
  const worst = Math.max(...a.map((s, i) => Math.hypot(s.x - b[i].x, s.y - b[i].y)));
  assert.ok(worst < 0.5, `30 and 60 fps differ by ${worst.toFixed(2)} px`);
});

process.exitCode = failures ? 1 : 0;
console.log(failures ? `${failures} failing` : 'all passing');
