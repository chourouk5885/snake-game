import type { Point } from '../game/types';
import type { RGBA } from './theme';

/**
 * Short-lived visual feedback drawn on (or applied to) the board: particles,
 * screen shake, the head squash, the level-up flash and the game-over fade.
 * Times are performance.now() milliseconds. When `enabled` is false
 * (Animations setting off or prefers-reduced-motion) nothing moves.
 */

export interface Particle {
  x: number; // cell units
  y: number;
  vx: number; // cells per second
  vy: number;
  life: number; // ms remaining
  maxLife: number;
  size: number; // fraction of a cell
  color: RGBA;
}

export const SHAKE_MS = 250;
export const SHAKE_PX = 7;
const SQUASH_MS = 160;
const FLASH_MS = 450;
const FADE_PER_SEGMENT_MS = 180;

export class Effects {
  enabled = true;
  particles: Particle[] = [];

  private shakeStart = -Infinity;
  private squashStart = -Infinity;
  private flashStart = -Infinity;
  private deathStart: number | null = null;
  private deathStagger = 0;

  constructor(private readonly random: () => number = Math.random) {}

  reset(): void {
    this.particles = [];
    this.shakeStart = -Infinity;
    this.squashStart = -Infinity;
    this.flashStart = -Infinity;
    this.deathStart = null;
  }

  /** A burst of particles from the centre of `cell`. */
  burst(cell: Point, color: RGBA, count = 14, speed = 4.5): void {
    if (!this.enabled) return;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + this.random() * 0.6;
      const v = speed * (0.45 + this.random() * 0.75);
      const life = 320 + this.random() * 260;
      this.particles.push({
        x: cell.x + 0.5,
        y: cell.y + 0.5,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life,
        maxLife: life,
        size: 0.09 + this.random() * 0.08,
        color,
      });
    }
  }

  shake(now: number): void {
    if (this.enabled) this.shakeStart = now;
  }

  squash(now: number): void {
    if (this.enabled) this.squashStart = now;
  }

  flash(now: number): void {
    // The flash is a colour change, not motion, so it plays even with animations off (briefly).
    this.flashStart = now;
  }

  /**
   * Start fading the snake to grey from the head. Returns how long the whole
   * fade takes, so the game-over overlay can wait for it.
   */
  startDeath(now: number, length: number): number {
    this.deathStart = now;
    if (!this.enabled) {
      this.deathStagger = 0;
      return 0;
    }
    this.deathStagger = Math.min(40, 520 / Math.max(1, length));
    return this.deathStagger * length + FADE_PER_SEGMENT_MS;
  }

  update(dtMs: number): void {
    if (this.particles.length === 0) return;
    const dt = dtMs / 1000;
    const drag = Math.pow(0.04, dt);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.life -= dtMs;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  /** Pixel offset for the board while shaking. */
  shakeOffset(now: number): { x: number; y: number } {
    const t = (now - this.shakeStart) / SHAKE_MS;
    if (!this.enabled || t < 0 || t >= 1) return { x: 0, y: 0 };
    const falloff = 1 - t;
    const k = SHAKE_PX * falloff;
    return {
      x: Math.sin(now * 0.11) * k,
      y: Math.cos(now * 0.137) * k * 0.7,
    };
  }

  /** 0 → 1 → 0 over a short time after eating. */
  squashAmount(now: number): number {
    const t = (now - this.squashStart) / SQUASH_MS;
    if (!this.enabled || t < 0 || t >= 1) return 0;
    return Math.sin(t * Math.PI);
  }

  /** Strength of the level-up flash, 0–1. */
  flashAmount(now: number): number {
    const duration = this.enabled ? FLASH_MS : FLASH_MS * 0.6;
    const t = (now - this.flashStart) / duration;
    if (t < 0 || t >= 1) return 0;
    // Two quick pulses.
    return Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t);
  }

  /** How grey the body is `index` cells from the head (fractions allowed) during the game-over fade, 0–1. */
  deathFade(index: number, now: number): number {
    if (this.deathStart === null) return 0;
    if (this.deathStagger === 0) return 1;
    const t = (now - this.deathStart - index * this.deathStagger) / FADE_PER_SEGMENT_MS;
    return Math.min(1, Math.max(0, t));
  }

  get dead(): boolean {
    return this.deathStart !== null;
  }
}
