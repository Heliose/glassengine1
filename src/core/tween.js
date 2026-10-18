/* Tiny tween scheduler driven by the render loop (project1 pattern, plus promise helpers). */

const active = new Set();

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutQuint = (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2);
export const easeOutBack = (t) => {
  const c1 = 1.4, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const linear = (t) => t;

export function tween({ duration = 600, delay = 0, ease = easeOutCubic, onUpdate, onDone }) {
  const t = {
    start: performance.now() + delay,
    duration,
    ease,
    onUpdate,
    onDone,
    stop() {
      active.delete(this);
    },
  };
  active.add(t);
  return t;
}

/** Promise version, for scripted sequences (intro, tours). */
export const tweenP = (opts) => new Promise((resolve) => tween({ ...opts, onDone: () => (opts.onDone?.(), resolve()) }));
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const tweensActive = () => active.size > 0;

export function updateTweens(now) {
  for (const t of [...active]) {
    if (now < t.start) continue;
    const k = Math.min(1, (now - t.start) / t.duration);
    t.onUpdate?.(t.ease(k), k);
    if (k >= 1) {
      active.delete(t);
      t.onDone?.();
    }
  }
}
