import { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { Section } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';

/** Install Kosh: native Android app, or the installable web app (PWA). */
export function InstallSection() {
  const native = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    if (native) return;
    void import('@/pwa').then((m) => setInstallable(m.canInstall())).catch(() => undefined);
    const on = () => setInstallable(true);
    window.addEventListener('kosh:install-ready', on);
    return () => window.removeEventListener('kosh:install-ready', on);
  }, [native]);

  const install = async () => {
    const m = await import('@/pwa');
    await m.promptInstall();
    setInstallable(m.canInstall());
  };

  return (
    <Section title="App">
      <div className="card flex items-start gap-3 p-4" data-testid="install-section">
        <Smartphone size={18} className="mt-0.5 shrink-0 text-text-2" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-[14px] text-text-2">
          {native ? (
            <p>You&rsquo;re using the Kosh Android app.</p>
          ) : standalone ? (
            <p>Kosh is installed on this device.</p>
          ) : ios ? (
            <p>
              On iPhone: tap <strong className="text-text">Share</strong>, then <strong className="text-text">Add to Home Screen</strong>. Kosh opens full screen and works offline.
            </p>
          ) : (
            <p>Install Kosh to open it like an app — full screen, from your home screen, even offline. Android users can also install the Kosh APK (see the README).</p>
          )}
          {installable && !native && !standalone && (
            <Button className="mt-3" variant="primary" size="sm" icon={<Download size={15} />} onClick={install} data-testid="install-app">
              Install app
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}
