/**
 * Android app (Capacitor) integration. Loaded only inside the native shell; the web build never
 * downloads it.
 * - Hardware back: closes the open sheet first, then goes back, then leaves the app.
 * - System bars follow the app theme.
 */
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { effectiveTheme } from '@/lib/preferences';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function initNative() {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.dataset.native = Capacitor.getPlatform();

  void App.addListener('backButton', ({ canGoBack }) => {
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });

  const applyBars = () => {
    // DARK style = light icons, for the dark theme (and vice versa).
    void SystemBars.setStyle({ style: effectiveTheme() === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
  };
  applyBars();
  window.addEventListener('kosh:theme', applyBars);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', applyBars);
}
