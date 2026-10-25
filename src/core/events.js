// HYPERNOVA — event bus. PM-owned foundation. No dependencies.
export const EVT = {
  PULSE: 'pulse',
  CRIT: 'crit',
  PERFECT: 'perfect',
  OVERDRIVE_START: 'overdrive_start',
  OVERDRIVE_END: 'overdrive_end',
  OVERDRIVE_TICK: 'overdrive_tick',
  BUY: 'buy',
  UPGRADE: 'upgrade',
  STAGE_UP: 'stage_up',
  COLLAPSE: 'collapse',
  ASCEND: 'ascend',
  ACHIEVEMENT: 'achievement',
  MILESTONE: 'milestone',
  LOG: 'log',
  ERROR: 'error',
};

export class EventBus {
  constructor() {
    this.map = new Map();
  }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) {
    const set = this.map.get(evt);
    if (set) set.delete(fn);
  }
  clear() {
    this.map.clear();
  }
  emit(evt, payload = {}) {
    const set = this.map.get(evt);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        if (evt !== EVT.ERROR) this.emit(EVT.ERROR, { evt, err: String(err && err.message ? err.message : err) });
      }
    }
  }
}
