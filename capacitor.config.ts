import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native Android shell. The app's web build (dist/, built with `--mode native`) is bundled inside
 * the APK and served from https://localhost in the WebView, so it works offline and loads instantly.
 */
const config: CapacitorConfig = {
  appId: 'app.kosh.ledger',
  appName: 'Kosh',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#0a0b0d',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Edge-to-edge on Android: Capacitor injects correct --safe-area-inset-* CSS variables.
    SystemBars: { insetsHandling: 'css' },
  },
};

export default config;
