'use strict';
// What the tubes say, and when the worldline shifts.
//   Time / Date: a random shift shows a canon worldline for ~10 s, then rolls back;
//                a click only spins the clocks and flashes the tubes.
//   Worldline:   a shift (random or click) lands on a new canon value and stays.
const Display = (() => {
  const WORLDLINES = ['0.571024', '0.337187', '1.130205', '1.048596'];
  const INTERLUDE = 10;              // seconds a worldline shows in time/date mode
  const MIN_GAP = 20 * 60, MAX_GAP = 60 * 60;

  const pad = n => String(n).padStart(2, '0');
  // 24-hour: with every tube in use there is no room for an AM/PM marker.
  const formatTime = d => `${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  const formatDate = d => `${pad(d.getFullYear() % 100)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;

  class Controller {
    constructor(meter, clock, random = Math.random) {
      this.meter = meter;
      this.clock = clock;
      this.random = random;
      this.mode = Config.get('display');
      this.worldline = WORLDLINES[Math.floor(random() * WORLDLINES.length)];
      this.interludeUntil = -1;
      this.inInterlude = false;
      this.nextShift = Infinity;
      this.onShift = null; // (t, worldline): clocks spin; worldline is true for a real shift
    }

    schedule(t) { this.nextShift = t + MIN_GAP + this.random() * (MAX_GAP - MIN_GAP); }

    pickWorldline() {
      const others = WORLDLINES.filter(v => v !== this.worldline);
      return others[Math.floor(this.random() * others.length)];
    }

    text(t) {
      if (this.mode === 'worldline' || t < this.interludeUntil) return this.worldline;
      const d = this.clock();
      return this.mode === 'date' ? formatDate(d) : formatTime(d);
    }

    // A full worldline shift: tubes scramble and land on a new value, clocks spin.
    shift(t) {
      if (!Config.get('shift')) return;
      this.worldline = this.pickWorldline();
      if (this.mode !== 'worldline') this.interludeUntil = t + INTERLUDE;
      this.meter.startShift(t);
      this.onShift?.(t, true);
      this.schedule(t);
    }

    // A click never hides the time or date: the clocks spin and the tubes flash.
    // Only in worldline mode does it move to a new worldline.
    click(t) {
      if (!Config.get('shift')) return;
      if (this.mode === 'worldline') { this.shift(t); return; }
      this.meter.flash(t);
      this.onShift?.(t, false);
    }

    setMode(m, t) {
      if (m === this.mode) return;
      this.mode = m;
      this.interludeUntil = -1;
      if (Config.get('shift')) this.meter.startShift(t);
    }

    boot(t) {
      this.meter.target = this.text(t);
      if (Config.get('shift')) this.meter.startShift(t);
      this.schedule(t);
    }

    tick(t) {
      if (t >= this.nextShift) {
        if (Config.get('shift')) this.shift(t); else this.schedule(t);
      }
      // End of the interlude: roll the tubes back (the clocks already had their moment).
      const inside = t < this.interludeUntil;
      if (this.inInterlude && !inside) this.meter.startShift(t);
      this.inInterlude = inside;
      this.meter.target = this.text(t);
    }
  }

  return { Controller, WORLDLINES, formatTime, formatDate };
})();
