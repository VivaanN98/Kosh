# Security

Kosh handles personal financial data, so security reports are welcome.

**Please do not open a public issue for a vulnerability.** Use GitHub's private
"Report a vulnerability" option on the Security tab of this repository instead.

Useful context (see [docs/security.md](docs/security.md)):

- The browser never writes ledger rows; every money write goes through a `security definer` RPC
  that checks `auth.uid()`, and row-level security isolates each user.
- Card numbers, CVV/CVC, expiry and PINs are never stored, and card data is never sent to any AI provider.
- The Supabase anon key is public by design. Never commit a service-role key, an access token,
  a database password, or an LLM API key. The assistant's key lives only in an Edge Function secret.

If you self-host, you own your project's data and keys. Rotate anything you have ever pasted
somewhere it could be logged.
