import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/rules';
import { Snake } from '../src/game/snake';
import type { Direction } from '../src/game/types';
import { makeGame, pt, seeded } from './helpers';

describe('starting position', () => {
  it('starts 3 cells long in the middle, facing right, waiting for input', () => {
    const game = new Game({ cols: 20, rows: 20, wallMode: 'classic', random: seeded(3) });
    expect(game.snake.body).toEqual([pt(10, 10), pt(9, 10), pt(8, 10)]);
    expect(game.snake.direction).toBe('right');
    expect(game.status).toBe('ready');
  });

  it('does not move until the first key press', () => {
    const game = new Game({ cols: 20, rows: 20, wallMode: 'classic', random: seeded(3) });
    expect(game.tick()).toEqual([]);
    expect(game.snake.head).toEqual(pt(10, 10));
    game.steer('up');
    expect(game.status).toBe('playing');
    game.tick();
    expect(game.snake.head).toEqual(pt(10, 9));
  });
});

describe('movement', () => {
  const cases: Array<[Direction, { x: number; y: number }]> = [
    ['up', pt(10, 9)],
    ['down', pt(10, 11)],
    ['left', pt(9, 10)],
    ['right', pt(11, 10)],
  ];

  it.each(cases)('moves one cell %s per tick', (direction, expected) => {
    // A single-segment snake can face any direction.
    const game = makeGame({ body: [pt(10, 10)], direction });
    game.tick();
    expect(game.snake.head).toEqual(expected);
    expect(game.snake.length).toBe(1);
  });

  it('follows a steered turn in every direction', () => {
    const game = makeGame({ body: [pt(10, 10), pt(9, 10), pt(8, 10)], direction: 'right' });
    const path: Array<[Direction, { x: number; y: number }]> = [
      ['down', pt(10, 11)],
      ['left', pt(9, 11)],
      ['up', pt(9, 10)],
      ['right', pt(10, 10)],
    ];
    for (const [dir, expected] of path) {
      game.steer(dir);
      game.tick();
      expect(game.status).toBe('playing');
      expect(game.snake.head).toEqual(expected);
    }
  });

  it('keeps its length while moving and the body follows the head', () => {
    const game = makeGame({ body: [pt(5, 5), pt(4, 5), pt(3, 5)], direction: 'right' });
    game.tick();
    expect(game.snake.body).toEqual([pt(6, 5), pt(5, 5), pt(4, 5)]);
  });

  it('ignores pressing the opposite direction', () => {
    const game = makeGame({ body: [pt(5, 5), pt(4, 5), pt(3, 5)], direction: 'right' });
    expect(game.steer('left')).toBe(false);
    game.tick();
    expect(game.snake.head).toEqual(pt(6, 5));
    expect(game.status).toBe('playing');
  });

  it('Snake.turn rejects reversal and repeats', () => {
    const snake = new Snake([pt(5, 5), pt(5, 6)], 'up');
    expect(snake.turn('down')).toBe(false);
    expect(snake.turn('up')).toBe(false);
    expect(snake.turn('left')).toBe(true);
    expect(snake.direction).toBe('left');
  });
});
