import { describe, expect, it } from 'vitest';
import { balancesByAccount } from '@/domain/ledger/metrics';
import { LEDGER_VECTORS } from '../vectors/ledgerVectors';
import { runVector } from '../vectors/runner';
import { createTestUser, dbConfigured, deleteTestUser } from './helpers';

describe.skipIf(!dbConfigured)('ledger vectors — Supabase adapter (Postgres RPC functions)', () => {
  for (const vector of LEDGER_VECTORS) {
    it(vector.name, async () => {
      const user = await createTestUser();
      try {
        await runVector(user.repo, vector);
        // The SQL view must agree with balances derived from entries in TypeScript.
        const entries = await user.repo.listLedgerEntries();
        const ts = balancesByAccount(entries);
        const { data, error } = await user.client.from('account_balances').select('account_id, balance_paise');
        expect(error).toBeNull();
        for (const row of data ?? []) expect(Number(row.balance_paise)).toBe(ts.get(row.account_id) ?? 0);
      } finally {
        await deleteTestUser(user);
      }
    });
  }
});
