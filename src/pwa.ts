/**
 * Service worker registration and the "Install" toolbar button.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: window-controls-overlay)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function registerServiceWorker(): void {
  // Only in production builds: a service worker caching the dev server gets in the way.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((error: unknown) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

/** Show `button` only while the browser offers installation. */
export function setupInstallButton(button: HTMLButtonElement): void {
  let deferred: BeforeInstallPromptEvent | null = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the event so our own button can trigger the browser's install prompt.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    button.hidden = isStandalone();
  });

  button.addEventListener('click', async () => {
    if (!deferred) return;
    const prompt = deferred;
    deferred = null;
    button.hidden = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      /* the browser refused to show the prompt */
    }
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    button.hidden = true;
  });
}
