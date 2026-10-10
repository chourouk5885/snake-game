import './styles.css';
import { FixedStepLoop } from './engine/loop';
import { Game } from './game/rules';
import { BOARD_CELLS, type BoardSize, type Direction, type GameEvent, type WallMode } from './game/types';
import { registerServiceWorker, setupInstallButton } from './pwa';
import { Store, browserStorage, type Settings } from './state/store';
import { Dialogs } from './ui/dialogs';
import { Effects, SHAKE_MS } from './ui/effects';
import { Hud } from './ui/hud';
import { InputController } from './ui/input';
import { Renderer } from './ui/renderer';
import { Sound, vibrate } from './ui/sound';
import {
  applyTheme,
  onReducedMotionChange,
  onSystemThemeChange,
  readPalette,
  systemPrefersReducedMotion,
} from './ui/theme';

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------
function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const canvas = $<HTMLCanvasElement>('canvas');
const board = $('board');
const stage = $('stage');
const dpad = $('dpad');
const overlays = {
  start: $('overlay-start'),
  pause: $('overlay-pause'),
  over: $('overlay-over'),
};
const buttons = {
  install: $<HTMLButtonElement>('btn-install'),
  pause: $<HTMLButtonElement>('btn-pause'),
  newGame: $<HTMLButtonElement>('btn-new'),
  stats: $<HTMLButtonElement>('btn-stats'),
  settings: $<HTMLButtonElement>('btn-settings'),
  help: $<HTMLButtonElement>('btn-help'),
  resume: $<HTMLButtonElement>('btn-resume'),
  again: $<HTMLButtonElement>('btn-again'),
  change: $<HTMLButtonElement>('btn-change'),
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const store = new Store(browserStorage());
let settings: Settings = store.settings;

const renderer = new Renderer(canvas);
const effects = new Effects();
const hud = new Hud();
const sound = new Sound();
sound.enabled = settings.sound;

let game: Game;
let gameMode: WallMode = settings.wallMode;
let gameSize: BoardSize = settings.size;
let paused = false;
let playedMs = 0;
let overlayTimer = 0;
type OverlayName = keyof typeof overlays;

const dialogs = new Dialogs(
  store,
  {
    settingsChanged,
    openChanged: (open) => {
      if (open) pause(false);
    },
    statsReset: () => {
      store.resetStats();
      hud.setBest(Math.max(game.score, store.getBest(gameMode, gameSize)));
    },
  },
  systemPrefersReducedMotion,
);

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------
function motionAllowed(): boolean {
  return settings.animations && !systemPrefersReducedMotion();
}

function applyMotion(): void {
  const motion = motionAllowed();
  effects.enabled = motion;
  hud.motion = motion;
  document.documentElement.dataset.motion = motion ? 'full' : 'reduced';
}

function refreshTheme(): void {
  applyTheme(settings.theme);
  renderer.setPalette(readPalette());
}

function showOverlay(name: OverlayName | null): void {
  for (const [key, node] of Object.entries(overlays)) node.hidden = key !== name;
}

function updatePauseButton(): void {
  const canPause = game.status === 'playing';
  buttons.pause.disabled = !canPause;
  buttons.pause.dataset.paused = String(paused);
  const label = paused ? 'Resume' : 'Pause';
  buttons.pause.setAttribute('aria-label', label);
  buttons.pause.title = `${label} (Space)`;
}

function updateLabels(): void {
  const n = BOARD_CELLS[gameSize];
  const mode = gameMode === 'classic' ? 'Classic walls' : 'Wrap-around walls';
  const size = `${n} × ${n}`;
  $('chip-mode').textContent = mode;
  $('chip-size').textContent = size;
  $('start-mode').textContent = mode;
  $('start-size').textContent = size;
}

function updateHud(animateScore = true): void {
  hud.setScore(game.score, animateScore);
  hud.setBest(Math.max(game.score, store.getBest(gameMode, gameSize)));
  hud.setLevel(game.level);
  hud.setLength(game.snake.length);
  hud.setProgress(game.levelProgress);
}

const layoutEl = document.querySelector<HTMLElement>('.layout')!;
const frameEl = document.querySelector<HTMLElement>('.frame')!;
const scoreboardEl = document.querySelector<HTMLElement>('.scoreboard')!;
const compactQuery = matchMedia('(max-width: 760px)');

function px(value: string): number {
  return parseFloat(value) || 0;
}

/**
 * Make the board the largest square that fits. On large screens the frame is
 * sized to hug the board (so the frame and score panel sit together, centred);
 * on small screens the board fills the space between the scores and the D-pad.
 */
function layout(): void {
  let size: number;
  if (compactQuery.matches) {
    layoutEl.style.removeProperty('--frame-w');
    const rect = stage.getBoundingClientRect();
    size = Math.min(rect.width, rect.height);
  } else {
    const cs = getComputedStyle(layoutEl);
    const innerW = layoutEl.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight);
    const innerH = layoutEl.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom);
    // Frame chrome (padding, border, title strip) doesn't depend on the board size.
    const chromeX = frameEl.offsetWidth - stage.clientWidth;
    const chromeY = frameEl.offsetHeight - stage.clientHeight;
    const side = scoreboardEl.offsetWidth + px(cs.columnGap);
    size = Math.min(innerW - side - chromeX, innerH - chromeY);
    layoutEl.style.setProperty('--frame-w', `${Math.floor(Math.max(0, size)) + chromeX}px`);
  }
  size = Math.floor(Math.max(0, size));
  if (size <= 0) return;
  board.style.width = `${size}px`;
  board.style.height = `${size}px`;
  renderer.resize(size, game.cols, game.rows);
}

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------
function newGame(): void {
  window.clearTimeout(overlayTimer);
  gameMode = settings.wallMode;
  gameSize = settings.size;
  const n = BOARD_CELLS[gameSize];
  game = new Game({ cols: n, rows: n, wallMode: gameMode });
  paused = false;
  playedMs = 0;
  effects.reset();
  loop.reset();
  hud.hideBanner();
  updateHud(false);
  updateLabels();
  showOverlay('start');
  updatePauseButton();
  layout();
}

