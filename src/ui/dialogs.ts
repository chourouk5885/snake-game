import type { BoardSize, WallMode } from '../game/types';
import { BOARD_CELLS } from '../game/types';
import type { Settings, Store } from '../state/store';

export interface DialogCallbacks {
  /** A setting changed in the Settings dialog (applied immediately). */
  settingsChanged(patch: Partial<Settings>): void;
  /** Any dialog opened or closed. */
  openChanged(open: boolean): void;
  statsReset(): void;
}

const SIZE_NAMES: Record<BoardSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
const WALL_MODES: WallMode[] = ['classic', 'wrap'];
const numberFormat = new Intl.NumberFormat();

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return `${Math.floor(ms / 1000)}s`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function dialog(id: string): HTMLDialogElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLDialogElement)) throw new Error(`Missing dialog #${id}`);
  return node;
}

/** Settings, Statistics and Help, all native <dialog> elements (Esc closes them). */
export class Dialogs {
  readonly settings = dialog('dlg-settings');
  readonly stats = dialog('dlg-stats');
  readonly help = dialog('dlg-help');
  private readonly form = document.getElementById('settings-form') as HTMLFormElement;

  constructor(
    private readonly store: Store,
    private readonly callbacks: DialogCallbacks,
    private readonly systemReducedMotion: () => boolean,
  ) {
    for (const d of [this.settings, this.stats, this.help]) {
      d.addEventListener('close', () => this.callbacks.openChanged(this.anyOpen()));
      // Clicking the dimmed backdrop closes the dialog.
      d.addEventListener('click', (e) => {
        if (e.target === d) d.close();
      });
    }

    this.form.addEventListener('change', (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      const value: string | boolean = input.type === 'checkbox' ? input.checked : input.value;
      this.callbacks.settingsChanged({ [input.name]: value } as Partial<Settings>);
    });

    document.getElementById('btn-reset-stats')?.addEventListener('click', () => {
      if (window.confirm('Reset all statistics and best scores? This cannot be undone.')) {
        this.callbacks.statsReset();
        this.fillStats();
      }
    });
  }

  anyOpen(): boolean {
    return this.settings.open || this.stats.open || this.help.open;
  }

  private open(d: HTMLDialogElement): void {
    for (const other of [this.settings, this.stats, this.help]) if (other !== d && other.open) other.close();
    if (!d.open) d.showModal();
    this.callbacks.openChanged(true);
  }

  openSettings(): void {
    this.fillSettings();
    this.open(this.settings);
  }

  openStats(): void {
    this.fillStats();
    this.open(this.stats);
  }

  openHelp(): void {
    this.open(this.help);
  }

  fillSettings(): void {
    const s = this.store.settings;
    const set = (name: keyof Settings, value: string | boolean) => {
      const inputs = this.form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`);
      inputs.forEach((input) => {
        if (input.type === 'checkbox') input.checked = Boolean(value);
        else input.checked = input.value === value;
      });
    };
    set('size', s.size);
    set('wallMode', s.wallMode);
    set('theme', s.theme);
    set('sound', s.sound);
    set('vibration', s.vibration);
    set('dpad', s.dpad);
    set('animations', s.animations);
    const hint = document.getElementById('motion-hint');
    if (hint) hint.hidden = !this.systemReducedMotion();
  }

  fillStats(): void {
    const st = this.store.stats;
    const text = (id: string, value: string) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    };
    text('st-games', numberFormat.format(st.gamesPlayed));
    text('st-food', numberFormat.format(st.foodEaten));
    text('st-longest', numberFormat.format(st.longestSnake));
    text('st-time', formatDuration(st.timePlayedMs));

    const body = document.getElementById('best-table-body');
    if (!body) return;
    body.replaceChildren();
    for (const size of ['small', 'medium', 'large'] as BoardSize[]) {
      const row = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      const n = BOARD_CELLS[size];
      th.textContent = `${SIZE_NAMES[size]} ${n} × ${n}`;
      row.appendChild(th);
      for (const mode of WALL_MODES) {
        const td = document.createElement('td');
        const best = this.store.getBest(mode, size);
        td.textContent = best > 0 ? numberFormat.format(best) : '–';
        row.appendChild(td);
      }
      body.appendChild(row);
    }
  }
}
