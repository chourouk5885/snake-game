/**
 * Fixed-timestep game loop.
 *
 * Logic runs in fixed steps (`stepMs`, which can change as the game speeds up)
 * while rendering runs once per display frame. Leftover time that isn't a full
 * step is passed to the renderer as `alpha` (0–1) so it can draw the snake
 * part-way between its last two positions. That keeps movement smooth on any
 * refresh rate and keeps the rules independent of frame rate.
 */

export interface LoopHooks {
  /** Milliseconds per logic step right now. */
  stepMs(): number;
  /** Whether logic should advance (false while waiting to start, paused or finished). */
  isRunning(): boolean;
  /** Advance the game by one fixed step. */
  update(stepMs: number): void;
  /**
   * Draw a frame. `alpha` is how far we are between the previous and current
   * logic state; `frameMs` is the (clamped) real time since the last frame.
   */
  render(alpha: number, frameMs: number, now: number): void;
}

export interface LoopScheduler {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
}

const browserScheduler: LoopScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export class FixedStepLoop {
  /** Longest frame we accept. Bigger gaps (tab switch, debugger) are clamped so the snake never teleports. */
  maxFrameMs = 250;
  /** Safety valve: never run more than this many logic steps in one frame. */
  maxStepsPerFrame = 5;

  private accumulator = 0;
  private lastTime: number | null = null;
  private handle: number | null = null;

  constructor(
    private readonly hooks: LoopHooks,
    private readonly scheduler: LoopScheduler = browserScheduler,
  ) {}

  get running(): boolean {
    return this.handle !== null;
  }

  start(): void {
    if (this.handle !== null) return;
    this.lastTime = null;
    this.handle = this.scheduler.request(this.frame);
  }

  stop(): void {
    if (this.handle !== null) this.scheduler.cancel(this.handle);
    this.handle = null;
  }

  /** Forget partial progress, e.g. for a new game. */
  reset(): void {
    this.accumulator = 0;
  }

  /** Make the next frame run a logic step right away, so the first key press feels instant. */
  primeStep(): void {
    this.accumulator = Math.max(this.accumulator, this.hooks.stepMs());
  }

  /** Current interpolation factor (0–1). */
  get alpha(): number {
    const step = this.hooks.stepMs();
    return step > 0 ? Math.min(1, this.accumulator / step) : 1;
  }

  /** One frame. Public so tests can drive the loop with fake timestamps. */
  readonly frame = (now: number): void => {
    const frameMs = this.lastTime === null ? 0 : Math.min(this.maxFrameMs, Math.max(0, now - this.lastTime));
    this.lastTime = now;

    if (this.hooks.isRunning()) {
      this.accumulator += frameMs;
      let steps = 0;
      let step = this.hooks.stepMs();
      while (this.accumulator >= step && this.hooks.isRunning()) {
        this.accumulator -= step;
        this.hooks.update(step);
        step = this.hooks.stepMs();
        if (++steps >= this.maxStepsPerFrame) {
          this.accumulator = Math.min(this.accumulator, step * 0.999);
          break;
        }
      }
      // If the game just stopped (game over), don't keep a stale partial step.
      if (!this.hooks.isRunning()) this.accumulator = 0;
    }

    this.hooks.render(this.alpha, frameMs, now);
    if (this.handle !== null) this.handle = this.scheduler.request(this.frame);
  };
}
