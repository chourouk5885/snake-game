export type SoundName = 'eat' | 'golden' | 'levelUp' | 'gameOver' | 'win';

interface Note {
  freq: number;
  to?: number; // glide target frequency
  start: number; // seconds after trigger
  duration: number;
  type: OscillatorType;
  gain: number;
}

const SOUNDS: Record<SoundName, Note[]> = {
  eat: [{ freq: 520, to: 860, start: 0, duration: 0.09, type: 'triangle', gain: 0.5 }],
  golden: [
    { freq: 660, start: 0, duration: 0.08, type: 'sine', gain: 0.45 },
    { freq: 880, start: 0.07, duration: 0.08, type: 'sine', gain: 0.45 },
    { freq: 1320, start: 0.14, duration: 0.16, type: 'sine', gain: 0.4 },
  ],
  levelUp: [
    { freq: 440, start: 0, duration: 0.1, type: 'triangle', gain: 0.4 },
    { freq: 554, start: 0.09, duration: 0.1, type: 'triangle', gain: 0.4 },
    { freq: 659, start: 0.18, duration: 0.1, type: 'triangle', gain: 0.4 },
    { freq: 880, start: 0.27, duration: 0.22, type: 'triangle', gain: 0.45 },
  ],
  gameOver: [
    { freq: 330, to: 70, start: 0, duration: 0.55, type: 'sawtooth', gain: 0.28 },
    { freq: 165, to: 55, start: 0.02, duration: 0.6, type: 'square', gain: 0.12 },
  ],
  win: [
    { freq: 523, start: 0, duration: 0.12, type: 'triangle', gain: 0.4 },
    { freq: 659, start: 0.12, duration: 0.12, type: 'triangle', gain: 0.4 },
    { freq: 784, start: 0.24, duration: 0.12, type: 'triangle', gain: 0.4 },
    { freq: 1047, start: 0.36, duration: 0.4, type: 'triangle', gain: 0.45 },
  ],
};

/** Tiny synthesised sound effects with the Web Audio API. Off by default. */
export class Sound {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 3200;
      this.master.connect(filter).connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Call from a user gesture (key press, click) so browsers allow audio. */
  unlock(): void {
    if (!this.enabled) return;
    const ctx = this.context();
    if (ctx?.state === 'suspended') void ctx.resume();
  }

  play(name: SoundName): void {
    if (!this.enabled) return;
    const ctx = this.context();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.005;
    for (const note of SOUNDS[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type;
      const start = t0 + note.start;
      const end = start + note.duration;
      osc.frequency.setValueAtTime(note.freq, start);
      if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(note.gain, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(this.master);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }
}

/** Short vibration on phones that support it. */
export function vibrate(enabled: boolean, pattern: number | number[]): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}
