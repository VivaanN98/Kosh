import { describe, it } from 'vitest';
import { DemoRepository } from '@/data/demo/demoRepository';
import { DemoStore } from '@/data/demo/store';
import { LEDGER_VECTORS } from '../vectors/ledgerVectors';
import { runVector } from '../vectors/runner';

describe('ledger vectors — Demo adapter (TypeScript engine + IndexedDB)', () => {
  for (const vector of LEDGER_VECTORS) {
    it(vector.name, async () => {
      const store = await DemoStore.open(`vectors-${crypto.randomUUID()}`);
      await runVector(new DemoRepository(store), vector);
      store.close();
    });
  }
});
