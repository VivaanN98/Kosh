import { lazy, Suspense, useState } from 'react';
import { Camera, Keyboard, ShieldCheck } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { DEFAULT_ARTWORK } from '@/domain/cards/artwork';
import type { PaymentCard } from '@/domain/types';
import { CardForm, type CardDraft } from './CardForm';
import { useWallet } from './WalletContext';

// The camera/OCR flow (and its OCR engine) loads only after the user explicitly chooses Scan.
const ScanFlow = lazy(() => import('./scan/ScanFlow'));

export const EMPTY_DRAFT: CardDraft = {
  issuer: '',
  network: 'visa',
  cardType: 'debit',
  displayName: '',
  last4: '',
  accountId: '',
  artwork: { ...DEFAULT_ARTWORK },
};

/**
 * Add Card: choose Scan or Enter Manually. Manual entry is always one tap away, and every scan
 * failure path lands on the manual form with a message.
 */
export function AddCardSheet({ editing, onEditDone }: { editing?: PaymentCard | null; onEditDone?: () => void }) {
  const wallet = useWallet();
  const toast = useToast();
  const [fallback, setFallback] = useState<{ draft: CardDraft; reason: string | null } | null>(null);
  const open = wallet.addFlow !== null || !!editing;
  const close = () => {
    setFallback(null);
    wallet.closeAdd();
    onEditDone?.();
  };
  const done = (card: PaymentCard | null) => {
    if (card) {
      wallet.markAdded(card.id);
      toast({ tone: 'success', message: `${card.displayName ?? card.issuer} added` });
    }
    close();
  };

  const title = editing ? 'Edit card' : wallet.addFlow === 'scan' ? 'Scan card' : wallet.addFlow === 'manual' ? 'Card details' : 'Add a card';

  return (
    <Sheet open={open} onClose={close} title={title} width={520} testId="add-card-sheet">
      {editing ? (
        <CardForm
          source="manual"
          existing={editing}
          submitLabel="Save card"
          initial={{
            issuer: editing.issuer, network: editing.network, cardType: editing.cardType, displayName: editing.displayName ?? '',
            last4: editing.last4 ?? '', accountId: editing.accountId, artwork: editing.artwork,
          }}
          onDone={() => close()}
        />
      ) : wallet.addFlow === 'choose' ? (
        <div className="space-y-3 pb-2">
          <ChoiceButton
            icon={<Camera size={22} />}
            title="Scan Card"
            body="Use your camera. We read the bank, network and type on this device, then you confirm."
            onClick={() => wallet.openAdd('scan')}
            testId="choose-scan"
          />
          <ChoiceButton icon={<Keyboard size={22} />} title="Enter Manually" body="Pick the bank, network and look yourself." onClick={() => wallet.openAdd('manual')} testId="choose-manual" />
          <p className="flex items-start gap-2 px-1 pt-1 text-[12.5px] text-text-3">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            Kosh never stores card photos, full card numbers, CVV, expiry or PIN. Card images never leave this device.
          </p>
        </div>
      ) : wallet.addFlow === 'manual' ? (
        <>
          {fallback?.reason && (
            <p role="status" className="mb-4 rounded-[12px] bg-peri-soft px-3 py-2 text-[13px]" data-testid="scan-fallback-reason">
              {fallback.reason}
            </p>
          )}
          <CardForm source={fallback ? 'scan' : 'manual'} initial={fallback?.draft ?? EMPTY_DRAFT} onDone={done} />
        </>
      ) : wallet.addFlow === 'scan' ? (
        <Suspense
          fallback={
            <div className="flex h-[300px] items-center justify-center text-text-2">
              <Spinner size={22} />
            </div>
          }
        >
          <ScanFlow
            onDone={done}
            onFallback={(reason, draft) => {
              setFallback({ draft: draft ?? EMPTY_DRAFT, reason });
              wallet.openAdd('manual');
            }}
          />
        </Suspense>
      ) : null}
    </Sheet>
  );
}

function ChoiceButton({ icon, title, body, onClick, testId }: { icon: React.ReactNode; title: string; body: string; onClick: () => void; testId: string }) {
  return (
    <button type="button" onClick={onClick} className="card flex w-full items-start gap-4 p-4 text-left hover:bg-surface-2" data-testid={testId}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-surface-2 text-text" aria-hidden="true">
        {icon}
      </span>
      <span>
        <span className="block text-[16px] font-medium">{title}</span>
        <span className="mt-0.5 block text-[13px] text-text-2">{body}</span>
      </span>
    </button>
  );
}
