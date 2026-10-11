import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { isNativeApp } from './lib/platform';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (isNativeApp()) {
  void import('./native/native').then((m) => m.initNative());
} else if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => void import('./pwa').then((m) => m.registerPwa());
  if (document.readyState === 'complete') setTimeout(register, 1000);
  else window.addEventListener('load', () => setTimeout(register, 1000), { once: true });
}
