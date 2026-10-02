'use strict';
// Decides what the tubes say: time / divergence / date, the hourly worldline
// shift, and the divergence interlude that follows it in time mode.
const Display = (() => {
  const HOME = '1.048596';
  // Canon Alpha and Beta attractor-field values.
  const CANON = ['0.571024', '0.571046', '0.523299', '0.523307', '0.456903', '0.409431',
    '0.337187', '1.130205', '1.130426', '1.129848'];

  const pad = n => String(n).padStart(2, '0');

  function pickWorldline(kind) {
    if (kind === 'fixed') return HOME;
    if (kind === 'random') {
      const v = Math.floor(Math.random() * 1e6);
      return (Math.random() < 0.5 ? '0.' : '1.') + String(v).padStart(6, '0');
    }
    return Math.random() < 0.7 ? HOME : CANON[Math.floor(Math.random() * CANON.length)];
  }

  function formatTime(d, hour12) {
    let h = d.getHours();
    if (hour12) h = h % 12 || 12;
    return `${pad(h)}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  }

  function formatDate(d) {
    return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}.${pad(d.getFullYear() % 100)}`;
  }

  class Controller {
    constructor(meter, clock) {
      this.meter = meter;
      this.clock = clock;
      this.worldline = HOME;
      this.interludeUntil = -1;
      this.inInterlude = false;
      this.hourKey = null;
      this.mode = Config.get('mode');
      this.onShift = null;
    }

    text(t) {
      const d = this.clock();
      if (this.mode === 'divergence') return this.worldline;
      if (this.mode === 'date') return formatDate(d);
      if (t < this.interludeUntil) return this.worldline;
      return formatTime(d, Config.get('hour12'));
    }

    shift(t, { newWorldline = true } = {}) {
      if (newWorldline) this.worldline = pickWorldline(Config.get('worldlines'));
      if (this.mode === 'time') this.interludeUntil = t + Config.get('hold');
      this.meter.startShift(t);
      this.onShift?.(t);
    }

    setMode(m, t) {
      if (m === this.mode) return;
      this.mode = m;
      this.interludeUntil = -1;
      this.meter.startShift(t);
      this.onShift?.(t);
    }

    boot(t) {
      this.hourKey = this.key();
      this.meter.target = this.text(t);
      this.meter.startShift(t);
      this.onShift?.(t);
    }

    key() {
      const d = this.clock();
      return d.getFullYear() * 1e6 + d.getMonth() * 1e4 + d.getDate() * 100 + d.getHours();
    }

    tick(t) {
      const k = this.key();
      if (k !== this.hourKey) {
        this.hourKey = k;
        if (Config.get('hourlyShift')) this.shift(t);
      }
      const inside = this.mode === 'time' && t < this.interludeUntil;
      if (this.inInterlude && !inside) { this.meter.startShift(t); this.onShift?.(t); }
      this.inInterlude = inside;
      this.meter.target = this.text(t);
    }
  }

  return { Controller, HOME, CANON, formatTime, formatDate };
})();
