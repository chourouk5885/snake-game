import { describe, expect, it } from 'vitest';
import {
  BASE_SPEED,
  FOODS_PER_LEVEL,
  GOLDEN_MULTIPLIER,
  MAX_SPEED,
  POINTS_PER_FOOD,
  levelForFoods,
  speedForLevel,
} from '../src/game/rules';
import { DIRECTION_VECTORS, samePoint } from '../src/game/snake';
import type { Point } from '../src/game/types';
import { makeGame, pt, seeded } from './helpers';

/** Cells of a cols×rows board in boustrophedon (serpentine) order, so consecutive cells touch. */
function serpentine(cols: number, rows: number): Point[] {
  const cells: Point[] = [];
  for (let y = 0; y < rows; y++) {
    for (let i = 0; i < cols; i++) cells.push(pt(y % 2 === 0 ? i : cols - 1 - i, y));
  }
  return cells;
}

describe('eating', () => {
  it('grows the snake by exactly one cell and adds 10 points at level 1', () => {
    const game = makeGame({ body: [pt(5, 5), pt(4, 5), pt(3, 5)], direction: 'right', food: pt(6, 5) });
    const events = game.tick();
    expect(game.snake.length).toBe(4);
    expect(game.snake.body).toEqual([pt(6, 5), pt(5, 5), pt(4, 5), pt(3, 5)]);
    expect(game.score).toBe(10);
    expect(events).toContainEqual({ type: 'eat', pos: pt(6, 5), points: 10, golden: false });
  });

  it('multiplies points by the current level', () => {
    const game = makeGame({ body: [pt(5, 5), pt(4, 5), pt(3, 5)], direction: 'right', food: pt(6, 5) });
    game.foodsEaten = 2 * FOODS_PER_LEVEL; // level 3
    expect(game.level).toBe(3);
    game.tick();
    expect(game.score).toBe(POINTS_PER_FOOD * 3);
    expect(game.snake.length).toBe(4);
  });

  it('places new food on a free cell after eating', () => {
    const game = makeGame({ body: [pt(5, 5), pt(4, 5), pt(3, 5)], direction: 'right', food: pt(6, 5) });
    game.tick();
    expect(game.food).not.toBeNull();
    expect(game.snake.occupies(game.food!)).toBe(false);
  });

  it('does not grow when not eating', () => {
    const game = makeGame({ body: [pt(5, 5), pt(4, 5), pt(3, 5)], direction: 'right', food: pt(0, 0) });
    for (let i = 0; i < 4; i++) game.tick();
    expect(game.snake.length).toBe(3);
    expect(game.score).toBe(0);
  });
});

describe('food placement', () => {
  it('never spawns food on the snake, even when the board is almost full', () => {
    const cells = serpentine(20, 20);
    const body = cells.slice(0, 390).reverse(); // 390 of 400 cells covered
    for (let seed = 1; seed <= 300; seed++) {
      const game = makeGame({ body, direction: 'left', random: seeded(seed), food: null });
      expect(game.freeCells()).toHaveLength(10);
      const food = game.randomFreeCell();
      expect(food).not.toBeNull();
      expect(game.snake.occupies(food!)).toBe(false);
    }
  });

  it('handles random() returning values at the edges of its range', () => {
    const body = serpentine(10, 10).slice(0, 95).reverse();
    for (const r of [0, 0.5, 0.999999999]) {
      const game = makeGame({ cols: 10, rows: 10, body, direction: 'left', random: () => r, food: null });
      const food = game.randomFreeCell()!;
      expect(game.snake.occupies(food)).toBe(false);
    }
  });

  it('never spawns food on the snake while the snake grows across the board', () => {
    // Wrap mode on 10×10: go right along a row, step down, repeat. Every cell is visited once,
    // so the snake can eat on every tick and grow to fill most of the board.
    const game = makeGame({ cols: 10, rows: 10, wallMode: 'wrap', body: [pt(0, 0)], direction: 'right', random: seeded(7) });
    for (let t = 1; t <= 90; t++) {
      const dir = t % 10 === 0 ? 'down' : 'right';
      game.steer(dir);
      // Put the food exactly where the head is about to go, so every tick is a meal.
      const v = DIRECTION_VECTORS[dir];
      game.food = pt((game.snake.head.x + v.x + 10) % 10, (game.snake.head.y + v.y + 10) % 10);
      game.tick();
      expect(game.status).toBe('playing');
      expect(game.snake.length).toBe(1 + t);
      if (game.food) expect(game.snake.occupies(game.food)).toBe(false);
    }
  });
});

