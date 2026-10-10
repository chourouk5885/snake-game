import type { Game } from '../game/rules';
import { DIRECTION_VECTORS } from '../game/snake';
import type { Point } from '../game/types';
import type { Effects } from './effects';
import { mix, rgba, type Palette, type RGBA } from './theme';

/** Body width at the head and at the tail tip, as a fraction of a cell. */
const HEAD_WIDTH = 0.8;
const TAIL_WIDTH = 0.46;
/** Spacing of the points used to draw the body, in cells. */
const SAMPLE_STEP = 0.2;

interface Sample {
  x: number;
  y: number;
  s: number; // distance from the head along the body, in cells
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shift `value` by whole board widths so it lies as close as possible to `near`. */
function nearestCopy(value: number, near: number, size: number): number {
  return value + Math.round((near - value) / size) * size;
}

function easeOutBack(t: number): number {
  const c = 1.6;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

/**
 * The snake's centre line for this frame, in cell units (cell centres at +0.5).
 *
 * The head slides from its previous cell to its current one, the tail slides
 * from the cell it is leaving, and everything in between sits on cell centres,
 * so corners stay exactly where the turns happened. In wrap mode the points
 * are "unwrapped" into one continuous line that may run off the board; the
 * renderer then draws it again shifted by a board width to show the part that
 * came out the other side.
 */
export function snakePath(game: Pick<Game, 'snake' | 'cols' | 'rows'>, t: number): Point[] {
  const { body, previous } = game.snake;
  const { cols, rows } = game;
  const m = body.length;
  const head = body[0];
  const prevHead = previous[0] ?? head;

  const fromX = nearestCopy(prevHead.x, head.x, cols);
  const fromY = nearestCopy(prevHead.y, head.y, rows);
  const points: Point[] = [{ x: lerp(fromX, head.x, t), y: lerp(fromY, head.y, t) }];
  if (m === 1) return points.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));

  let last: Point = head;
  for (let i = 1; i < m; i++) {
    const p = { x: nearestCopy(body[i].x, last.x, cols), y: nearestCopy(body[i].y, last.y, rows) };
    points.push(p);
    last = p;
  }

  // The tail tip: sliding out of the cell it occupied last tick (stationary when the snake just grew).
  const tailFrom = previous[m - 1] ?? body[m - 1];
  const tx = nearestCopy(tailFrom.x, last.x, cols);
  const ty = nearestCopy(tailFrom.y, last.y, rows);
  points.push({ x: lerp(tx, last.x, t), y: lerp(ty, last.y, t) });

  return points.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
}

