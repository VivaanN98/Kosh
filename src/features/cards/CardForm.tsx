/**
 * Card details + template artwork editor. Used by "Enter Manually", by editing, and as the review
 * step of scanning (with `uncertain` fields flagged for confirmation).
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { SelectField, TextField } from '@/components/ui/bits';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/components/ui/Toast';
import { CardFace } from '@/components/cards/CardFace';
import { useDerived, useStore } from '@/data/hooks';
import { deleteCardFace, saveCardFace, useCardFace } from '@/data/cardFaces';
import { idempotencyKey } from '@/lib/ids';
import { NETWORK_LABEL, sanitizeArtwork, textToneFor } from '@/domain/cards/artwork';
import { hasCardLikeNumber } from '@/domain/ledger/engine';
import { toKoshError } from '@/domain/errors';
import { CARD_NETWORKS, type CardArtwork, type CardNetwork, type CardType, type PaymentCard } from '@/domain/types';

export interface CardDraft {
  issuer: string;
  network: CardNetwork;
  cardType: CardType;
  displayName: string;
  last4: string;
  accountId: string;
  artwork: CardArtwork;
  /**
   * Scanned face picture (number, expiry and name removed), in memory until saved to this device.
   * undefined = keep whatever the card already has; null = use the template (removes a stored one).
   */
  face?: Blob | null;
}

export type UncertainField = 'issuer' | 'network' | 'cardType' | 'last4';

export const PALETTES: { name: string; colors: [string, string, string]; template: CardArtwork['template'] }[] = [
  { name: 'Midnight', colors: ['#14161c', '#2a2f3a', '#4a5160'], template: 'gradient' },
  { name: 'Sapphire', colors: ['#1d3f8f', '#2f6fd6', '#7fb2ff'], template: 'gradient' },
  { name: 'Graphite', colors: ['#3a3f47', '#8c939c', '#d9dde2'], template: 'metal' },
  { name: 'Emerald', colors: ['#0d3b2e', '#1f7a5a', '#8fdcb8'], template: 'gradient' },
  { name: 'Aurora', colors: ['#1b1e3a', '#5a4fcf', '#e58bb5'], template: 'mesh' },
  { name: 'Copper', colors: ['#4a2516', '#b0643a', '#f1c39a'], template: 'metal' },
  { name: 'Pearl', colors: ['#f3f1ec', '#dcd8cf', '#b9b3a6'], template: 'solid' },
  { name: 'Crimson', colors: ['#4c0d16', '#a3192d', '#f06a6a'], template: 'gradient' },
];

