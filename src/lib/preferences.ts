export type ThemePref = 'system' | 'light' | 'dark';

const THEME = 'kosh.theme';
const TRANSPARENCY = 'kosh.transparency';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
  }
}

export function getTheme(): ThemePref {
  const t = read(THEME);
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function setTheme(t: ThemePref) {
  write(THEME, t === 'system' ? null : t);
  const root = document.documentElement;
  root.setAttribute('data-theme-changing', '');
  window.setTimeout(() => root.removeAttribute('data-theme-changing'), 300);
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  window.dispatchEvent(new Event('kosh:theme'));
}

export function effectiveTheme(): 'light' | 'dark' {
  const t = getTheme();
  if (t !== 'system') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getReducedTransparency(): boolean {
  return read(TRANSPARENCY) === 'reduced';
}

export function setReducedTransparency(on: boolean) {
  write(TRANSPARENCY, on ? 'reduced' : null);
  if (on) document.documentElement.dataset.transparency = 'reduced';
  else delete document.documentElement.dataset.transparency;
}
