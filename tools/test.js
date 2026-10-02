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

test('ink: boots with three resting elements and forms a fourth within seconds', () => {
  const { Kit, Ink } = loadInk();
  const f = new Ink.Field(Kit.rng(1), { x: 0, y: 0 });
  f.update(0);
  assert.strictEqual(f.blooms.length, 3);
  assert.ok(f.blooms.every(b => b.phase(0)[0] === 'resting'));
  for (let t = 0; t <= 7; t += 0.5) f.update(t);
  assert.strictEqual(f.blooms.length, 4);
});

test('ink: over three hours, never crowded or bare, zones and colours never shared', () => {
  const { Kit, Ink } = loadInk();
  for (const seed of [1, 2, 3]) {
    const f = new Ink.Field(Kit.rng(seed), { x: 0, y: 0 });
    let spawned = 0, last = null;
    simulate(f, 3 * 3600, (field, t) => {
      const n = field.blooms.length, active = field.active(t);
      assert.ok(active <= Ink.MAX, `${active} elements at ${t}s`);
      if (t > 10) assert.ok(n >= 2 && active >= 1, `only ${n} elements (${active} not dissolving) at ${t}s`);
      assert.strictEqual(new Set(field.blooms.map(b => b.zone)).size, n);
      assert.strictEqual(new Set(field.blooms.map(b => b.color)).size, n);
      const newest = field.blooms[field.blooms.length - 1];
      if (newest !== last) { spawned++; last = newest; }
    });
    assert.ok(spawned > 60, `only ${spawned} elements in three hours`);
  }
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
  simulate(f, 20, () => {});
  assert.strictEqual(f.active(20), Ink.MAX);
  const oldest = [...f.blooms].sort((a, b) => a.born - b.born)[0];
  f.shift(20);
  const splash = f.blooms[f.blooms.length - 1];
  assert.strictEqual(splash.kind, 'splash');
  assert.strictEqual(oldest.phase(20.5)[0], 'fading');
  simulate(f, 120, () => {}, 21);
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

test('ink: paint style defaults lighter, and only knows screen and overlay', () => {
  const { Kit, Ink } = loadInk();
  const f = new Ink.Field(Kit.rng(1), { x: 0, y: 0 });
  assert.strictEqual(f.blend, 'screen');
  assert.ok(f.gain > 0.5 && f.gain < 1, `default gain ${f.gain}`);
  f.style({ blend: 'overlay', gain: '1.2' });
  assert.deepStrictEqual([f.blend, f.gain], ['overlay', 1.2]);
  f.style({ blend: 'difference', gain: -3 });
  assert.deepStrictEqual([f.blend, f.gain], ['screen', 0]);
});

process.exitCode = failures ? 1 : 0;
console.log(failures ? `${failures} failing` : 'all passing');
