/** RFC 4122 v4 UUID. Uses crypto.randomUUID when available (secure contexts), else getRandomValues. */
export function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A fresh idempotency key. Create one per user intent and reuse it on every retry of that intent. */
export function idempotencyKey(prefix = 'k'): string {
  return `${prefix}:${uuid()}`;
}
