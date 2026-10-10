/**
 * Default data created once per user. The SQL function `private.seed_user` mirrors this list;
 * `tests/db/seed.test.ts` asserts they match.
 */
import type { CardArtwork, CardNetwork, CardType, CategoryKind } from './types';

export interface SeedCategory {
  key: string;
  kind: CategoryKind;
  name: string;
  icon: string;
  color: string;
  children?: { key: string; name: string; icon: string }[];
}

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    key: 'food', kind: 'expense', name: 'Food & Dining', icon: 'utensils', color: '#f2a65a',
    children: [
      { key: 'food.groceries', name: 'Groceries', icon: 'shopping-basket' },
      { key: 'food.restaurants', name: 'Restaurants', icon: 'utensils-crossed' },
      { key: 'food.delivery', name: 'Food Delivery', icon: 'bike' },
      { key: 'food.cafe', name: 'Coffee & Snacks', icon: 'coffee' },
    ],
  },
  {
    key: 'transport', kind: 'expense', name: 'Transport', icon: 'car', color: '#7aa2f7',
    children: [
      { key: 'transport.fuel', name: 'Fuel', icon: 'fuel' },
      { key: 'transport.cab', name: 'Cab & Auto', icon: 'car-taxi-front' },
      { key: 'transport.transit', name: 'Metro & Bus', icon: 'train-front' },
      { key: 'transport.parking', name: 'Parking & Tolls', icon: 'square-parking' },
    ],
  },
  {
    key: 'shopping', kind: 'expense', name: 'Shopping', icon: 'shopping-bag', color: '#e98bb7',
    children: [
      { key: 'shopping.clothing', name: 'Clothing', icon: 'shirt' },
      { key: 'shopping.electronics', name: 'Electronics', icon: 'smartphone' },
      { key: 'shopping.home', name: 'Home & Kitchen', icon: 'sofa' },
    ],
  },
  {
    key: 'bills', kind: 'expense', name: 'Bills & Utilities', icon: 'receipt', color: '#8bd5ca',
    children: [
      { key: 'bills.rent', name: 'Rent', icon: 'house' },
      { key: 'bills.electricity', name: 'Electricity', icon: 'zap' },
      { key: 'bills.mobile', name: 'Mobile & Internet', icon: 'wifi' },
      { key: 'bills.water', name: 'Water', icon: 'droplet' },
      { key: 'bills.gas', name: 'Gas / LPG', icon: 'flame' },
    ],
  },
  {
    key: 'health', kind: 'expense', name: 'Health', icon: 'heart-pulse', color: '#f28b82',
    children: [
      { key: 'health.doctor', name: 'Doctor', icon: 'stethoscope' },
      { key: 'health.pharmacy', name: 'Pharmacy', icon: 'pill' },
      { key: 'health.fitness', name: 'Fitness', icon: 'dumbbell' },
    ],
  },
  {
    key: 'entertainment', kind: 'expense', name: 'Entertainment', icon: 'clapperboard', color: '#b4a7f5',
    children: [
      { key: 'entertainment.streaming', name: 'Streaming', icon: 'tv' },
      { key: 'entertainment.movies', name: 'Movies & Events', icon: 'ticket' },
      { key: 'entertainment.games', name: 'Games', icon: 'gamepad-2' },
    ],
  },
  {
    key: 'travel', kind: 'expense', name: 'Travel', icon: 'plane', color: '#6cc3e0',
    children: [
      { key: 'travel.flights', name: 'Flights', icon: 'plane-takeoff' },
      { key: 'travel.trains', name: 'Trains', icon: 'train-track' },
      { key: 'travel.stays', name: 'Hotels & Stays', icon: 'bed-double' },
    ],
  },
  { key: 'education', kind: 'expense', name: 'Education', icon: 'graduation-cap', color: '#e5c07b' },
  { key: 'personal', kind: 'expense', name: 'Personal Care', icon: 'sparkles', color: '#d7a6e8' },
  { key: 'gifts', kind: 'expense', name: 'Gifts & Donations', icon: 'gift', color: '#f5a3a3' },
  { key: 'insurance', kind: 'expense', name: 'Insurance', icon: 'shield-check', color: '#9ccfd8' },
  { key: 'taxes', kind: 'expense', name: 'Taxes', icon: 'landmark', color: '#c0b8a8' },
  {
    key: 'fees', kind: 'expense', name: 'Fees & Charges', icon: 'badge-percent', color: '#d4a373',
    children: [
      { key: 'fees.bank', name: 'Bank Charges', icon: 'building-2' },
      { key: 'fees.card', name: 'Card Fees', icon: 'credit-card' },
      { key: 'fees.interest', name: 'Interest', icon: 'percent' },
    ],
  },
  { key: 'other', kind: 'expense', name: 'Other', icon: 'circle-ellipsis', color: '#a0a4ab' },
  { key: 'income.salary', kind: 'income', name: 'Salary', icon: 'briefcase', color: '#7fd1ae' },
  { key: 'income.freelance', kind: 'income', name: 'Freelance', icon: 'laptop', color: '#8fd3c3' },
  { key: 'income.interest', kind: 'income', name: 'Interest & Dividends', icon: 'trending-up', color: '#9bd6a5' },
  { key: 'income.cashback', kind: 'income', name: 'Cashback & Rewards', icon: 'coins', color: '#c3e88d' },
  { key: 'income.gifts', kind: 'income', name: 'Gifts Received', icon: 'gift', color: '#a6e3a1' },
  { key: 'income.other', kind: 'income', name: 'Other Income', icon: 'plus-circle', color: '#94e2d5' },
];

export interface SeedBankAccount {
  key: string;
  name: string;
  institution: string;
  color: string;
}

export const SEED_ACCOUNTS: SeedBankAccount[] = [
  { key: 'acct.sbi', name: 'SBI Savings', institution: 'State Bank of India', color: '#2a5bd7' },
  { key: 'acct.indianbank', name: 'Indian Bank Savings', institution: 'Indian Bank', color: '#1f6f8b' },
];

export interface SeedCard {
  key: string;
  accountKey: string;
  issuer: string;
  displayName: string;
  network: CardNetwork;
  cardType: CardType;
  artwork: CardArtwork;
}

/** The two initial cards. No numbers, expiry dates or other sensitive details are invented. */
export const SEED_CARDS: SeedCard[] = [
  {
    key: 'card.sbi.global',
    accountKey: 'acct.sbi',
    issuer: 'State Bank of India',
    displayName: 'SBI Global International',
    network: 'visa',
    cardType: 'debit',
    artwork: {
      version: 1,
      template: 'gradient',
      colors: ['#1d3f8f', '#2f6fd6', '#7fb2ff'],
      textTone: 'light',
      chip: 'left',
      chipStyle: 'gold',
      networkPosition: 'bottom-right',
      issuerPosition: 'top-left',
      contactless: true,
      pattern: 'waves',
      finish: 'gloss',
    },
  },
  {
    key: 'card.indianbank.platinum',
    accountKey: 'acct.indianbank',
    issuer: 'Indian Bank',
    displayName: 'Debit Platinum',
    network: 'rupay',
    cardType: 'debit',
    artwork: {
      version: 1,
      template: 'metal',
      colors: ['#3a3f47', '#8c939c', '#d9dde2'],
      textTone: 'light',
      chip: 'left',
      chipStyle: 'silver',
      networkPosition: 'bottom-right',
      issuerPosition: 'top-left',
      contactless: true,
      pattern: 'arcs',
      finish: 'matte',
    },
  },
];
