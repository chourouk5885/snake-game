import type { Direction, Point } from './types';

export const DIRECTION_VECTORS: Readonly<Record<Direction, Point>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export function isOpposite(a: Direction, b: Direction): boolean {
  return OPPOSITE[a] === b;
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export const START_LENGTH = 3;

/**
 * The snake's body as a list of cells, head first.
 *
 * `previous` is the body as it was before the last move. The renderer
 * interpolates between `previous` and `body` so the snake glides between ticks.
 */
export class Snake {
  body: Point[];
  previous: Point[];
  direction: Direction;

  constructor(body: Point[], direction: Direction) {
    if (body.length === 0) throw new Error('A snake needs at least one segment');
    this.body = body.map((p) => ({ ...p }));
    this.previous = this.body.map((p) => ({ ...p }));
    this.direction = direction;
  }

  /** A 3-cell snake in the middle of the board, facing right. */
  static createCentered(cols: number, rows: number): Snake {
    const head = { x: Math.floor(cols / 2), y: Math.floor(rows / 2) };
    const body: Point[] = [];
    for (let i = 0; i < START_LENGTH; i++) body.push({ x: head.x - i, y: head.y });
    return new Snake(body, 'right');
  }

  get head(): Point {
    return this.body[0];
  }

  get tail(): Point {
    return this.body[this.body.length - 1];
  }

  get length(): number {
    return this.body.length;
  }

  /**
   * Change direction. Turning straight back into the body is ignored.
   * Returns true if the direction changed.
   */
  turn(direction: Direction): boolean {
    if (direction === this.direction) return false;
    if (this.body.length > 1 && isOpposite(direction, this.direction)) return false;
    this.direction = direction;
    return true;
  }

  /** The cell the head moves into next, before any wall handling. */
  nextHead(): Point {
    const v = DIRECTION_VECTORS[this.direction];
    return { x: this.head.x + v.x, y: this.head.y + v.y };
  }

  /**
   * True if `p` is part of the body. With `tailMovesAway`, the last segment is
   * ignored because it leaves its cell during the same tick.
   */
  occupies(p: Point, tailMovesAway = false): boolean {
    const end = tailMovesAway ? this.body.length - 1 : this.body.length;
    for (let i = 0; i < end; i++) {
      if (samePoint(this.body[i], p)) return true;
    }
    return false;
  }

  /** Move the head to `newHead`. When `grow` is true the tail stays, so the snake is one longer. */
  moveTo(newHead: Point, grow: boolean): void {
    this.previous = this.body.map((p) => ({ ...p }));
    this.body.unshift({ ...newHead });
    if (!grow) this.body.pop();
  }

  /** Make the drawn position match the logical one (no glide), e.g. after a game ends. */
  settle(): void {
    this.previous = this.body.map((p) => ({ ...p }));
  }
}