/** Turn the centre line into evenly spaced samples, rounding each corner with a quarter-circle-like curve. */
export function sampleBody(points: Point[]): Sample[] {
  if (points.length === 1) return [{ ...points[0], s: 0 }];
  const dense: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    const next = points[i + 1];
    if (!next) {
      dense.push(p);
      break;
    }
    const d1x = p.x - prev.x;
    const d1y = p.y - prev.y;
    const d2x = next.x - p.x;
    const d2y = next.y - p.y;
    const l1 = Math.hypot(d1x, d1y);
    const l2 = Math.hypot(d2x, d2y);
    const straight = l1 < 1e-6 || l2 < 1e-6 || Math.abs(d1x * d2y - d1y * d2x) < 1e-6;
    if (straight) {
      dense.push(p);
      continue;
    }
    const r = Math.min(0.5, l1, l2 / 2);
    const a = { x: p.x - (d1x / l1) * r, y: p.y - (d1y / l1) * r };
    const b = { x: p.x + (d2x / l2) * r, y: p.y + (d2y / l2) * r };
    dense.push(a);
    for (let k = 1; k <= 5; k++) {
      const u = k / 6;
      const iu = 1 - u;
      dense.push({ x: iu * iu * a.x + 2 * iu * u * p.x + u * u * b.x, y: iu * iu * a.y + 2 * iu * u * p.y + u * u * b.y });
    }
    dense.push(b);
  }

  // Resample at a fixed spacing so width and colour change smoothly along the body.
  const samples: Sample[] = [{ ...dense[0], s: 0 }];
  let s = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const pieces = Math.max(1, Math.ceil(len / SAMPLE_STEP));
    for (let k = 1; k <= pieces; k++) {
      const u = k / pieces;
      samples.push({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), s: s + len * u });
    }
    s += len;
  }
  return samples;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private size = 0; // CSS pixels
  private cols = 20;
  private rows = 20;
  private boardLayer: HTMLCanvasElement | null = null;
  private palette: Palette | null = null;
  private foodKey = '';
  private foodBorn = 0;
  private goldenKey = '';
  private goldenBorn = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
  }

  get cellSize(): number {
    return this.size / this.cols;
  }

  setPalette(palette: Palette): void {
    this.palette = palette;
    this.boardLayer = null;
  }

  /** Size the canvas to `cssSize` × `cssSize` pixels, sharp on high-DPI screens. */
  resize(cssSize: number, cols: number, rows: number): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const size = Math.max(60, Math.floor(cssSize));
    if (size === this.size && dpr === this.dpr && cols === this.cols && rows === this.rows) return;
    this.size = size;
    this.dpr = dpr;
    this.cols = cols;
    this.rows = rows;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.boardLayer = null;
  }

  private radius(): number {
    return Math.min(14, this.cellSize * 0.7);
  }

  private roundedBoard(ctx: CanvasRenderingContext2D, size: number): void {
    const r = this.radius();
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, r);
  }

  /** The checkerboard is drawn once into an offscreen canvas and reused every frame. */
  private board(): HTMLCanvasElement {
    if (this.boardLayer) return this.boardLayer;
    const p = this.palette!;
    const layer = document.createElement('canvas');
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const ctx = layer.getContext('2d')!;
    ctx.scale(this.dpr, this.dpr);
    this.roundedBoard(ctx, this.size);
    ctx.fillStyle = rgba(p.board);
    ctx.fill();
    ctx.save();
    this.roundedBoard(ctx, this.size);
    ctx.clip();
    ctx.fillStyle = rgba(p['board-alt']);
    const c = this.cellSize;
    for (let y = 0; y < this.rows; y++) {
      for (let x = (y % 2); x < this.cols; x += 2) {
        // Snap to device pixels so the pattern stays crisp.
        const x0 = Math.round(x * c * this.dpr) / this.dpr;
        const y0 = Math.round(y * c * this.dpr) / this.dpr;
        const x1 = Math.round((x + 1) * c * this.dpr) / this.dpr;
        const y1 = Math.round((y + 1) * c * this.dpr) / this.dpr;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    ctx.restore();
    this.boardLayer = layer;
    return layer;
  }

  draw(game: Game, alpha: number, now: number, fx: Effects, motion: boolean): void {
    const p = this.palette;
    if (!p || this.size === 0) return;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.board(), 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    ctx.save();
    this.roundedBoard(ctx, this.size);
    ctx.clip();

    this.drawFood(game, alpha, now, motion);
    this.drawSnake(game, alpha, now, fx);
    this.drawParticles(fx);

    ctx.restore();
  }

  private drawFood(game: Game, alpha: number, now: number, motion: boolean): void {
    const p = this.palette!;
    const c = this.cellSize;
    const pulse = motion ? 1 + 0.065 * Math.sin((now / 1000) * Math.PI * 2 * 0.9) : 1;

    if (game.food) {
      const key = `${game.food.x},${game.food.y}`;
      if (key !== this.foodKey) {
        this.foodKey = key;
        this.foodBorn = now;
      }
      const appear = motion ? Math.min(1, (now - this.foodBorn) / 240) : 1;
      const scale = pulse * (appear < 1 ? Math.max(0, easeOutBack(appear)) : 1);
      this.drawFruit((game.food.x + 0.5) * c, (game.food.y + 0.5) * c, c, scale, p.food);
    } else {
      this.foodKey = '';
    }

    if (game.golden) {
      const g = game.golden;
      const key = `${g.pos.x},${g.pos.y},${g.durationMs}`;
      if (key !== this.goldenKey) {
        this.goldenKey = key;
        this.goldenBorn = now;
      }
      const appear = motion ? Math.min(1, (now - this.goldenBorn) / 300) : 1;
      const scale = (motion ? 1 + 0.09 * Math.sin((now / 1000) * Math.PI * 2 * 1.6) : 1) * Math.max(0, easeOutBack(appear));
      const cx = (g.pos.x + 0.5) * c;
      const cy = (g.pos.y + 0.5) * c;
      // Interpolate the timer too, so the ring shrinks smoothly between ticks.
      const remaining = game.status === 'playing' ? g.remainingMs - alpha * game.stepMs : g.remainingMs;
      const fraction = Math.min(1, Math.max(0, remaining / g.durationMs));
      const ctx = this.ctx;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.5, c * 0.075);
      ctx.strokeStyle = rgba(p.golden, 0.22);
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.47, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = rgba(p.golden, 1);
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.47, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
      ctx.stroke();
      this.drawFruit(cx, cy, c, scale * 0.86, p.golden, true);
    } else {
      this.goldenKey = '';
    }
  }

  private drawFruit(cx: number, cy: number, c: number, scale: number, color: RGBA, golden = false): void {
    if (scale <= 0) return;
    const p = this.palette!;
    const ctx = this.ctx;
    const r = c * 0.33 * scale;
    ctx.save();
    if (golden) {
      ctx.shadowColor = rgba(p.golden, 0.55);
      ctx.shadowBlur = c * 0.45;
    }
    ctx.fillStyle = rgba(color);
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.06, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Leaf
    ctx.fillStyle = rgba(p['food-leaf']);
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.32, cy - r * 0.95, r * 0.42, r * 0.2, -0.55, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = rgba(p['fruit-shine']);
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.38, cy - r * 0.3, r * 0.22, r * 0.14, -0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Colour at distance `s` (in cells) from the head. The game-over fade moves
   * continuously along the body and is quantised into small steps, so runs of
   * neighbouring colours differ so little that their overlapping caps don't show.
   */
  private segmentColor(s: number, base: RGBA, flash: number, fx: Effects, now: number): RGBA {
    const p = this.palette!;
    let color = flash > 0 ? mix(base, p['snake-flash'], Math.round(flash * 0.85 * 16) / 16) : base;
    const fade = Math.round(fx.deathFade(s, now) * 16) / 16;
    if (fade > 0) color = mix(color, p['snake-dead'], fade);
    return color;
  }

  private drawSnake(game: Game, alpha: number, now: number, fx: Effects): void {
    const p = this.palette!;
    const c = this.cellSize;
    const t = game.status === 'playing' ? Math.min(1, Math.max(0, alpha)) : 1;
    const samples = sampleBody(snakePath(game, t));
    const total = Math.max(samples[samples.length - 1].s, 1);
    const flash = fx.flashAmount(now);
    const squash = fx.squashAmount(now);

    const widthAt = (s: number) => {
      const k = Math.pow(Math.min(1, s / total), 1.25);
      return (HEAD_WIDTH - (HEAD_WIDTH - TAIL_WIDTH) * k) * c;
    };

    // Copies of the snake for wrap mode, so the part that crossed an edge appears on the other side.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of samples) {
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y);
      maxY = Math.max(maxY, s.y);
    }
    const offsets: Point[] = [];
    for (const ox of [-game.cols, 0, game.cols]) {
      for (const oy of [-game.rows, 0, game.rows]) {
        if (maxX + ox + 0.5 < 0 || minX + ox - 0.5 > game.cols) continue;
        if (maxY + oy + 0.5 < 0 || minY + oy - 0.5 > game.rows) continue;
        offsets.push({ x: ox, y: oy });
      }
    }

    for (const off of offsets) {
      this.drawBody(samples, off, widthAt, (i) => this.segmentColor(i, p.snake, flash, fx, now), fx, now);
      this.drawHead(game, samples, off, widthAt(0), squash, this.segmentColor(0, p.snake, flash, fx, now), fx.dead);
    }
  }

  /**
   * Draw the body tail-first as runs of round-capped strokes. Consecutive
   * samples with the same width (rounded to half a pixel) and colour share one
   * path, so even a long snake is only a handful of draw calls.
   */
  private drawBody(
    samples: Sample[],
    off: Point,
    widthAt: (s: number) => number,
    colorOf: (s: number) => RGBA,
    fx: Effects,
    now: number,
  ): void {
    const ctx = this.ctx;
    const c = this.cellSize;
    const p = this.palette!;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const px = (s: Sample) => (s.x + off.x) * c;
    const py = (s: Sample) => (s.y + off.y) * c;

    if (samples.length === 1) {
      ctx.fillStyle = rgba(colorOf(0));
      ctx.beginPath();
      ctx.arc(px(samples[0]), py(samples[0]), widthAt(0) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const strokeRuns = (width: (s: number) => number, color: (s: number) => string | null) => {
      let runStart = samples.length - 1;
      let runWidth = Math.round(width(samples[runStart].s) * 2) / 2;
      let runColor = color(samples[runStart].s);
      const flush = (from: number, to: number) => {
        if (!runColor || from <= to) return;
        ctx.strokeStyle = runColor;
        ctx.lineWidth = runWidth;
        ctx.beginPath();
        ctx.moveTo(px(samples[from]), py(samples[from]));
        for (let i = from - 1; i >= to; i--) ctx.lineTo(px(samples[i]), py(samples[i]));
        ctx.stroke();
      };
      for (let i = samples.length - 2; i >= 0; i--) {
        const w = Math.round(width(samples[i].s) * 2) / 2;
        const col = color(samples[i].s);
        if (w !== runWidth || col !== runColor) {
          flush(runStart, i);
          runStart = i;
          runWidth = w;
          runColor = col;
        }
      }
      flush(runStart, 0);
    };

    strokeRuns(widthAt, (s) => rgba(colorOf(s)));

    // A soft stripe along the back gives the body some depth. It is opaque (pre-mixed with the
    // body colour) so the overlapping round caps of neighbouring runs never show as dashes.
    const total = samples[samples.length - 1].s;
    strokeRuns(
      (s) => widthAt(s) * 0.22,
      (s) => {
        if (s < 0.5 || s > total - 0.2) return null;
        const body = colorOf(s);
        const stripe = mix(body, p['snake-shine'], 0.55);
        // The stripe melts into the grey body as the snake fades.
        return rgba(mix(stripe, body, Math.round(fx.deathFade(s, now) * 16) / 16), 1);
      },
    );
  }

  private drawHead(game: Game, samples: Sample[], off: Point, width: number, squash: number, color: RGBA, dead: boolean): void {
    const ctx = this.ctx;
    const c = this.cellSize;
    const p = this.palette!;
    const head = samples[0];
    let angle: number;
    const ahead = samples.find((s) => s.s >= 0.15);
    if (ahead && Math.hypot(head.x - ahead.x, head.y - ahead.y) > 1e-3) {
      angle = Math.atan2(head.y - ahead.y, head.x - ahead.x);
    } else {
      const v = DIRECTION_VECTORS[game.snake.direction];
      angle = Math.atan2(v.y, v.x);
    }

    const hx = (head.x + off.x) * c;
    const hy = (head.y + off.y) * c;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle);

    // A slightly longer, wider oval than the body: the head reads by shape, not just colour.
    const forward = width * 0.58 * (1 - 0.2 * squash);
    const side = width * 0.53 * (1 + 0.22 * squash);
    ctx.fillStyle = rgba(color);
    ctx.beginPath();
    ctx.ellipse(0, 0, forward, side, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes face the direction of travel.
    const eyeR = c * 0.12;
    const eyeX = c * 0.1;
    const eyeY = side * 0.5;
    for (const sign of [-1, 1]) {
      ctx.fillStyle = rgba(p['snake-eye']);
      ctx.beginPath();
      ctx.arc(eyeX, sign * eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(p['snake-pupil']);
      if (dead) {
        const k = eyeR * 0.55;
        ctx.strokeStyle = rgba(p['snake-pupil']);
        ctx.lineWidth = Math.max(1, c * 0.035);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(eyeX - k, sign * eyeY - k);
        ctx.lineTo(eyeX + k, sign * eyeY + k);
        ctx.moveTo(eyeX + k, sign * eyeY - k);
        ctx.lineTo(eyeX - k, sign * eyeY + k);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(eyeX + eyeR * 0.35, sign * eyeY, eyeR * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawParticles(fx: Effects): void {
    if (fx.particles.length === 0) return;
    const ctx = this.ctx;
    const c = this.cellSize;
    for (const pt of fx.particles) {
      const life = pt.life / pt.maxLife;
      ctx.fillStyle = rgba(pt.color, Math.min(1, life * 1.4));
      ctx.beginPath();
      ctx.arc(pt.x * c, pt.y * c, Math.max(0.5, pt.size * c * (0.4 + 0.6 * life)), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