describe('collisions', () => {
  it('ends the game when the head hits the body', () => {
    // A U shape: moving down from (5,5) runs into (5,6), which is not the tail.
    const body = [pt(5, 5), pt(6, 5), pt(6, 6), pt(5, 6), pt(4, 6), pt(3, 6)];
    const game = makeGame({ body, direction: 'left' });
    game.steer('down');
    const events = game.tick();
    expect(game.status).toBe('over');
    expect(events).toContainEqual({ type: 'gameOver', reason: 'self' });
    expect(game.snake.head).toEqual(pt(5, 5));
  });

  it('allows moving into the cell the tail is leaving this tick', () => {
    // A 2×2 loop: the head chases the tail around.
    const body = [pt(5, 5), pt(6, 5), pt(6, 6), pt(5, 6)];
    const game = makeGame({ body, direction: 'left' });
    game.steer('down');
    const events = game.tick();
    expect(game.status).toBe('playing');
    expect(events).toEqual([]);
    expect(game.snake.body).toEqual([pt(5, 6), pt(5, 5), pt(6, 5), pt(6, 6)]);

    // And it can keep circling forever.
    for (const dir of ['right', 'up', 'left', 'down', 'right'] as const) {
      game.steer(dir);
      game.tick();
      expect(game.status).toBe('playing');
    }
  });

  it('treats the tail cell as blocked only when the tail is not moving away', () => {
    const body = [pt(5, 5), pt(6, 5), pt(6, 6), pt(5, 6)];
    const game = makeGame({ body, direction: 'left' });
    expect(game.snake.occupies(pt(5, 6), true)).toBe(false);
    expect(game.snake.occupies(pt(5, 6), false)).toBe(true);
    expect(game.snake.occupies(pt(6, 6), true)).toBe(true);
  });
});

describe('walls', () => {
  it('classic mode: hitting a wall ends the game', () => {
    const game = makeGame({ body: [pt(19, 4), pt(18, 4), pt(17, 4)], direction: 'right', wallMode: 'classic' });
    const events = game.tick();
    expect(game.status).toBe('over');
    expect(events).toContainEqual({ type: 'gameOver', reason: 'wall' });
  });

  it('classic mode: every wall is deadly', () => {
    const starts = [
      { body: [pt(0, 4)], direction: 'left' as const },
      { body: [pt(4, 0)], direction: 'up' as const },
      { body: [pt(4, 19)], direction: 'down' as const },
    ];
    for (const s of starts) {
      const game = makeGame({ ...s, wallMode: 'classic' });
      game.tick();
      expect(game.status).toBe('over');
    }
  });

  it('wrap mode: the snake comes out on the opposite side', () => {
    const right = makeGame({ body: [pt(19, 4), pt(18, 4), pt(17, 4)], direction: 'right', wallMode: 'wrap' });
    right.tick();
    expect(right.status).toBe('playing');
    expect(right.snake.head).toEqual(pt(0, 4));

    const up = makeGame({ body: [pt(7, 0), pt(7, 1), pt(7, 2)], direction: 'up', wallMode: 'wrap', food: pt(0, 0) });
    up.tick();
    expect(up.snake.head).toEqual(pt(7, 19));

    const left = makeGame({ body: [pt(0, 3)], direction: 'left', wallMode: 'wrap' });
    left.tick();
    expect(left.snake.head).toEqual(pt(19, 3));

    const down = makeGame({ body: [pt(3, 19)], direction: 'down', wallMode: 'wrap', food: pt(1, 1) });
    down.tick();
    expect(down.snake.head).toEqual(pt(3, 0));
  });
});

