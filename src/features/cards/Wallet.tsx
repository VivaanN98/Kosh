import type { PaymentCard } from '@/domain/types';
import type { CardVariant } from './WalletContext';
import type { PreviewState } from './WalletFrame';
import { StackedWallet } from './variants/StackedWallet';
import { OrbitWallet } from './variants/OrbitWallet';
import { CarouselWallet } from './variants/CarouselWallet';

/** Renders one wallet variant. All variants share the same components, data and wallet state. */
export function Wallet({ variant, cards, state = 'live', onEdit }: { variant: CardVariant; cards: PaymentCard[]; state?: PreviewState; onEdit: (c: PaymentCard) => void }) {
  switch (variant) {
    case 'stacked':
      return <StackedWallet cards={cards} state={state} onEdit={onEdit} />;
    case 'orbit':
      return <OrbitWallet cards={cards} state={state} onEdit={onEdit} />;
    case 'carousel':
      return <CarouselWallet cards={cards} state={state} onEdit={onEdit} />;
  }
}
