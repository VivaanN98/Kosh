# Security and privacy

## Data access

- **Row-level security** is on for every user table; policies are owner-only (`user_id = auth.uid()`).
  The anonymous role has no table access and cannot call any RPC.
- **Money writes only through RPC functions** (security definer, `auth.uid()` checked, composite
  foreign keys). The browser role has no insert/update/delete on ledger tables. Tested in
  `tests/db/security.test.ts`, including a second user attempting to read, edit, delete and post
  against the first user's account.
- **Idempotency:** every write carries a key; `unique (user_id, idempotency_key)` means retries,
  double taps and concurrent requests create one transaction (tested with five concurrent calls).
- **Secrets:** only the public anon key and URL are `VITE_` variables. The service-role key is used
  only by local tests. The Anthropic key exists only as an Edge Function secret.

## Cards: what is and isn't stored

| Item | Stored? |
| --- | --- |
| Issuer, network, type, display name | Yes, in Supabase |
| Last four digits | Optional, in Supabase (exactly 4 digits, enforced) |
| Template artwork (colours/layout JSON) | Yes, in Supabase (≤ 4 KB, no digit runs) |
| Full card number, CVV/CVC, expiry, PIN | **Never.** No column exists; text columns reject 12+ digit runs |
| Raw camera photo | **Never.** Pixels live in memory only and canvases are wiped after use |
| OCR text | **Never.** Parsed in memory; only the fields above survive |
| Cleaned card face picture | Optional, **only in this device's IndexedDB** (`kosh-card-faces`); never uploaded |

**How the cleaned face is made** (`features/cards/scan/cardFaceImage.ts`):
1. The standard number line and name/expiry zones of an ID-1 card are always removed, even when
   OCR read nothing there (embossed digits are often unreadable).
2. Every word OCR read that contains a digit, the full row of any 4-digit group, and the name are
   removed and filled from the surrounding design.
3. The picture is OCR'd again. If digits survive two rounds, no picture is kept and the template
   is used.

Honest limit: this is best effort on-device image processing, not a guarantee. A card printed in
an unusual layout could keep a digit outside the standard zones that OCR also missed. The picture
never leaves the device. To avoid keeping any picture, choose the colour template on the review step.

**Camera:**
- The camera is requested only after you choose **Scan Card**, and it stops at capture.
- In the Android app the CAMERA permission is declared, and Android asks for it at that moment.
- Card images and card text are never sent to the AI assistant or any other service.

## AI assistant

- Runs in the `assistant` Edge Function, with the key server-side.
- Claude can only call six read-only SQL functions (`assistant_*`). They are security-invoker and
  run with the user's JWT, so RLS limits them to that user's data. They return computed figures.
- It cannot write, run arbitrary SQL, or see payment cards. The client sends only plain-text turns.
- With no key configured it returns `503 not_configured`, and the app shows setup steps; everything
  else keeps working.

## Demo Mode

Fictional data stored in this browser's IndexedDB only. A persistent badge is shown. Demo Mode is
never used silently when Supabase is configured.

## Phone tunnel

`npm run dev:phone` exposes your dev server on a public `trycloudflare.com` URL while it runs. Sign-in
still protects real accounts; stop the script when you are done.
