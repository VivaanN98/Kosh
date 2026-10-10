/**
 * Fictional sample data for Demo Mode. Every record is created through the Repository API, so it
 * passes exactly the same validation and postings as real data. No real people, accounts or cards.
 */
import { addDays, addMonthsAnchored, monthKey, todayIST, type IsoDate } from '@/lib/dates';
import { rupees } from '@/lib/money';
import type { Repository } from '../repository';

/** Small deterministic PRNG so the demo looks the same on every device. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPEND: { key: string; merchants: string[]; min: number; max: number; perMonth: number; card?: boolean }[] = [
  { key: 'food.groceries', merchants: ['FreshBasket', 'Green Valley Mart', 'Daily Needs Store'], min: 350, max: 2400, perMonth: 5 },
  { key: 'food.delivery', merchants: ['QuickBite', 'Tiffin Express'], min: 180, max: 650, perMonth: 7, card: true },
  { key: 'food.cafe', merchants: ['Third Wave Corner', 'Chai Point Café'], min: 90, max: 420, perMonth: 6 },
  { key: 'food.restaurants', merchants: ['Saffron Table', 'Coastal Kitchen'], min: 900, max: 3200, perMonth: 2, card: true },
  { key: 'transport.cab', merchants: ['CityRide', 'AutoGo'], min: 120, max: 540, perMonth: 8 },
  { key: 'transport.fuel', merchants: ['Highway Fuels'], min: 1200, max: 2600, perMonth: 2, card: true },
  { key: 'transport.transit', merchants: ['Metro Card Top-up'], min: 200, max: 500, perMonth: 2 },
  { key: 'shopping.clothing', merchants: ['Loom & Thread'], min: 1200, max: 4200, perMonth: 1, card: true },
  { key: 'bills.electricity', merchants: ['City Power'], min: 1400, max: 2300, perMonth: 1 },
  { key: 'bills.mobile', merchants: ['Skyline Telecom'], min: 399, max: 399, perMonth: 1 },
  { key: 'health.pharmacy', merchants: ['WellCare Pharmacy'], min: 160, max: 900, perMonth: 1 },
  { key: 'entertainment.movies', merchants: ['Starlight Cinemas'], min: 450, max: 1100, perMonth: 1, card: true },
  { key: 'personal', merchants: ['Neat Cuts Salon'], min: 300, max: 900, perMonth: 1 },
];

export async function seedSampleData(repo: Repository, today: IsoDate = todayIST()): Promise<void> {
  await repo.ensureSetup();
  const rand = mulberry32(20261010);
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
  const categories = await repo.listCategories();
  const cat = (key: string) => categories.find((c) => c.seedKey === key)!.id;
  const accounts = await repo.listAccounts();
  const sbi = accounts.find((a) => a.seedKey === 'acct.sbi')!;
  const indian = accounts.find((a) => a.seedKey === 'acct.indianbank')!;
  const start = addMonthsAnchored(`${monthKey(today)}-01`, -3, 1);
  let n = 0;
  const key = () => `demo-sample:${String((n += 1)).padStart(4, "0")}`;

  await repo.reconcileAccount({ accountId: sbi.id, actualBalance: rupees(84250), asOf: start }, key());
  await repo.reconcileAccount({ accountId: indian.id, actualBalance: rupees(23600), asOf: start }, key());
  const cash = await repo.createAccount({ name: 'Wallet', kind: 'cash', openingBalance: rupees(3200), openingOn: start, color: '#c9a86a' }, key());
  const card = await repo.createAccount(
    { name: 'Aurora Rewards Credit', kind: 'credit_card', institution: 'Demo Bank', openingBalance: 0, openingOn: start, statementDay: 12, dueDays: 18, creditLimit: rupees(150000), color: '#6c78d8' },
    key(),
  );
  await repo.createPaymentCard({
    accountId: card.id, issuer: 'Demo Bank', network: 'mastercard', cardType: 'credit', displayName: 'Aurora Rewards', last4: null, source: 'manual',
    artwork: { version: 1, template: 'mesh', colors: ['#1b1e3a', '#5a4fcf', '#e58bb5'], textTone: 'light', chip: 'left', chipStyle: 'gold', networkPosition: 'bottom-right', issuerPosition: 'top-left', contactless: true, pattern: 'dots', finish: 'gloss' },
  });

  // Salary each month, rent via an automatic rule, a streaming subscription, a gym reminder.
  for (let m = 0; m <= 3; m++) {
    const payday = addMonthsAnchored(start, m, 1);
    if (payday > today) break;
    await repo.postTransaction({ type: 'income', amount: rupees(92000), occurredOn: payday, accountId: sbi.id, categoryId: cat('income.salary'), merchant: 'Northwind Labs Payroll' }, key());
  }
  await repo.postTransaction({ type: 'income', amount: rupees(14500), occurredOn: addDays(start, 40), accountId: indian.id, categoryId: cat('income.freelance'), merchant: 'Design retainer' }, key());
  await repo.createRecurringRule({
    name: 'Rent', type: 'expense', amount: rupees(24000), accountId: sbi.id, categoryId: cat('bills.rent'), merchant: 'Rent — Maple Residency',
    frequency: 'monthly', startOn: addDays(start, 4), anchorDay: 5, mode: 'automatic',
  });
  await repo.createSubscription({
    name: 'StreamBox Premium', amount: rupees(649), accountId: card.id, categoryId: cat('entertainment.streaming'), frequency: 'monthly',
    startOn: addDays(start, 11), mode: 'automatic', website: 'streambox.example',
  });
  await repo.createSubscription({
    name: 'CloudVault 200 GB', amount: rupees(219), accountId: card.id, categoryId: cat('bills.mobile'), frequency: 'monthly',
    startOn: addDays(start, 20), mode: 'automatic',
  });
  await repo.createRecurringRule({
    name: 'Gym membership', type: 'expense', amount: rupees(1800), accountId: indian.id, categoryId: cat('health.fitness'),
    frequency: 'monthly', startOn: addDays(start, 2), anchorDay: 3, mode: 'reminder',
  });
  await repo.createRecurringRule({
    name: 'Move to wallet', type: 'transfer', amount: rupees(2000), accountId: sbi.id, toAccountId: cash.id, frequency: 'monthly', startOn: addDays(start, 6), anchorDay: 7, mode: 'automatic',
  });

  // Everyday spending.
  const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(start)) / 86_400_000));
  const months = days / 30;
  for (const s of SPEND) {
    const count = Math.max(1, Math.round(s.perMonth * months));
    for (let i = 0; i < count; i++) {
      const on = addDays(start, between(0, days));
      if (on > today) continue;
      const useCard = s.card && rand() > 0.25;
      const useCash = !useCard && (s.key.startsWith('food.cafe') || s.key.startsWith('transport.cab')) && rand() > 0.5;
      await repo.postTransaction(
        {
          type: 'expense', amount: rupees(between(s.min, s.max)), occurredOn: on, accountId: useCard ? card.id : useCash ? cash.id : sbi.id,
          categoryId: cat(s.key), merchant: s.merchants[Math.floor(rand() * s.merchants.length)]!,
        },
        key(),
      );
    }
  }
  // A refund and a card fee, a card repayment last month.
  const shoes = await repo.postTransaction({ type: 'expense', amount: rupees(3499), occurredOn: addDays(start, 30), accountId: card.id, categoryId: cat('shopping.clothing'), merchant: 'Stride Footwear' }, key());
  await repo.postTransaction({ type: 'refund', amount: rupees(3499), occurredOn: addDays(start, 36), accountId: card.id, refundOf: shoes.id, merchant: 'Stride Footwear' }, key());
  await repo.postTransaction({ type: 'expense', amount: rupees(499), occurredOn: addDays(start, 45), accountId: card.id, categoryId: cat('fees.card'), merchant: 'Annual card fee' }, key());
  await repo.postTransaction({ type: 'card_payment', amount: rupees(12000), occurredOn: addDays(start, 50), accountId: sbi.id, toAccountId: card.id, note: 'Card bill' }, key());

  // Plans.
  await repo.upsertBudget({ categoryId: null, amount: rupees(60000), warnAtPct: 85 });
  await repo.upsertBudget({ categoryId: cat('food'), amount: rupees(9000), warnAtPct: 80 });
  await repo.upsertBudget({ categoryId: cat('transport'), amount: rupees(4500), warnAtPct: 80 });
  await repo.upsertBudget({ categoryId: cat('entertainment'), amount: rupees(2500), warnAtPct: 80 });
  const trip = await repo.createGoal({ name: 'Goa in December', target: rupees(45000), deadline: addMonthsAnchored(today, 3, 20), mode: 'earmark', accountId: sbi.id, color: '#3e9cbf' });
  await repo.addGoalContribution({ goalId: trip.id, amount: rupees(12000), contributedOn: addDays(start, 10), accountId: sbi.id }, key());
  await repo.addGoalContribution({ goalId: trip.id, amount: rupees(6500), contributedOn: addDays(start, 42), accountId: sbi.id }, key());
  const fund = await repo.createGoal({ name: 'Emergency fund', target: rupees(300000), mode: 'account', color: '#2fa47a' });
  await repo.addGoalContribution({ goalId: fund.id, amount: rupees(40000), contributedOn: addDays(start, 3), accountId: sbi.id }, key());
  await repo.addGoalContribution({ goalId: fund.id, amount: rupees(15000), contributedOn: addDays(start, 33), accountId: indian.id }, key());
}
