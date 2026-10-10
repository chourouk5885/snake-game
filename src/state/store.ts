import type { BoardSize, WallMode } from '../game/types';

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemeChoice;
  size: BoardSize;
  wallMode: WallMode;
  sound: boolean;
  vibration: boolean;
  dpad: boolean;
  animations: boolean;
}

export interface Stats {
  gamesPlayed: number;
  foodEaten: number;
  longestSnake: number;
  timePlayedMs: number;
}

/** Best score per "wallMode:size", e.g. "classic:medium". */
export type BestScores = Record<string, number>;

export interface SaveData {
  version: 1;
  settings: Settings;
  best: BestScores;
  stats: Stats;
}

export interface GameRecord {
  score: number;
  length: number;
  foodEaten: number;
  durationMs: number;
  wallMode: WallMode;
  size: BoardSize;
}

/** The subset of the Web Storage API the store needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'snake.save.v1';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  theme: 'system',
  size: 'medium',
  wallMode: 'classic',
  sound: false,
  vibration: true,
  dpad: false,
  animations: true,
});

export const DEFAULT_STATS: Readonly<Stats> = Object.freeze({
  gamesPlayed: 0,
  foodEaten: 0,
  longestSnake: 0,
  timePlayedMs: 0,
});

const THEMES: readonly ThemeChoice[] = ['system', 'light', 'dark'];
const SIZES: readonly BoardSize[] = ['small', 'medium', 'large'];
const WALL_MODES: readonly WallMode[] = ['classic', 'wrap'];

export function bestKey(wallMode: WallMode, size: BoardSize): string {
  return `${wallMode}:${size}`;
}

export function defaultSaveData(): SaveData {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, best: {}, stats: { ...DEFAULT_STATS } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function count(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/**
 * Turn anything (parsed JSON, garbage, an older format) into valid SaveData.
 * Each field that is missing or invalid falls back to its default on its own,
 * so one bad value never wipes the rest.
 */
export function validate(raw: unknown): SaveData {
  const data = defaultSaveData();
  if (!isRecord(raw)) return data;

  const s = isRecord(raw.settings) ? raw.settings : {};
  data.settings = {
    theme: pick(s.theme, THEMES, DEFAULT_SETTINGS.theme),
    size: pick(s.size, SIZES, DEFAULT_SETTINGS.size),
    wallMode: pick(s.wallMode, WALL_MODES, DEFAULT_SETTINGS.wallMode),
    sound: bool(s.sound, DEFAULT_SETTINGS.sound),
    vibration: bool(s.vibration, DEFAULT_SETTINGS.vibration),
    dpad: bool(s.dpad, DEFAULT_SETTINGS.dpad),
    animations: bool(s.animations, DEFAULT_SETTINGS.animations),
  };

  if (isRecord(raw.best)) {
    for (const mode of WALL_MODES) {
      for (const size of SIZES) {
        const key = bestKey(mode, size);
        const value = count(raw.best[key], -1);
        if (value > 0) data.best[key] = value;
      }
    }
  }

  const st = isRecord(raw.stats) ? raw.stats : {};
  data.stats = {
    gamesPlayed: count(st.gamesPlayed),
    foodEaten: count(st.foodEaten),
    longestSnake: count(st.longestSnake),
    timePlayedMs: count(st.timePlayedMs),
  };
  return data;
}

/** localStorage if it exists and works, otherwise null (private mode, blocked cookies, …). */
export function browserStorage(): StorageLike | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = '__snake_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/**
 * Settings, best scores and lifetime stats. Every storage access is wrapped in
 * try/catch: if storage is blocked or full the game keeps working in memory.
 */
export class Store {
  data: SaveData;

  constructor(
    private readonly storage: StorageLike | null,
    private readonly key = STORAGE_KEY,
  ) {
    this.data = this.load();
  }

  get settings(): Settings {
    return this.data.settings;
  }

  get stats(): Stats {
    return this.data.stats;
  }

  load(): SaveData {
    if (!this.storage) return defaultSaveData();
    try {
      const text = this.storage.getItem(this.key);
      if (!text) return defaultSaveData();
      return validate(JSON.parse(text));
    } catch {
      return defaultSaveData();
    }
  }

  /** Returns false if the data could not be written. */
  save(): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(this.key, JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
  }

  updateSettings(patch: Partial<Settings>): Settings {
    // Run the merged result through validation so callers can't store junk.
    this.data.settings = validate({ ...this.data, settings: { ...this.data.settings, ...patch } }).settings;
    this.save();
    return this.data.settings;
  }

  getBest(wallMode: WallMode, size: BoardSize): number {
    return this.data.best[bestKey(wallMode, size)] ?? 0;
  }

  /** Record a finished game. Returns whether it set a new best score. */
  recordGame(game: GameRecord): { newBest: boolean } {
    const key = bestKey(game.wallMode, game.size);
    const previous = this.data.best[key] ?? 0;
    const newBest = game.score > previous;
    if (newBest) this.data.best[key] = game.score;
    const st = this.data.stats;
    st.gamesPlayed += 1;
    st.foodEaten += Math.max(0, game.foodEaten);
    st.longestSnake = Math.max(st.longestSnake, game.length);
    st.timePlayedMs += Math.max(0, Math.round(game.durationMs));
    this.save();
    return { newBest };
  }

  resetStats(): void {
    this.data.best = {};
    this.data.stats = { ...DEFAULT_STATS };
    this.save();
  }
}
