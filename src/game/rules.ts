import { InputBuffer } from './input-buffer';
import { Snake, samePoint } from './snake';
import type {
  Direction,
  GameEvent,
  GameOptions,
  GameStatus,
  GoldenFruit,
  Point,
  RandomFn,
  WallMode,
} from './types';

/** Moves per second at level 1. */
export const BASE_SPEED = 7;
/** Extra moves per second gained at each level. */
export const SPEED_STEP = 1;
/** Speed never goes above this many moves per second. */
export const MAX_SPEED = 16;
/** Foods needed to reach the next level. */
export const FOODS_PER_LEVEL = 5;
/** Points for one food at level 1. Multiplied by the current level. */
export const POINTS_PER_FOOD = 10;
/** Golden fruit is worth this many normal foods. */
export const GOLDEN_MULTIPLIER = 5;
export const DEFAULT_GOLDEN_CHANCE = 0.15;
export const DEFAULT_GOLDEN_DURATION_MS = 6000;

export function levelForFoods(foodsEaten: number): number {
  return 1 + Math.floor(foodsEaten / FOODS_PER_LEVEL);
}

export function speedForLevel(level: number): number {
  return Math.min(MAX_SPEED, BASE_SPEED + (level - 1) * SPEED_STEP);
}

export function pointsFor(level: number, golden: boolean): number {
  return POINTS_PER_FOOD * level * (golden ? GOLDEN_MULTIPLIER : 1);
}

/**
 * The complete rules of the game. Call `tick()` once per logic step; it
 * returns what happened so the UI can react (sounds, particles, banners).
 */
export class Game {
  readonly cols: number;
  readonly rows: number;
  readonly wallMode: WallMode;
  readonly goldenChance: number;
  readonly goldenDurationMs: number;
  private readonly random: RandomFn;
  readonly input = new InputBuffer(2);

  snake: Snake;
  food: Point | null = null;
  golden: GoldenFruit | null = null;
  status: GameStatus = 'ready';
  score = 0;
  foodsEaten = 0;
  ticks = 0;

  constructor(options: GameOptions) {
    if (options.cols < 4 || options.rows < 4) throw new Error('Board must be at least 4×4');
    this.cols = options.cols;
    this.rows = options.rows;
    this.wallMode = options.wallMode;
    this.random = options.random ?? Math.random;
    this.goldenChance = options.goldenChance ?? DEFAULT_GOLDEN_CHANCE;
    this.goldenDurationMs = options.goldenDurationMs ?? DEFAULT_GOLDEN_DURATION_MS;
    this.snake = Snake.createCentered(this.cols, this.rows);
    this.food = this.randomFreeCell();
  }

  get level(): number {
    return levelForFoods(this.foodsEaten);
  }

  /** Current moves per second. */
  get speed(): number {
    return speedForLevel(this.level);
  }

  /** Milliseconds between logic ticks at the current speed. */
  get stepMs(): number {
    return 1000 / this.speed;
  }

  /** Foods eaten towards the next level, 0 to FOODS_PER_LEVEL - 1. */
  get levelProgress(): number {
    return this.foodsEaten % FOODS_PER_LEVEL;
  }

  get cellCount(): number {
    return this.cols * this.rows;
  }

  get isFinished(): boolean {
    return this.status === 'over' || this.status === 'won';
  }

  /** Begin moving. Does nothing unless the game is waiting to start. */
  start(): boolean {
    if (this.status !== 'ready') return false;
    this.status = 'playing';
    return true;
  }

  /**
   * Handle a direction key. The first press starts the game. Turns are queued
   * and applied one per tick. Returns true if the turn was queued.
   */
  steer(direction: Direction): boolean {
    if (this.isFinished) return false;
    this.start();
    return this.input.push(direction, this.snake.direction);
  }

  /** Advance the game by one step. */
  tick(): GameEvent[] {
    if (this.status !== 'playing') return [];
    const events: GameEvent[] = [];
    const levelBefore = this.level;
    const stepMs = this.stepMs;
    this.ticks++;

    const turn = this.input.shift();
    if (turn) this.snake.turn(turn);

    let next = this.snake.nextHead();
    if (!this.inBounds(next)) {
      if (this.wallMode === 'classic') {
        return this.end(events, 'wall');
      }
      next = this.wrap(next);
    }

    const eatsFood = this.food !== null && samePoint(this.food, next);
    const eatsGolden = this.golden !== null && samePoint(this.golden.pos, next);
    const grows = eatsFood || eatsGolden;

    // The tail leaves its cell this tick unless the snake grows, so moving into it is safe.
    if (this.snake.occupies(next, !grows)) {
      return this.end(events, 'self');
    }

    this.snake.moveTo(next, grows);

    if (grows) {
      const points = pointsFor(levelBefore, eatsGolden);
      this.score += points;
      this.foodsEaten++;
      events.push({ type: 'eat', pos: { ...next }, points, golden: eatsGolden });
      if (this.level > levelBefore) events.push({ type: 'levelUp', level: this.level });
    }
    if (eatsGolden) this.golden = null;

    if (this.snake.length >= this.cellCount) {
      this.status = 'won';
      this.food = null;
      this.golden = null;
      this.snake.settle();
      events.push({ type: 'win' });
      return events;
    }

    if (eatsFood) {
      this.food = this.randomFreeCell();
      if (!this.golden && this.random() < this.goldenChance) {
        const pos = this.randomFreeCell();
        if (pos) {
          this.golden = { pos, remainingMs: this.goldenDurationMs, durationMs: this.goldenDurationMs };
          events.push({ type: 'goldenSpawn', pos: { ...pos } });
        }
      }
    }

    if (this.golden && !eatsGolden) {
      this.golden.remainingMs -= stepMs;
      if (this.golden.remainingMs <= 0) {
        events.push({ type: 'goldenExpire', pos: { ...this.golden.pos } });
        this.golden = null;
      }
    }

    // If the last free cell was taken by a golden fruit that just expired, place food there.
    if (!this.food) this.food = this.randomFreeCell();

    return events;
  }

  inBounds(p: Point): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.cols && p.y < this.rows;
  }

  private wrap(p: Point): Point {
    return {
      x: ((p.x % this.cols) + this.cols) % this.cols,
      y: ((p.y % this.rows) + this.rows) % this.rows,
    };
  }

  private end(events: GameEvent[], reason: 'wall' | 'self'): GameEvent[] {
    this.status = 'over';
    this.input.clear();
    this.snake.settle();
    events.push({ type: 'gameOver', reason });
    return events;
  }

  /** Every cell not covered by the snake or another fruit, in row order. */
  freeCells(): Point[] {
    const taken = new Uint8Array(this.cellCount);
    for (const p of this.snake.body) taken[p.y * this.cols + p.x] = 1;
    if (this.food) taken[this.food.y * this.cols + this.food.x] = 1;
    if (this.golden) taken[this.golden.pos.y * this.cols + this.golden.pos.x] = 1;
    const free: Point[] = [];
    for (let i = 0; i < taken.length; i++) {
      if (!taken[i]) free.push({ x: i % this.cols, y: Math.floor(i / this.cols) });
    }
    return free;
  }

  /** A random free cell, or null when the board is full. Never lands on the snake. */
  randomFreeCell(): Point | null {
    const free = this.freeCells();
    if (free.length === 0) return null;
    const r = this.random();
    const index = Math.min(free.length - 1, Math.max(0, Math.floor(r * free.length)));
    return free[index];
  }
}