function beginMoving(): void {
  showOverlay(null);
  updatePauseButton();
  loop.primeStep(); // first move happens on the very next frame
}

function pause(announce = true): void {
  if (game.status !== 'playing' || paused) return;
  paused = true;
  showOverlay('pause');
  updatePauseButton();
  if (announce) hud.announce('Paused');
}

function resume(): void {
  if (!paused || dialogs.anyOpen()) return;
  paused = false;
  showOverlay(null);
  updatePauseButton();
  hud.announce('Resumed');
}

function steer(dir: Direction): void {
  sound.unlock();
  if (dialogs.anyOpen() || game.isFinished) return;
  if (paused) resume();
  const wasReady = game.status === 'ready';
  game.steer(dir);
  if (wasReady && game.status === 'playing') beginMoving();
}

function startOrRestart(): void {
  sound.unlock();
  if (dialogs.anyOpen()) return;
  if (game.status === 'ready') {
    game.start();
    beginMoving();
  } else if (paused) {
    resume();
  } else if (game.isFinished && !overlays.over.hidden) {
    newGame();
    game.start();
    beginMoving();
  }
}

function togglePause(): void {
  if (paused) resume();
  else pause();
}

function handleEvents(events: GameEvent[]): void {
  const now = performance.now();
  for (const event of events) {
    switch (event.type) {
      case 'eat': {
        const palette = readPaletteCached();
        effects.burst(event.pos, event.golden ? palette.golden : palette.food, event.golden ? 22 : 14);
        effects.squash(now);
        hud.popPoints(event.points, event.golden);
        sound.play(event.golden ? 'golden' : 'eat');
        vibrate(settings.vibration, event.golden ? [12, 40, 12] : 12);
        updateHud();
        hud.announce(`Score ${game.score}`);
        break;
      }
      case 'levelUp':
        hud.showBanner(`Level ${event.level}`);
        effects.flash(now);
        sound.play('levelUp');
        hud.announce(`Level ${event.level}. Score ${game.score}`);
        break;
      case 'goldenSpawn':
        hud.announce('A golden fruit appeared');
        break;
      case 'gameOver':
        finish('over');
        break;
      case 'win':
        finish('won');
        break;
      case 'goldenExpire':
        break;
    }
  }
}

