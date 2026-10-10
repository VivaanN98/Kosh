/**
 * Category/account icons stored by name. An explicit map keeps lucide tree-shaken
 * (importing icons dynamically by name would pull the whole set into the bundle).
 */
import {
  BadgePercent, BedDouble, Bike, Briefcase, Building2, Car, CarTaxiFront, CircleEllipsis, Clapperboard, Coffee, Coins, CreditCard,
  Droplet, Dumbbell, Flame, Fuel, Gamepad2, Gift, GraduationCap, HeartPulse, House, Landmark, Laptop, Percent, Pill, Plane,
  PlaneTakeoff, PlusCircle, Receipt, ShieldCheck, Shirt, ShoppingBag, ShoppingBasket, Smartphone, Sofa, Sparkles, SquareParking,
  Stethoscope, Ticket, TrainFront, TrainTrack, TrendingUp, Tv, Utensils, UtensilsCrossed, Wallet, Wifi, Zap, PiggyBank,
  ArrowLeftRight, Undo2, Scale, type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  'badge-percent': BadgePercent, 'bed-double': BedDouble, bike: Bike, briefcase: Briefcase, 'building-2': Building2, car: Car,
  'car-taxi-front': CarTaxiFront, 'circle-ellipsis': CircleEllipsis, clapperboard: Clapperboard, coffee: Coffee, coins: Coins,
  'credit-card': CreditCard, droplet: Droplet, dumbbell: Dumbbell, flame: Flame, fuel: Fuel, 'gamepad-2': Gamepad2, gift: Gift,
  'graduation-cap': GraduationCap, 'heart-pulse': HeartPulse, house: House, landmark: Landmark, laptop: Laptop, percent: Percent,
  pill: Pill, plane: Plane, 'plane-takeoff': PlaneTakeoff, 'plus-circle': PlusCircle, receipt: Receipt, 'shield-check': ShieldCheck,
  shirt: Shirt, 'shopping-bag': ShoppingBag, 'shopping-basket': ShoppingBasket, smartphone: Smartphone, sofa: Sofa,
  sparkles: Sparkles, 'square-parking': SquareParking, stethoscope: Stethoscope, ticket: Ticket, 'train-front': TrainFront,
  'train-track': TrainTrack, 'trending-up': TrendingUp, tv: Tv, utensils: Utensils, 'utensils-crossed': UtensilsCrossed,
  wallet: Wallet, wifi: Wifi, zap: Zap, 'piggy-bank': PiggyBank, transfer: ArrowLeftRight, refund: Undo2, scale: Scale,
};

export const ICON_NAMES = Object.keys(ICONS);

export function IconByName({ name, size = 18, className, strokeWidth = 1.75 }: { name: string | null | undefined; size?: number; className?: string; strokeWidth?: number }) {
  const Icon = (name && ICONS[name]) || CircleEllipsis;
  return <Icon size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}

/** A soft tinted tile holding an icon (category, account, transaction type). */
export function IconTile({ name, color, size = 40, iconSize = 18 }: { name: string | null | undefined; color?: string | null; size?: number; iconSize?: number }) {
  const tint = color ?? 'var(--text-2)';
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-[12px]"
      style={{ width: size, height: size, color: tint }}
      aria-hidden="true"
    >
      <span className="absolute inset-0 rounded-[inherit] opacity-[0.14]" style={{ background: tint }} />
      <span className="absolute inset-0 rounded-[inherit]" style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }} />
      <IconByName name={name} size={iconSize} className="relative" />
    </span>
  );
}
