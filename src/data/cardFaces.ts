import { useEffect, useSyncExternalStore } from 'react';
import type { IDBPDatabase } from 'idb';

const DB_NAME = 'kosh-card-faces';
const STORE = 'faces';

let dbPromise: Promise<IDBPDatabase> | null = null;
function db(): Promise<IDBPDatabase> {
  dbPromise ??= import('idb')
    .then(({ openDB }) => openDB(DB_NAME, 1, { upgrade: (d) => void d.createObjectStore(STORE) }))
    .catch((err: unknown) => {
      dbPromise = null;
      throw err;
    });
  return dbPromise;
}

const urls = new Map<string, string | null>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function setUrl(id: string, blob: Blob | null) {
  const old = urls.get(id);
  if (old) URL.revokeObjectURL(old);
  urls.set(id, blob ? URL.createObjectURL(blob) : null);
  emit();
}

function load(id: string) {
  if (urls.has(id) || loading.has(id)) return;
  loading.add(id);
  db()
    .then((d) => d.get(STORE, id) as Promise<Blob | undefined>)
    .then((blob) => setUrl(id, blob ?? null))
    .catch(() => setUrl(id, null))
    .finally(() => loading.delete(id));
}

export async function saveCardFace(id: string, blob: Blob): Promise<void> {
  await (await db()).put(STORE, blob, id);
  setUrl(id, blob);
}

export async function deleteCardFace(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
  setUrl(id, null);
}

export async function clearCardFaces(): Promise<void> {
  await (await db()).clear(STORE);
  for (const id of [...urls.keys()]) setUrl(id, null);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useCardFace(id: string | undefined): string | null {
  const url = useSyncExternalStore(subscribe, () => (id ? (urls.get(id) ?? null) : null));
  useEffect(() => {
    if (id) load(id);
  }, [id]);
  return url;
}
