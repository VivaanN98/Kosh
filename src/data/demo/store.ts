/**
 * Demo Mode storage: an in-memory copy of every table, persisted to IndexedDB.
 *
 * Writes are atomic: `mutate(fn)` runs `fn` against a staging overlay, then commits every staged
 * change in ONE IndexedDB readwrite transaction before touching memory. If `fn` throws or the
 * IndexedDB commit fails, nothing changes. Mutations are serialised through a queue.
 */
import { openDB, type IDBPDatabase } from 'idb';

export const TABLES = [
  'accounts',
  'transactions',
  'entries',
  'categories',
  'budgets',
  'goals',
  'contributions',
  'rules',
  'occurrences',
  'subscriptions',
  'cards',
  'ccSettings',
  'statements',
  'meta',
] as const;
export type Table = (typeof TABLES)[number];

export interface Row {
  id: string;
}

type Tables = Record<Table, Map<string, Row>>;

const DB_VERSION = 1;

function emptyTables(): Tables {
  return Object.fromEntries(TABLES.map((t) => [t, new Map()])) as Tables;
}

export class Writer {
  readonly staged = new Map<Table, Map<string, Row | null>>();
  constructor(private readonly base: Tables) {}

  get<T extends Row>(table: Table, id: string): T | undefined {
    const s = this.staged.get(table);
    if (s?.has(id)) return (s.get(id) ?? undefined) as T | undefined;
    return this.base[table].get(id) as T | undefined;
  }

  all<T extends Row>(table: Table): T[] {
    const s = this.staged.get(table);
    if (!s) return [...this.base[table].values()] as T[];
    const out: Row[] = [];
    for (const [id, row] of this.base[table]) if (!s.has(id)) out.push(row);
    for (const row of s.values()) if (row) out.push(row);
    return out as T[];
  }

  put<T extends Row>(table: Table, row: T): T {
    let s = this.staged.get(table);
    if (!s) this.staged.set(table, (s = new Map()));
    s.set(row.id, structuredClone(row));
    return row;
  }

  delete(table: Table, id: string): void {
    let s = this.staged.get(table);
    if (!s) this.staged.set(table, (s = new Map()));
    s.set(id, null);
  }
}

export class DemoStore {
  private tables: Tables = emptyTables();
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(private readonly db: IDBPDatabase | null) {}

  /** Open (or create) the IndexedDB database and load it into memory. */
  static async open(name = 'kosh-demo'): Promise<DemoStore> {
    const db = await openDB(name, DB_VERSION, {
      upgrade(database) {
        for (const t of TABLES) if (!database.objectStoreNames.contains(t)) database.createObjectStore(t, { keyPath: 'id' });
      },
    });
    const store = new DemoStore(db);
    const tx = db.transaction([...TABLES], 'readonly');
    await Promise.all(
      TABLES.map(async (t) => {
        const rows = (await tx.objectStore(t).getAll()) as Row[];
        for (const r of rows) store.tables[t].set(r.id, r);
      }),
    );
    await tx.done;
    return store;
  }

  /** Memory-only store (tests that do not need persistence). */
  static memory(): DemoStore {
    return new DemoStore(null);
  }

  get<T extends Row>(table: Table, id: string): T | undefined {
    const row = this.tables[table].get(id);
    return row ? (structuredClone(row) as T) : undefined;
  }

  all<T extends Row>(table: Table): T[] {
    return [...this.tables[table].values()].map((r) => structuredClone(r) as T);
  }

  /** Run a synchronous unit of work atomically. Returns what `fn` returns (deep-cloned). */
  mutate<T>(fn: (w: Writer) => T): Promise<T> {
    const run = async (): Promise<T> => {
      const w = new Writer(this.tables);
      const result = fn(w);
      if (w.staged.size > 0) {
        if (this.db) {
          const names = [...w.staged.keys()];
          const tx = this.db.transaction(names, 'readwrite');
          for (const [table, rows] of w.staged) {
            const os = tx.objectStore(table);
            for (const [id, row] of rows) {
              if (row) void os.put(row);
              else void os.delete(id);
            }
          }
          await tx.done; // throws → memory untouched, the whole unit is rolled back
        }
        for (const [table, rows] of w.staged) {
          for (const [id, row] of rows) {
            if (row) this.tables[table].set(id, row);
            else this.tables[table].delete(id);
          }
        }
      }
      return result === undefined ? result : structuredClone(result);
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async clearAll(): Promise<void> {
    await this.queue;
    if (this.db) {
      const tx = this.db.transaction([...TABLES], 'readwrite');
      await Promise.all(TABLES.map((t) => tx.objectStore(t).clear()));
      await tx.done;
    }
    this.tables = emptyTables();
  }

  close(): void {
    this.db?.close();
  }
}
