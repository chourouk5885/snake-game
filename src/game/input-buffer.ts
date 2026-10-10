import { isOpposite } from './snake';
import type { Direction } from './types';

/**
 * Queues turns so that quick sequences such as "up then left" pressed within a
 * single tick are applied on consecutive ticks instead of the second one being
 * lost or the first being overwritten.
 *
 * Each queued turn is validated against the turn before it (or the snake's
 * current direction when the queue is empty): repeats and reversals are dropped.
 */
export class InputBuffer {
  private queue: Direction[] = [];

  constructor(readonly capacity = 2) {}

  /** Try to queue a turn. Returns true if it was accepted. */
  push(direction: Direction, current: Direction): boolean {
    const last = this.queue.length > 0 ? this.queue[this.queue.length - 1] : current;
    if (direction === last) return false;
    if (isOpposite(direction, last)) return false;
    if (this.queue.length >= this.capacity) return false;
    this.queue.push(direction);
    return true;
  }

  /** Take the next turn to apply on this tick, if any. */
  shift(): Direction | undefined {
    return this.queue.shift();
  }

  clear(): void {
    this.queue.length = 0;
  }

  get size(): number {
    return this.queue.length;
  }

  /** A copy of the queued turns, oldest first. */
  peekAll(): Direction[] {
    return [...this.queue];
  }
}
