/**
 * requestAnimationFrame-driven playback clock.
 *
 * Replaces the old 1s setTimeout chain: immune to timer drift/throttling and
 * provides fractional elapsed time so the track-map car can move at frame
 * rate while React state (and everything subscribed to the store) still
 * updates only once per simulated second.
 */

type FrameListener = () => void;

class PlaybackClock {
  private rafId = 0;
  private lastTs = 0;
  private elapsed = 0;
  private cap = 0;
  private speed = 1;
  private _running = false;
  private listeners = new Set<FrameListener>();

  /** Called whenever a whole simulated second is crossed. */
  onSecond: ((sec: number) => void) | null = null;
  /** Called once when the lap cap is reached. */
  onComplete: (() => void) | null = null;

  get running(): boolean {
    return this._running;
  }

  configure(opts: { cap: number; speed: number }): void {
    this.cap = Math.max(0, opts.cap);
    this.speed = Math.max(0.1, opts.speed);
  }

  seek(seconds: number): void {
    this.elapsed = Math.max(0, seconds);
  }

  getElapsed = (): number => this.elapsed;

  subscribe = (fn: FrameListener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  play(): void {
    if (this._running) return;
    this._running = true;
    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this._running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private tick = (ts: number): void => {
    if (!this._running) return;
    const dtReal = Math.min(0.25, (ts - this.lastTs) / 1000);
    this.lastTs = ts;

    const prevWhole = Math.floor(this.elapsed);
    this.elapsed += dtReal * this.speed;

    if (this.cap > 0 && this.elapsed >= this.cap) {
      this.elapsed = this.cap;
      this._running = false;
      this.notify();
      this.onSecond?.(this.cap);
      this.onComplete?.();
      return;
    }

    const newWhole = Math.floor(this.elapsed);
    this.notify();
    if (newWhole !== prevWhole) this.onSecond?.(newWhole);

    this.rafId = requestAnimationFrame(this.tick);
  };

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}

export const playbackClock = new PlaybackClock();
