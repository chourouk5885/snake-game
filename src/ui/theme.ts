import type { ThemeChoice } from '../state/store';

/**
 * All colours live as CSS custom properties in src/styles.css (using
 * light-dark()). The canvas renderer reads them through this module, so
 * the palette is defined in exactly one place.
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export const CANVAS_TOKENS = [
  'board',
  'board-alt',
  'snake',
  'snake-shine',
  'snake-eye',
  'snake-pupil',
  'snake-dead',
  'snake-flash',
  'food',
  'food-leaf',
  'golden',
  'fruit-shine',
] as const;

export type CanvasToken = (typeof CANVAS_TOKENS)[number];
export type Palette = Record<CanvasToken, RGBA>;

const FALLBACK: RGBA = { r: 128, g: 128, b: 128, a: 1 };

/** Parse "rgb(1, 2, 3)", "rgba(1, 2, 3, 0.5)" or "rgb(1 2 3 / 50%)". */
export function parseColor(text: string): RGBA {
  const m = text.match(/rgba?\(([^)]+)\)/i);
  if (!m) return { ...FALLBACK };
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  const num = (s: string | undefined, scale: number) => {
    if (s === undefined) return undefined;
    return s.endsWith('%') ? (parseFloat(s) / 100) * scale : parseFloat(s);
  };
  const r = num(parts[0], 255) ?? 128;
  const g = num(parts[1], 255) ?? 128;
  const b = num(parts[2], 255) ?? 128;
  const a = num(parts[3], 1) ?? 1;
  return { r, g, b, a };
}

export function rgba(c: RGBA, alpha = c.a): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${alpha})`;
}

export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  const k = Math.min(1, Math.max(0, t));
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
    a: a.a + (b.a - a.a) * k,
  };
}

let probe: HTMLElement | null = null;

/** Resolve a custom property to a concrete colour. light-dark() only resolves on real colour properties, hence the probe element. */
export function resolveToken(name: string): RGBA {
  if (!probe) {
    probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    document.body.appendChild(probe);
  }
  probe.style.color = `var(--${name})`;
  return parseColor(getComputedStyle(probe).color);
}

export function readPalette(): Palette {
  const palette = {} as Palette;
  for (const token of CANVAS_TOKENS) palette[token] = resolveToken(token);
  return palette;
}

/** Apply the user's theme choice. "system" follows prefers-color-scheme. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  // Keep the browser / installed-app title bar in step with the page.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (meta) meta.content = rgba(resolveToken('titlebar'), 1);
}

export function onSystemThemeChange(callback: () => void): void {
  const query = matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', callback);
}

const reducedMotionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function systemPrefersReducedMotion(): boolean {
  return reducedMotionQuery?.matches ?? false;
}

export function onReducedMotionChange(callback: () => void): void {
  reducedMotionQuery?.addEventListener('change', callback);
}
