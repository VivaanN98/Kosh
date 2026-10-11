import type { CapacitorConfig } from '@capacitor/cli';

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
    SystemBars: { insetsHandling: 'css' },
  },
};

export default config;
