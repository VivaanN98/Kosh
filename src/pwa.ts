import { registerSW } from 'virtual:pwa-register';

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferredInstall: InstallPromptEvent | null = null;

export function registerPwa() {
  applyUpdate = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new Event('kosh:update-ready'));
    },
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e as InstallPromptEvent;
    window.dispatchEvent(new Event('kosh:install-ready'));
  });
}

export function reloadToUpdate() {
  void applyUpdate?.(true);
}

export function canInstall(): boolean {
  return deferredInstall !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredInstall) return false;
  await deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  deferredInstall = null;
  return outcome === 'accepted';
}
