import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  Store,
  defaultSaveData,
  validate,
  type StorageLike,
} from '../src/state/store';

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

class BrokenStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('SecurityError: storage is disabled');
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
  removeItem(): void {
    throw new Error('SecurityError');
  }
}

describe('Store', () => {
  it('starts with defaults when nothing is saved', () => {
    const store = new Store(new MemoryStorage());
    expect(store.data).toEqual(defaultSaveData());
  });

  it('round-trips settings, best scores and stats', () => {
    const storage = new MemoryStorage();
    const a = new Store(storage);
    a.updateSettings({ theme: 'dark', size: 'large', wallMode: 'wrap', sound: true, vibration: false, dpad: true, animations: false });
    a.recordGame({ score: 240, length: 17, foodEaten: 14, durationMs: 61_500, wallMode: 'wrap', size: 'large' });
    a.recordGame({ score: 90, length: 9, foodEaten: 6, durationMs: 20_000, wallMode: 'classic', size: 'medium' });

    const b = new Store(storage);
    expect(b.data).toEqual(a.data);
    expect(b.settings).toEqual({ theme: 'dark', size: 'large', wallMode: 'wrap', sound: true, vibration: false, dpad: true, animations: false });
    expect(b.getBest('wrap', 'large')).toBe(240);
    expect(b.getBest('classic', 'medium')).toBe(90);
    expect(b.getBest('classic', 'small')).toBe(0);
    expect(b.stats).toEqual({ gamesPlayed: 2, foodEaten: 20, longestSnake: 17, timePlayedMs: 81_500 });
  });

  it('only reports a new best when the score beats the record', () => {
    const store = new Store(new MemoryStorage());
    const base = { length: 5, foodEaten: 2, durationMs: 1000, wallMode: 'classic' as const, size: 'medium' as const };
    expect(store.recordGame({ ...base, score: 50 }).newBest).toBe(true);
    expect(store.recordGame({ ...base, score: 50 }).newBest).toBe(false);
    expect(store.recordGame({ ...base, score: 30 }).newBest).toBe(false);
    expect(store.recordGame({ ...base, score: 60 }).newBest).toBe(true);
    expect(store.getBest('classic', 'medium')).toBe(60);
  });

  it('falls back to defaults when the saved data is not JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(new Store(storage).data).toEqual(defaultSaveData());
  });

  it('falls back field by field when values have the wrong type', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        settings: { theme: 'neon', size: 'huge', wallMode: 'wrap', sound: 'yes', vibration: false, dpad: 1, animations: null },
        best: { 'classic:medium': 120, 'wrap:small': -5, 'classic:large': 'lots', 'bogus:key': 999 },
        stats: { gamesPlayed: 4, foodEaten: -1, longestSnake: 2.7, timePlayedMs: Infinity },
      }),
    );
    const data = new Store(storage).data;
    expect(data.settings).toEqual({ ...DEFAULT_SETTINGS, wallMode: 'wrap', vibration: false });
    expect(data.best).toEqual({ 'classic:medium': 120 });
    expect(data.stats).toEqual({ gamesPlayed: 4, foodEaten: 0, longestSnake: 2, timePlayedMs: 0 });
  });

  it('handles arrays, null and primitives as saved data', () => {
    for (const raw of [null, 42, 'text', [], [1, 2], { settings: [] }, { stats: 'x', best: [] }]) {
      expect(validate(raw)).toEqual(defaultSaveData());
    }
  });

  it('keeps working in memory when storage throws', () => {
    const store = new Store(new BrokenStorage());
    expect(store.data).toEqual(defaultSaveData());
    expect(store.save()).toBe(false);
    store.updateSettings({ theme: 'light' });
    expect(store.settings.theme).toBe('light');
    expect(store.recordGame({ score: 10, length: 4, foodEaten: 1, durationMs: 500, wallMode: 'classic', size: 'small' }).newBest).toBe(true);
  });

  it('works with no storage at all', () => {
    const store = new Store(null);
    store.updateSettings({ sound: true });
    expect(store.settings.sound).toBe(true);
    expect(store.save()).toBe(false);
  });

  it('rejects invalid values passed to updateSettings', () => {
    const store = new Store(new MemoryStorage());
    store.updateSettings({ size: 'gigantic' as never, sound: true });
    expect(store.settings.size).toBe(DEFAULT_SETTINGS.size);
    expect(store.settings.sound).toBe(true);
  });

  it('reset clears best scores and stats but keeps settings', () => {
    const store = new Store(new MemoryStorage());
    store.updateSettings({ theme: 'dark' });
    store.recordGame({ score: 10, length: 4, foodEaten: 1, durationMs: 500, wallMode: 'classic', size: 'small' });
    store.resetStats();
    expect(store.data.best).toEqual({});
    expect(store.stats.gamesPlayed).toBe(0);
    expect(store.settings.theme).toBe('dark');
  });
});
