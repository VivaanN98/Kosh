import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Inside the Android app (Capacitor injects window.Capacitor) wire native features; on the web,
// register the service worker. Each is a separate lazy chunk.
const native = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
if (native) {
  void import('./native/native').then((m) => m.initNative());
} else if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Register after the page has loaded so it never competes with first paint.
  const register = () => void import('./pwa').then((m) => m.registerPwa());
  if (document.readyState === 'complete') setTimeout(register, 1000);
  else window.addEventListener('load', () => setTimeout(register, 1000), { once: true });
}
