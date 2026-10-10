import { Game } from '../src/game/rules';
import { Snake } from '../src/game/snake';
import type { Direction, Point, WallMode } from '../src/game/types';

/** Small seeded PRNG (mulberry32) so tests are deterministic. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Setup {
  cols?: number;
  rows?: number;
  wallMode?: WallMode;
  body?: Point[];
  direction?: Direction;
  food?: Point | null;
  goldenChance?: number;
  random?: () => number;
}

/** A game in the playing state with an explicit snake and food position. */
export function makeGame(setup: Setup = {}): Game {
  const game = new Game({
    cols: setup.cols ?? 20,
    rows: setup.rows ?? 20,
    wallMode: setup.wallMode ?? 'classic',
    random: setup.random ?? seeded(1),
    goldenChance: setup.goldenChance ?? 0,
  });
  if (setup.body) game.snake = new Snake(setup.body, setup.direction ?? 'right');
  else if (setup.direction) game.snake.direction = setup.direction;
  // Park food somewhere harmless unless the test places it.
  game.food = setup.food === undefined ? { x: 0, y: 0 } : setup.food;
  game.start();
  return game;
}

export const pt = (x: number, y: number): Point => ({ x, y });