export function CardForm({
  initial,
  existing,
  source,
  uncertain = [],
  onDone,
  submitLabel = 'Add card',
}: {
  initial: CardDraft;
  existing?: PaymentCard;
  source: 'manual' | 'scan';
  uncertain?: UncertainField[];
  onDone: (card: PaymentCard | null) => void;
  submitLabel?: string;
}) {
  const store = useStore();
  const d = useDerived();
  const toast = useToast();
  const [draft, setDraft] = useState<CardDraft>(initial);
  const [confirmed, setConfirmed] = useState<Set<UncertainField>>(new Set());
  const [busy, setBusy] = useState(false);
  const [acctKey] = useState(() => idempotencyKey('acct'));
  const set = <K extends keyof CardDraft>(k: K, v: CardDraft[K]) => setDraft((x) => ({ ...x, [k]: v }));
  const touch = (f: UncertainField) => setConfirmed((s) => new Set(s).add(f));

  const eligible = useMemo(
    () =>
      d.activeAccounts.filter((a) =>
        draft.cardType === 'credit' ? a.kind === 'credit_card' : draft.cardType === 'debit' ? a.kind === 'bank' : a.kind === 'bank' || a.kind === 'cash',
      ),
    [d.activeAccounts, draft.cardType],
  );
  const accountValid = draft.accountId === 'new-credit' ? draft.cardType === 'credit' : eligible.some((a) => a.id === draft.accountId);
  const last4Valid = draft.last4 === '' || /^\d{4}$/.test(draft.last4);
  const textValid = !hasCardLikeNumber(draft.issuer) && !hasCardLikeNumber(draft.displayName);
  const pending = uncertain.filter((f) => !confirmed.has(f));
  const valid = draft.issuer.trim().length > 0 && accountValid && last4Valid && textValid && pending.length === 0;

  const flag = (f: UncertainField) =>
    uncertain.includes(f) && !confirmed.has(f) ? (
      <span className="ml-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-warning">
        <AlertTriangle size={12} aria-hidden="true" /> Please confirm
      </span>
    ) : null;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      let accountId = draft.accountId;
      if (accountId === 'new-credit') {
        const acct = await store.run((repo) => repo.createAccount({ name: `${draft.issuer.trim()} Credit Card`.slice(0, 60), kind: 'credit_card', institution: draft.issuer.trim() }, acctKey), 'accounts');
        accountId = acct.id;
      }
      const artwork = sanitizeArtwork(draft.artwork);
      const payload = {
        accountId, issuer: draft.issuer.trim(), network: draft.network, cardType: draft.cardType,
        displayName: draft.displayName.trim() || null, last4: draft.last4 || null, artwork,
      };
      let saved: PaymentCard | null = null;
      if (existing) {
        await store.run((repo) => repo.updatePaymentCard(existing.id, payload), 'cards');
      } else {
        saved = await store.run((repo) => repo.createPaymentCard({ ...payload, source }), 'cards');
      }
      const cardId = existing?.id ?? saved?.id;
      if (cardId && draft.face !== undefined) {
        try {
          await (draft.face ? saveCardFace(cardId, draft.face) : deleteCardFace(cardId));
        } catch {
          toast({ tone: 'error', message: 'The card was saved, but this browser wouldn’t store its picture — it shows the colour template instead.' });
        }
      }
      onDone(saved);
    } catch (err) {
      toast({ tone: 'error', message: toKoshError(err).friendly });
    } finally {
      setBusy(false);
    }
  };

  const storedFace = useCardFace(draft.face === undefined ? existing?.id : undefined);
  const draftFace = draft.face ? faceUrl(draft.face) : null;
  const face = draft.face === undefined ? storedFace : draftFace;
  const preview = { ...draft, face, displayName: draft.displayName || null, last4: /^\d{4}$/.test(draft.last4) ? draft.last4 : null };
  // Lets the user switch back to the scanned picture after choosing the template.
  const [scanned] = useState(initial.face ?? null);

  return (
    <div className="space-y-4 pb-2" data-testid="card-form">
      <div className="mx-auto max-w-[320px]">
        <CardFace card={preview} />
        <p className="mt-2 text-center text-[11.5px] text-text-3">
          {face ? 'Your card’s design, with the number, expiry and name removed. Kept only on this device.' : 'Artwork is a template recreation — no photo is stored.'}
        </p>
        {(face || scanned) && (
          <div className="mt-2 flex justify-center">
            <Button size="sm" variant="ghost" onClick={() => set('face', face ? null : scanned)} data-testid="toggle-card-face">
              {face ? 'Use a colour template instead' : 'Use the scanned design'}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block">
          <span className="mb-1.5 block text-[13px] font-medium text-text-2">Bank / issuer {flag('issuer')}</span>
          <input
            value={draft.issuer}
            maxLength={60}
            onChange={(e) => {
              set('issuer', e.target.value);
              touch('issuer');
            }}
            onBlur={() => touch('issuer')}
            className="h-12 w-full rounded-[14px] border border-line bg-surface-2 px-3.5 text-[15px]"
            data-testid="card-issuer"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-text-2">Network {flag('network')}</span>
          <select
            value={draft.network}
            onChange={(e) => {
              set('network', e.target.value as CardNetwork);
              touch('network');
            }}
            onFocus={() => touch('network')}
            className="h-12 w-full rounded-[14px] border border-line bg-surface-2 px-3 text-[15px]"
            data-testid="card-network"
          >
            {CARD_NETWORKS.map((n) => (
              <option key={n} value={n}>
                {NETWORK_LABEL[n]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-text-2">Last 4 (optional) {flag('last4')}</span>
          <input
            value={draft.last4}
            inputMode="numeric"
            maxLength={4}
            onChange={(e) => {
              set('last4', e.target.value.replace(/\D/g, '').slice(0, 4));
              touch('last4');
            }}
            onFocus={() => touch('last4')}
            className="num h-12 w-full rounded-[14px] border border-line bg-surface-2 px-3.5 text-[15px] tracking-[0.2em]"
            aria-invalid={!last4Valid}
            data-testid="card-last4"
          />
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-text-2">Card type {flag('cardType')}</span>
        <Segmented
          label="Card type"
          value={draft.cardType}
          onChange={(v) => {
            setDraft((x) => ({ ...x, cardType: v, accountId: '' }));
            touch('cardType');
          }}
          className="w-full"
          options={[
            { value: 'debit', label: 'Debit', testId: 'type-debit' },
            { value: 'credit', label: 'Credit', testId: 'type-credit' },
            { value: 'prepaid', label: 'Prepaid' },
          ]}
        />
        {uncertain.includes('cardType') && !confirmed.has('cardType') && (
          <button type="button" onClick={() => touch('cardType')} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-peri">
            <Check size={13} aria-hidden="true" /> {draft.cardType} is correct
          </button>
        )}
      </div>

      <TextField label="Name on the card face (optional)" value={draft.displayName} maxLength={60} onChange={(e) => set('displayName', e.target.value)} placeholder="e.g. Platinum Rewards" error={textValid ? undefined : 'That looks like a card number'} />

      <SelectField label="Linked account" value={draft.accountId} onChange={(e) => set('accountId', e.target.value)} error={draft.accountId && !accountValid ? 'Pick a matching account' : undefined} data-testid="card-account">
        <option value="">Choose…</option>
        {eligible.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
        {draft.cardType === 'credit' && <option value="new-credit">+ New credit card account</option>}
      </SelectField>

      {!face && <ArtworkEditor artwork={draft.artwork} onChange={(a) => set('artwork', a)} />}

      {pending.length > 0 && (
        <p className="rounded-[12px] bg-warning-soft px-3 py-2 text-[12.5px] text-warning" role="status">
          We weren&rsquo;t sure about {pending.join(', ')}. Check and confirm {pending.length === 1 ? 'it' : 'them'} to continue.
        </p>
      )}
      <Button variant="primary" size="lg" block disabled={!valid} loading={busy} onClick={save} data-testid="save-card">
        {submitLabel}
      </Button>
    </div>
  );
}

/** One URL per scanned picture (≈40 KB, at most one per scan), released when the page unloads. */
const faceUrls = new WeakMap<Blob, string>();
function faceUrl(blob: Blob): string {
  let url = faceUrls.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    faceUrls.set(blob, url);
  }
  return url;
}

export function ArtworkEditor({ artwork, onChange }: { artwork: CardArtwork; onChange: (a: CardArtwork) => void }) {
  const set = (patch: Partial<CardArtwork>) => {
    const next = { ...artwork, ...patch };
    if (patch.colors) next.textTone = textToneFor(next.colors.filter(Boolean) as string[]);
    onChange(next);
  };
  return (
    <fieldset className="rounded-[16px] border border-line p-3">
      <legend className="px-1 text-[13px] font-medium text-text-2">Artwork</legend>
      <div className="scroll-clean -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Colour palette">
        {PALETTES.map((p) => {
          const active = p.colors.every((c, i) => artwork.colors[i] === c);
          return (
            <button
              key={p.name}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={p.name}
              title={p.name}
              onClick={() => set({ colors: [...p.colors], template: p.template })}
              className={`h-11 w-16 shrink-0 rounded-[10px] ${active ? 'ring-2 ring-[var(--peri)] ring-offset-2 ring-offset-[var(--surface)]' : ''}`}
              style={{ background: `linear-gradient(135deg, ${p.colors.join(', ')})` }}
            />
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <label key={i} className="flex min-h-[44px] items-center gap-2 rounded-[12px] bg-surface-2 px-2 text-[12px] text-text-2">
            <input
              type="color"
              value={artwork.colors[i] ?? artwork.colors[1]}
              onChange={(e) => {
                const colors = [...artwork.colors] as CardArtwork['colors'];
                colors[i] = e.target.value;
                set({ colors });
              }}
              className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent"
              aria-label={`Colour ${i + 1}`}
            />
            Colour {i + 1}
          </label>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SelectField label="Finish" value={artwork.template} onChange={(e) => set({ template: e.target.value as CardArtwork['template'] })}>
          <option value="gradient">Gradient</option>
          <option value="solid">Solid</option>
          <option value="metal">Brushed metal</option>
          <option value="mesh">Mesh</option>
        </SelectField>
        <SelectField label="Pattern" value={artwork.pattern} onChange={(e) => set({ pattern: e.target.value as CardArtwork['pattern'] })}>
          <option value="none">None</option>
          <option value="waves">Waves</option>
          <option value="arcs">Arcs</option>
          <option value="grid">Grid</option>
          <option value="dots">Dots</option>
        </SelectField>
        <SelectField label="Chip" value={artwork.chip} onChange={(e) => set({ chip: e.target.value as CardArtwork['chip'] })}>
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="none">None</option>
        </SelectField>
        <SelectField label="Network mark" value={artwork.networkPosition} onChange={(e) => set({ networkPosition: e.target.value as CardArtwork['networkPosition'] })}>
          <option value="bottom-right">Bottom right</option>
          <option value="top-right">Top right</option>
          <option value="bottom-left">Bottom left</option>
        </SelectField>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Segmented
          label="Text colour"
          size="sm"
          value={artwork.textTone}
          onChange={(v) => onChange({ ...artwork, textTone: v })}
          options={[
            { value: 'light', label: 'Light text' },
            { value: 'dark', label: 'Dark text' },
          ]}
        />
        <Segmented
          label="Surface"
          size="sm"
          value={artwork.finish}
          onChange={(v) => onChange({ ...artwork, finish: v })}
          options={[
            { value: 'gloss', label: 'Gloss' },
            { value: 'matte', label: 'Matte' },
          ]}
        />
      </div>
    </fieldset>
  );
}
