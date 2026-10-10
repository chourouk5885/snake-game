import type { Direction } from '../game/types';

export interface InputHandlers {
  direction(dir: Direction): void;
  togglePause(): void;
  startOrRestart(): void;
  openMenu(): void;
  /** A tap on the board that wasn't a swipe. */
  tap(): void;
}

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

/** Minimum finger travel, in CSS pixels, before a swipe counts. */
export const SWIPE_THRESHOLD = 20;

/** Pick a swipe direction from a movement, or null if it hasn't gone far enough yet. */
export function swipeDirection(dx: number, dy: number, threshold = SWIPE_THRESHOLD): Direction | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) return null;
  if (ax > ay) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a[href], summary, [role="button"]') !== null;
}

/**
 * Keyboard, swipe and on-screen D-pad. Everything ends up calling the same
 * handlers, so every input method feels identical.
 */
export class InputController {
  private swipe: { id: number; x: number; y: number; swiped: boolean } | null = null;

  constructor(
    private readonly board: HTMLElement,
    dpad: HTMLElement,
    private readonly handlers: InputHandlers,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    board.addEventListener('pointerdown', this.onPointerDown);
    board.addEventListener('pointermove', this.onPointerMove);
    board.addEventListener('pointerup', this.onPointerUp);
    board.addEventListener('pointercancel', this.onPointerCancel);
    dpad.addEventListener('pointerdown', this.onDpadPointer);
    dpad.addEventListener('click', this.onDpadClick);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Open dialogs handle their own keys (Esc closes them).
    if (document.querySelector('dialog[open]')) return;
    if (isTypingTarget(e.target)) return;

    const dir = KEY_DIRECTIONS[e.code] ?? KEY_DIRECTIONS[e.key];
    if (dir) {
      e.preventDefault();
      if (!e.repeat) this.handlers.direction(dir);
      return;
    }

    switch (e.code) {
      case 'Space':
      case 'KeyP':
        // Let Space press a focused button as usual.
        if (e.code === 'Space' && isActivatable(e.target)) return;
        e.preventDefault();
        if (!e.repeat) this.handlers.togglePause();
        return;
      case 'Enter':
      case 'NumpadEnter':
        if (isActivatable(e.target)) return;
        e.preventDefault();
        if (!e.repeat) this.handlers.startOrRestart();
        return;
      case 'Escape':
        e.preventDefault();
        this.handlers.openMenu();
        return;
    }
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // Don't hijack presses on overlay buttons.
    if (isActivatable(e.target)) return;
    this.swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, swiped: false };
    try {
      this.board.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const s = this.swipe;
    if (!s || s.id !== e.pointerId) return;
    const dir = swipeDirection(e.clientX - s.x, e.clientY - s.y);
    if (!dir) return;
    // Decide as soon as the threshold is crossed, then measure the next swipe from here,
    // so one continuous drag can steer several turns.
    s.x = e.clientX;
    s.y = e.clientY;
    s.swiped = true;
    this.handlers.direction(dir);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const s = this.swipe;
    if (!s || s.id !== e.pointerId) return;
    this.swipe = null;
    if (!s.swiped) this.handlers.tap();
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (this.swipe?.id === e.pointerId) this.swipe = null;
  };

  private dirFromButton(target: EventTarget | null): Direction | null {
    const button = target instanceof Element ? target.closest<HTMLElement>('[data-dir]') : null;
    const dir = button?.dataset.dir;
    return dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right' ? dir : null;
  }

  /** Touch/mouse: react on press, not release, so the D-pad feels instant. */
  private readonly onDpadPointer = (e: PointerEvent): void => {
    const dir = this.dirFromButton(e.target);
    if (!dir) return;
    e.preventDefault();
    this.handlers.direction(dir);
  };

  /** Keyboard activation of a D-pad button (click with detail 0). Pointer clicks were already handled on press. */
  private readonly onDpadClick = (e: MouseEvent): void => {
    if (e.detail !== 0) return;
    const dir = this.dirFromButton(e.target);
    if (dir) this.handlers.direction(dir);
  };
}
