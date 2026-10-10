import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Skeleton } from '@/components/ui/bits';
import { InstallSection } from './InstallSection';
import { Archive, ArchiveRestore, Database, Download, LogOut, Plus, RotateCcw, ShieldCheck } from 'lucide-react';
import { Page, PageHeader, Section, SelectField, TextField } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { IconTile } from '@/components/ui/CategoryIcon';
import { useToast } from '@/components/ui/Toast';
import { useBackend, useSnapshot, useStore } from '@/data/hooks';
import { getReducedTransparency, getTheme, setReducedTransparency, setTheme, type ThemePref } from '@/lib/preferences';
import { toKoshError } from '@/domain/errors';
import type { CategoryKind } from '@/domain/types';

// The wallet variants (and their motion features) load only when Settings is opened.
const CardStyleSection = lazy(() => import('./CardStyleSection'));

export default function SettingsPage() {
  const { mode, userEmail, signOut } = useBackend();
  const location = useLocation();
  // Deep link: /settings#card-style scrolls to the card style picker.
  useEffect(() => {
    if (!location.hash) return;
    const t = setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' }), 300);
    return () => clearTimeout(t);
  }, [location.hash]);
  const snap = useSnapshot();
  const store = useStore();
  const toast = useToast();
  const [theme, setThemeState] = useState<ThemePref>(getTheme);
  const [reduced, setReduced] = useState(getReducedTransparency);
  const [name, setName] = useState(snap.profile?.displayName ?? '');

  const saveName = async () => {
    try {
      await store.run((repo) => repo.updateProfile({ displayName: name || null }), 'profile');
      toast({ tone: 'success', message: 'Saved' });
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };

  const exportAll = async () => {
    const { downloadTransactionsCsv } = await import('@/lib/csv');
    downloadTransactionsCsv(snap, snap.transactions);
  };

  const resetDemo = async () => {
    const { DemoRepository } = await import('@/data/demo/demoRepository');
    if (store.repo instanceof DemoRepository) await store.repo.store.clearAll();
    const { clearCardFaces } = await import('@/data/cardFaces');
    await clearCardFaces().catch(() => undefined);
    window.location.reload();
  };

  return (
    <Page>
      <PageHeader eyebrow={mode === 'demo' ? 'Demo Mode' : (userEmail ?? '')} title="Settings" />

      <Section title="Profile">
        <div className="card flex items-end gap-3 p-4">
          <TextField label="Your name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="flex-1" placeholder="Used for greetings" />
          <Button onClick={saveName} disabled={name === (snap.profile?.displayName ?? '')}>
            Save
          </Button>
        </div>
      </Section>

      <Section title="Appearance">
        <div className="card space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[15px]">Theme</span>
            <Segmented
              label="Theme"
              size="sm"
              value={theme}
              onChange={(t) => {
                setTheme(t);
                setThemeState(t);
              }}
              options={[
                { value: 'system', label: 'System', testId: 'theme-system' },
                { value: 'light', label: 'Light', testId: 'theme-light' },
                { value: 'dark', label: 'Dark', testId: 'theme-dark' },
              ]}
            />
          </div>
          <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-[15px]">Reduce transparency</span>
              <span className="block text-[12.5px] text-text-3">Solid surfaces instead of glass. Also follows your system setting.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={reduced}
              onChange={(e) => {
                setReducedTransparency(e.target.checked);
                setReduced(e.target.checked);
              }}
              className="h-6 w-11 shrink-0 cursor-pointer accent-[var(--peri)]"
              data-testid="reduce-transparency"
            />
          </label>
        </div>
      </Section>

      <Suspense fallback={<Skeleton className="mb-8 h-[320px] w-full rounded-[18px]" />}>
        <CardStyleSection />
      </Suspense>

      <CategoriesSection />

      <InstallSection />

      <Section title="Your data">
        <div className="card space-y-3 p-4">
          <div className="flex items-start gap-3">
            <Database size={18} className="mt-0.5 shrink-0 text-text-2" aria-hidden="true" />
            <p className="text-[14px] text-text-2">
              {mode === 'demo'
                ? 'Demo Mode: fictional data stored only in this browser (IndexedDB). Nothing is sent anywhere.'
                : 'Stored in your Supabase database, protected by row-level security. Only you can read it.'}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-text-2" aria-hidden="true" />
            <p className="text-[14px] text-text-2">Full card numbers, CVVs and PINs are never stored. Scanned card designs (number, expiry and name removed) stay on this device.</p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button icon={<Download size={16} />} onClick={exportAll} data-testid="export-csv">
              Export all as CSV
            </Button>
            {mode === 'demo' && (
              <Button variant="ghost" icon={<RotateCcw size={16} />} onClick={resetDemo}>
                Reset demo data
              </Button>
            )}
          </div>
        </div>
      </Section>


      <Button variant="danger" icon={<LogOut size={16} />} onClick={() => void signOut()} data-testid="sign-out">
        {mode === 'demo' ? 'Leave Demo Mode' : 'Sign out'}
      </Button>
    </Page>
  );
}

function CategoriesSection() {
  const snap = useSnapshot();
  const store = useStore();
  const toast = useToast();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const parents = snap.categories.filter((c) => c.kind === kind && !c.parentId);

  const create = async () => {
    try {
      await store.run((repo) => repo.createCategory({ name, kind, parentId: parentId || null }), 'categories');
      setName('');
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };
  const toggleArchive = async (id: string, archived: boolean) => {
    try {
      await store.run((repo) => repo.updateCategory(id, { archived }), 'categories');
      if (archived) toast({ message: 'Category hidden from pickers', action: { label: 'Undo', onClick: () => store.run((repo) => repo.updateCategory(id, { archived: false }), 'categories') } });
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    }
  };

  return (
    <Section title="Categories">
      <div className="card p-4">
        <Segmented
          label="Category kind"
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: 'Spending' },
            { value: 'income', label: 'Income' },
          ]}
        />
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TextField label="New category" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pets" />
          <SelectField label="Inside" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Top level</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
          <Button icon={<Plus size={16} />} onClick={create} disabled={!name.trim()}>
            Add
          </Button>
        </div>
        <ul className="mt-4 divide-y divide-[var(--line)]">
          {parents.map((p) => {
            const children = snap.categories.filter((c) => c.parentId === p.id);
            return (
              <li key={p.id} className="py-2">
                <div className={`flex min-h-[44px] items-center gap-3 ${p.archivedAt ? 'opacity-50' : ''}`}>
                  <IconTile name={p.icon} color={p.color} size={30} iconSize={15} />
                  <span className="flex-1 text-[14.5px] font-medium">{p.name}</span>
                  <button type="button" className="tap inline-flex items-center justify-center rounded-[12px] text-text-3 hover:bg-surface-2" aria-label={`${p.archivedAt ? 'Restore' : 'Hide'} ${p.name}`} onClick={() => toggleArchive(p.id, !p.archivedAt)}>
                    {p.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                  </button>
                </div>
                {children.length > 0 && (
                  <div className="ml-11 flex flex-wrap gap-1.5 pb-1">
                    {children.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleArchive(c.id, !c.archivedAt)}
                        className={`hit-y min-h-[32px] rounded-full border border-line px-3 text-[12.5px] ${c.archivedAt ? 'text-text-3 line-through' : 'text-text-2 hover:bg-surface-2'}`}
                        title={c.archivedAt ? 'Hidden — tap to restore' : 'Tap to hide'}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
