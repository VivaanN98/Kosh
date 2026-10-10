/**
 * Scanned card faces: the card's real design with the number, expiry, CVV and name removed
 * (see domain/cards/faceMask.ts). Kept ONLY in this browser's IndexedDB, keyed by card id. They are
 * never written to Supabase or sent anywhere, so another device shows the colour template instead.
 */
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

/** Object URL per card id; null = known to have no face. Missing = not loaded yet. */
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
    .catch(() => setUrl(id, null)) // storage blocked: the template is shown
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

/** The stored face for a card as an image URL, or null (none, or not loaded yet). */
export function useCardFace(id: string | undefined): string | null {
  const url = useSyncExternalStore(subscribe, () => (id ? (urls.get(id) ?? null) : null));
  useEffect(() => {
    if (id) load(id);
  }, [id]);
  return url;
}
