import { useEffect } from 'react';
import type { PaymentCard } from '@/domain/types';
import type { CardDraft } from '../CardForm';

/** Placeholder until the camera/OCR flow lands: routes straight to manual entry. */
export default function ScanFlow({ onFallback }: { onDone: (c: PaymentCard | null) => void; onFallback: (reason: string, draft?: CardDraft) => void }) {
  useEffect(() => onFallback('Scanning is not available yet — enter the details manually.'), [onFallback]);
  return null;
}
