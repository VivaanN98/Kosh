# Deployment

## 1. Cloud Supabase (your real data)

1. **Create the project.** At [supabase.com](https://supabase.com), create a free project. Pick the
   **Mumbai (ap-south-1)** region and set a strong database password; keep it in a password manager.
2. **Push the schema** from this folder:
   ```bash
   npx supabase login                          # opens the browser once
   npx supabase link --project-ref <ref>       # <ref> is in the project URL; asks for the DB password
   npx supabase db push                        # applies supabase/migrations
   ```
3. **Auth settings** (Dashboard → Authentication):
   - **Email** provider on. For a single-user app you may turn off "Confirm email"; otherwise
     confirm the email from your inbox once.
   - **URL Configuration:** set the Site URL to wherever you host the web app (if you do). The
     Android app signs in with email and password, so it needs no redirect URL.
4. **Point the app at it** (Dashboard → Project Settings → API). Copy the Project URL and the
   **anon / publishable** key. These two are public by design; never use the service-role key in the app.
   - Android app → `.env.native.local`:
     ```
     VITE_SUPABASE_URL=https://<ref>.supabase.co
     VITE_SUPABASE_ANON_KEY=<anon key>
     ```
   - Hosted web app / PWA → the same two variables in `.env.production.local` (or the host's env settings).

## 2. Android app (APK)

**One-time toolchain**, kept outside the repo in `D:\KoshAndroid` (no spaces in the path; the C:
drive here is nearly full). Override the location with `KOSH_ANDROID_HOME`.
- `jdk-21`: Temurin JDK 21 (unzipped)
- `android-sdk`: command-line tools plus `platform-tools`, `platforms;android-36` and
  `build-tools;36.0.0`. Install the packages with
  `sdkmanager --sdk_root=D:\KoshAndroid\android-sdk --package_file=packages.txt`; the semicolons
  must be in a file because of Windows `cmd` quoting.
- `gradle-home`: Gradle's download cache (created automatically)

**Build:**
```bash
npm run android:apk        # → dist-apk/Kosh-<version>.apk (signed release)
```
The first run creates a release keystore: `D:\KoshAndroid\kosh-release.jks`, with the password in
`keystore-password.txt`. **Back up both files.** Android only installs an update if it is signed
with the same key. `versionCode` is the git commit count, so every new build is installable as an
update.

**Install on your phone:**
1. Copy the APK to the phone (USB, Google Drive, or email it to yourself) and open it.
2. Allow "Install unknown apps" for the app you opened it from (Android asks once).
3. Open **Kosh**, then sign in.

Update by installing a newer APK over it; your data lives in Supabase.

**What the app includes:**
- The whole web build, bundled. It opens instantly, and screens work offline once loaded (changes
  need a connection).
- On-device OCR, so scanning works offline.
- Camera permission, requested only when you choose Scan.

## 3. Web app / PWA (optional)

`npm run build` produces `dist/`, a static site. Host it on any static host with HTTPS (Cloudflare
Pages, Netlify, Vercel), set the two `VITE_SUPABASE_*` variables, and add the host's URL to
Supabase's Site URL. Users can then **Install app** from Settings (Android/Chrome), or use **Share →
Add to Home Screen** on iPhone. The service worker precaches the app shell, caches the OCR engine on
first use, and never caches API responses.

## 4. AI assistant

```bash
npx supabase secrets set OPENAI_API_KEY=sk-...     # stored server-side only
npx supabase functions deploy assistant
```
Locally, put the key in `supabase/functions/.env` (gitignored) and run `npx supabase functions serve`.
- **Without a key:** the Ask sheet shows these steps, and the rest of the app is unaffected.
- **Model:** the function calls OpenAI Chat Completions with `gpt-5.4-mini` and the six read-only
  tools as function calls. Override with `npx supabase secrets set OPENAI_MODEL=<model>`.

## 5. Local development on your phone

```bash
npm run dev:phone     # Vite + Cloudflare quick tunnel; prints an https link
```
The link is HTTPS, which the camera requires. Local Supabase is reached through the dev server's
`/sb` proxy, so nothing else needs exposing. The link changes every run. `cloudflared` is looked
for in `.tools/` or the system install (`winget install Cloudflare.cloudflared`).