function finish(kind: 'over' | 'won'): void {
  const now = performance.now();
  const length = game.snake.length;
  const { newBest } = store.recordGame({
    score: game.score,
    length,
    foodEaten: game.foodsEaten,
    durationMs: playedMs,
    wallMode: gameMode,
    size: gameSize,
  });
  updateHud();
  updatePauseButton();

  let delay: number;
  if (kind === 'over') {
    effects.shake(now);
    const fade = effects.startDeath(now, length);
    delay = Math.max(SHAKE_MS, fade) + 180;
    sound.play('gameOver');
    vibrate(settings.vibration, [40, 50, 90]);
  } else {
    const palette = readPaletteCached();
    const colors = [palette.snake, palette.food, palette.golden, palette['snake-flash']];
    game.snake.body.forEach((cell, i) => {
      if (i % 3 === 0) effects.burst(cell, colors[i % colors.length], 6, 3.5);
    });
    effects.flash(now);
    sound.play('win');
    vibrate(settings.vibration, [30, 40, 30, 40, 60]);
    delay = 700;
  }

  $('over-title').textContent = kind === 'won' ? 'You filled the board!' : 'Game over';
  $('new-best').hidden = !newBest;
  $('final-score').textContent = new Intl.NumberFormat().format(game.score);
  $('final-length').textContent = String(length);
  $('final-level').textContent = String(game.level);

  const summary = `${kind === 'won' ? 'You win!' : 'Game over.'} Score ${game.score}, length ${length}, level ${game.level}.${newBest ? ' New best!' : ''}`;
  hud.announce(summary);

  window.clearTimeout(overlayTimer);
  overlayTimer = window.setTimeout(() => {
    showOverlay('over');
    if (!dialogs.anyOpen()) buttons.again.focus({ preventScroll: true });
  }, delay);
}

// The palette is re-read only when the theme changes; effects reuse it.
let paletteCache = readPalette();
function readPaletteCached() {
  return paletteCache;
}

function settingsChanged(patch: Partial<Settings>): void {
  const before = settings;
  settings = { ...store.updateSettings(patch) };
  if (settings.theme !== before.theme) {
    refreshTheme();
    paletteCache = readPalette();
  }
  if (settings.size !== before.size || settings.wallMode !== before.wallMode) newGame();
  if (settings.sound !== before.sound) {
    sound.enabled = settings.sound;
    if (settings.sound) {
      sound.unlock();
      sound.play('eat');
    }
  }
  if (settings.dpad !== before.dpad) {
    dpad.hidden = !settings.dpad;
    layout();
  }
  if (settings.animations !== before.animations) applyMotion();
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const loop = new FixedStepLoop({
  stepMs: () => game.stepMs,
  isRunning: () => game.status === 'playing' && !paused && !dialogs.anyOpen(),
  update: (stepMs) => {
    playedMs += stepMs;
    handleEvents(game.tick());
  },
  render: (alpha, frameMs, now) => {
    effects.update(frameMs);
    renderer.draw(game, alpha, now, effects, motionAllowed());
    const shake = effects.shakeOffset(now);
    board.style.transform = shake.x || shake.y ? `translate(${shake.x.toFixed(2)}px, ${shake.y.toFixed(2)}px)` : '';
  },
});

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
new InputController(board, dpad, {
  direction: steer,
  togglePause,
  startOrRestart,
  openMenu: () => {
    pause(false);
    dialogs.openSettings();
  },
  tap: () => {
    if (paused) resume();
  },
});

/** Toolbar buttons keep keyboard focus for keyboard users only, so Space never re-presses a clicked button. */
function onClick(button: HTMLButtonElement, action: () => void): void {
  button.addEventListener('click', (e) => {
    if (e.detail > 0) button.blur();
    sound.unlock();
    action();
  });
}

onClick(buttons.pause, togglePause);
onClick(buttons.newGame, newGame);
onClick(buttons.stats, () => dialogs.openStats());
onClick(buttons.settings, () => dialogs.openSettings());
onClick(buttons.help, () => dialogs.openHelp());
onClick(buttons.resume, resume);
onClick(buttons.again, newGame);
onClick(buttons.change, () => dialogs.openSettings());

// Auto-pause when the window loses focus or the tab is hidden.
window.addEventListener('blur', () => pause());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

const resizeObserver = new ResizeObserver(() => layout());
resizeObserver.observe(layoutEl);
resizeObserver.observe(stage);
window.addEventListener('resize', layout);
compactQuery.addEventListener('change', layout);

onSystemThemeChange(() => {
  refreshTheme();
  paletteCache = readPalette();
});
onReducedMotionChange(applyMotion);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
refreshTheme();
paletteCache = readPalette();
applyMotion();
dpad.hidden = !settings.dpad;
newGame();
loop.start();

// Fonts change the stage size slightly once loaded.
document.fonts?.ready.then(layout).catch(() => {});

setupInstallButton(buttons.install);
registerServiceWorker();