describe('speed and levels', () => {
  it('starts at the base speed', () => {
    const game = makeGame();
    expect(game.level).toBe(1);
    expect(game.speed).toBe(BASE_SPEED);
  });

  it('speeds up every 5 foods and announces the new level', () => {
    const game = makeGame({ body: [pt(2, 10), pt(1, 10), pt(0, 10)], direction: 'right', wallMode: 'wrap' });
    const speeds: number[] = [];
    for (let i = 1; i <= 10; i++) {
      game.food = game.snake.nextHead();
      const events = game.tick();
      speeds.push(game.speed);
      const levelUp = events.find((e) => e.type === 'levelUp');
      if (i % FOODS_PER_LEVEL === 0) expect(levelUp).toEqual({ type: 'levelUp', level: 1 + i / FOODS_PER_LEVEL });
      else expect(levelUp).toBeUndefined();
    }
    expect(speeds).toEqual([7, 7, 7, 7, 8, 8, 8, 8, 8, 9]);
  });

  it('never exceeds the speed cap', () => {
    let previous = 0;
    for (let foods = 0; foods <= 500; foods++) {
      const speed = speedForLevel(levelForFoods(foods));
      expect(speed).toBeLessThanOrEqual(MAX_SPEED);
      expect(speed).toBeGreaterThanOrEqual(previous);
      if (foods % FOODS_PER_LEVEL !== 0) expect(speed).toBe(previous);
      previous = speed;
    }
    expect(speedForLevel(1000)).toBe(MAX_SPEED);
    const game = makeGame();
    game.foodsEaten = 10_000;
    expect(game.speed).toBe(MAX_SPEED);
    expect(game.stepMs).toBeCloseTo(1000 / MAX_SPEED);
  });
});

describe('golden fruit', () => {
  it('can appear after eating, never on the snake or the food', () => {
    const game = makeGame({ body: [pt(5, 5), pt(4, 5), pt(3, 5)], direction: 'right', food: pt(6, 5), goldenChance: 1 });
    const events = game.tick();
    expect(game.golden).not.toBeNull();
    expect(events.some((e) => e.type === 'goldenSpawn')).toBe(true);
    expect(game.snake.occupies(game.golden!.pos)).toBe(false);
    expect(samePoint(game.golden!.pos, game.food!)).toBe(false);
  });

  it(`is worth ${GOLDEN_MULTIPLIER}× points and grows the snake`, () => {
    const game = makeGame({ body: [pt(5, 5), pt(4, 5), pt(3, 5)], direction: 'right', food: pt(0, 0) });
    game.golden = { pos: pt(6, 5), remainingMs: 6000, durationMs: 6000 };
    const events = game.tick();
    expect(game.score).toBe(POINTS_PER_FOOD * GOLDEN_MULTIPLIER);
    expect(game.snake.length).toBe(4);
    expect(game.golden).toBeNull();
    expect(events).toContainEqual({ type: 'eat', pos: pt(6, 5), points: 50, golden: true });
  });

  it('disappears after about six seconds of play', () => {
    const game = makeGame({ body: [pt(2, 10), pt(1, 10), pt(0, 10)], direction: 'right', wallMode: 'wrap', food: pt(0, 0) });
    game.golden = { pos: pt(5, 2), remainingMs: 6000, durationMs: 6000 };
    let expiredAfterMs = 0;
    for (let i = 0; i < 100; i++) {
      const step = game.stepMs;
      const events = game.tick();
      expiredAfterMs += step;
      if (events.some((e) => e.type === 'goldenExpire')) break;
    }
    expect(game.golden).toBeNull();
    expect(expiredAfterMs).toBeGreaterThanOrEqual(6000);
    expect(expiredAfterMs).toBeLessThan(6000 + game.stepMs + 1);
  });
});

describe('winning', () => {
  it('filling the whole board is a win', () => {
    const cells = serpentine(4, 4);
    const body = cells.slice(0, 15).reverse(); // head at (1,3), heading left
    const game = makeGame({ cols: 4, rows: 4, body, direction: 'left', food: cells[15] });
    const events = game.tick();
    expect(game.snake.length).toBe(16);
    expect(game.status).toBe('won');
    expect(events).toContainEqual({ type: 'win' });
    expect(game.food).toBeNull();
    expect(game.tick()).toEqual([]);
  });

  it('ignores input after the game is finished', () => {
    const game = makeGame({ body: [pt(19, 4), pt(18, 4), pt(17, 4)], direction: 'right' });
    game.tick();
    expect(game.status).toBe('over');
    expect(game.steer('up')).toBe(false);
    expect(game.tick()).toEqual([]);
  });
});
