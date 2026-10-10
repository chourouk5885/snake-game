import { FOODS_PER_LEVEL } from '../game/rules';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const numberFormat = new Intl.NumberFormat();

/**
 * The score panel, level banner, "+points" labels and the screen-reader
 * announcer. Purely presentational: main.ts tells it what changed.
 */
export class Hud {
  private readonly score = el('score');
  private readonly best = el('best');
  private readonly level = el('level');
  private readonly length = el('length');
  private readonly popLayer = el('pop-layer');
  private readonly progressFill = el('progress-fill');
  private readonly progressBar = el('progressbar');
  private readonly progressCount = el('progress-count');
  private readonly progressLabel = el('progress-label');
  private readonly banner = el('banner');
  private readonly announcer = el('announcer');

  /** When false, numbers jump instead of counting up and labels don't float. */
  motion = true;

  private shownScore = 0;
  private targetScore = 0;
  private countFrom = 0;
  private countStart = 0;
  private counting = false;
  private announceTimer = 0;

  setScore(value: number, animate = true): void {
    this.targetScore = value;
    if (!animate || !this.motion || value < this.shownScore) {
      this.shownScore = value;
      this.score.textContent = numberFormat.format(value);
      this.counting = false;
      return;
    }
    this.countFrom = this.shownScore;
    this.countStart = performance.now();
    if (!this.counting) {
      this.counting = true;
      requestAnimationFrame(this.tickCount);
    }
  }

  private readonly tickCount = (now: number): void => {
    const t = Math.min(1, (now - this.countStart) / 380);
    const eased = 1 - Math.pow(1 - t, 3);
    this.shownScore = Math.round(this.countFrom + (this.targetScore - this.countFrom) * eased);
    this.score.textContent = numberFormat.format(this.shownScore);
    if (t < 1) requestAnimationFrame(this.tickCount);
    else this.counting = false;
  };

  setBest(value: number): void {
    this.best.textContent = numberFormat.format(value);
  }

  setLevel(level: number): void {
    this.level.textContent = String(level);
    this.progressLabel.textContent = `Next: level ${level + 1}`;
  }

  setLength(length: number): void {
    this.length.textContent = String(length);
  }

  setProgress(foodsTowardsNext: number): void {
    const pct = (foodsTowardsNext / FOODS_PER_LEVEL) * 100;
    this.progressFill.style.width = `${pct}%`;
    this.progressBar.setAttribute('aria-valuenow', String(foodsTowardsNext));
    this.progressBar.setAttribute('aria-valuemax', String(FOODS_PER_LEVEL));
    this.progressCount.textContent = `${foodsTowardsNext} of ${FOODS_PER_LEVEL}`;
  }

  /** A "+30" label floating up from the score. */
  popPoints(points: number, golden: boolean): void {
    if (!this.motion) return;
    const pop = document.createElement('span');
    pop.className = golden ? 'pop golden' : 'pop';
    pop.textContent = `+${numberFormat.format(points)}`;
    pop.addEventListener('animationend', () => pop.remove());
    this.popLayer.appendChild(pop);
    // Safety net in case animationend never fires.
    window.setTimeout(() => pop.remove(), 1500);
  }

  showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.classList.remove('show');
    // Force a reflow so the animation restarts.
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  hideBanner(): void {
    this.banner.classList.remove('show');
  }

  /** Read a message out through the aria-live region. */
  announce(message: string): void {
    window.clearTimeout(this.announceTimer);
    // Clearing first makes screen readers repeat identical messages.
    this.announcer.textContent = '';
    this.announceTimer = window.setTimeout(() => {
      this.announcer.textContent = message;
    }, 60);
  }
}
