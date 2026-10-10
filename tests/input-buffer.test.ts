import { describe, expect, it } from 'vitest';
import { InputBuffer } from '../src/game/input-buffer';
import { makeGame, pt } from './helpers';

describe('InputBuffer', () => {
  it('applies two quick turns pressed within one tick on consecutive ticks', () => {
    const game = makeGame({ body: [pt(10, 10), pt(9, 10), pt(8, 10)], direction: 'right' });
    // Both presses land before the next tick.
    expect(game.steer('up')).toBe(true);
    expect(game.steer('left')).toBe(true);

    game.tick();
    expect(game.snake.direction).toBe('up');
    expect(game.snake.head).toEqual(pt(10, 9));

    game.tick();
    expect(game.snake.direction).toBe('left');
    expect(game.snake.head).toEqual(pt(9, 9));
    expect(game.status).toBe('playing');
  });

  it('drops a third turn when two are already queued', () => {
    const buffer = new InputBuffer(2);
    expect(buffer.push('up', 'right')).toBe(true);
    expect(buffer.push('left', 'right')).toBe(true);
    expect(buffer.push('down', 'right')).toBe(false);
    expect(buffer.peekAll()).toEqual(['up', 'left']);
  });

  it('ignores a turn that would reverse the snake', () => {
    const buffer = new InputBuffer();
    expect(buffer.push('left', 'right')).toBe(false);
    expect(buffer.size).toBe(0);
  });

  it('ignores a turn that reverses the previously queued turn', () => {
    const buffer = new InputBuffer();
    expect(buffer.push('up', 'right')).toBe(true);
    expect(buffer.push('down', 'right')).toBe(false);
    expect(buffer.peekAll()).toEqual(['up']);
  });

  it('ignores a turn that repeats the current direction', () => {
    const buffer = new InputBuffer();
    expect(buffer.push('right', 'right')).toBe(false);
    expect(buffer.size).toBe(0);
  });

  it('ignores a turn that repeats the last queued turn', () => {
    const buffer = new InputBuffer();
    expect(buffer.push('up', 'right')).toBe(true);
    expect(buffer.push('up', 'right')).toBe(false);
    expect(buffer.size).toBe(1);
  });

  it('a quick up-then-down never makes the snake reverse into itself', () => {
    const game = makeGame({ body: [pt(10, 10), pt(9, 10), pt(8, 10)], direction: 'right' });
    game.steer('up');
    game.steer('down');
    game.tick();
    game.tick();
    expect(game.status).toBe('playing');
    expect(game.snake.head).toEqual(pt(10, 8));
  });

  it('hands out turns oldest first and empties', () => {
    const buffer = new InputBuffer();
    buffer.push('down', 'left');
    buffer.push('right', 'left');
    expect(buffer.shift()).toBe('down');
    expect(buffer.shift()).toBe('right');
    expect(buffer.shift()).toBeUndefined();
  });
});
