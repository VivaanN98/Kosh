import { lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Page, PageHeader } from '@/components/ui/bits';
import { Segmented } from '@/components/ui/Segmented';
import { RouteSkeleton } from '@/components/layout/RouteSkeleton';

const BudgetsTab = lazy(() => import('./BudgetsTab'));
const GoalsTab = lazy(() => import('./GoalsTab'));
const RecurringTab = lazy(() => import('./RecurringTab'));

const TABS = ['budgets', 'goals', 'recurring'] as const;
type Tab = (typeof TABS)[number];

export default function PlansPage() {
  const { tab: raw } = useParams();
  const navigate = useNavigate();
  const key = raw === 'subscriptions' ? 'recurring' : raw;
  const tab: Tab = (TABS as readonly string[]).includes(key ?? '') ? (key as Tab) : 'budgets';
  return (
    <Page>
      <PageHeader eyebrow="Budgets, goals and what repeats" title="Plans" />
      <div className="mb-6">
        <Segmented
          label="Plans section"
          size="sm"
          className="w-full md:w-auto"
          value={tab}
          onChange={(v) => navigate(`/plans/${v}`, { replace: true })}
          options={[
            { value: 'budgets', label: 'Budgets', testId: 'tab-budgets' },
            { value: 'goals', label: 'Goals', testId: 'tab-goals' },
            { value: 'recurring', label: 'Recurring', testId: 'tab-recurring' },
          ]}
        />
      </div>
      <Suspense fallback={<RouteSkeleton />}>
        <div key={tab} className="tab-enter">
          {tab === 'budgets' && <BudgetsTab />}
          {tab === 'goals' && <GoalsTab />}
          {tab === 'recurring' && <RecurringTab />}
        </div>
      </Suspense>
    </Page>
  );
}
