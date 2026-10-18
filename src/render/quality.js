/* Adaptive quality: measures real frame gaps only (ignores throttled tabs / hidden panes). */
export class FrameStats {
  constructor() {
    this.samples = [];
    this.fps = 60;
    this.last = 0;
    this.slowFrames = 0;
  }
  sample(now) {
    if (this.last) {
      const gap = now - this.last;
      if (gap < 250) {
        this.samples.push(gap);
        if (this.samples.length > 40) this.samples.shift();
        const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
        this.fps = 1000 / avg;
        this.ms = avg;
      }
    }
    this.last = now;
  }
  /** True when ~40 real frames averaged below `minFps`. */
  tooSlow(minFps = 30) {
    return this.samples.length >= 40 && this.fps < minFps;
  }
  reset() {
    this.samples.length = 0;
  }
}
