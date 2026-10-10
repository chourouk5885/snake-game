/** Pure data types shared by the game logic. Nothing in src/game touches the DOM. */

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

export type WallMode = 'classic' | 'wrap';

export type BoardSize = 'small' | 'medium' | 'large';

/** Cells per side for each board size. */
export const BOARD_CELLS: Record<BoardSize, number> = {
  small: 15,
  medium: 20,
  large: 25,
};

/** A function returning a float in [0, 1), like Math.random. Injected so tests are deterministic. */
export type RandomFn = () => number;

/** ready: waiting for the first key press. playing: ticking. over: lost. won: filled the board. */
export type GameStatus = 'ready' | 'playing' | 'over' | 'won';

export interface GoldenFruit {
  pos: Point;
  /** Milliseconds of game time left before it disappears. */
  remainingMs: number;
  /** Total lifetime in milliseconds, used to draw the shrinking ring. */
  durationMs: number;
}

export type GameOverReason = 'wall' | 'self';

export type GameEvent =
  | { type: 'eat'; pos: Point; points: number; golden: boolean }
  | { type: 'levelUp'; level: number }
  | { type: 'goldenSpawn'; pos: Point }
  | { type: 'goldenExpire'; pos: Point }
  | { type: 'gameOver'; reason: GameOverReason }
  | { type: 'win' };

export interface GameOptions {
  cols: number;
  rows: number;
  wallMode: WallMode;
  /** Defaults to Math.random. */
  random?: RandomFn;
  /** Chance (0–1) that a golden fruit appears after eating normal food. */
  goldenChance?: number;
  /** Lifetime of a golden fruit in milliseconds of game time. */
  goldenDurationMs?: number;
}
