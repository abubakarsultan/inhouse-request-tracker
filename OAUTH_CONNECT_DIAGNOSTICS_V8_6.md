# V8.6: Google Drive connection error diagnostics

## Root cause of misleading warning

The `/api/google/connect` handler previously labeled **three different problems** as `configuration_error`: invalid/missing `NEXT_PUBLIC_SITE_URL`, missing Google OAuth client credentials, and missing/invalid `TOKEN_ENCRYPTION_KEY`. The Profile page then unconditionally displayed a message blaming `NEXT_PUBLIC_SITE_URL`. This could send administrators in circles even after adding the correct site URL.

## Changes

- Added `lib/google-connect-error.ts`, a pure error classifier that never includes raw provider/credential text in user messages.
- Updated `app/api/google/connect/route.ts` to use `site_url_error`, `oauth_credentials_error`, `encryption_key_error`, or `error`, and log only the classification with a short reference ID.
- Updated `app/(protected)/profile/page.tsx` with actionable, distinct messages and a **Dismiss** link.
- Retained `configuration_error` for compatibility with old callback links, but it no longer incorrectly singles out the site URL.
- Added `tests/google-connect-diagnostics.test.mjs`.

## Deployment and test

1. Push the updated source code to GitHub and deploy to **Production** on Vercel.
2. In Vercel > Project > Settings > Environment Variables, verify that the following *names* exist, are in **Production** and have valid values. Do not share the values:
   - `NEXT_PUBLIC_SITE_URL` = the exact production origin, e.g. `https://inhouse-request-tracker.vercel.app` (not a path, trailing slash, or preview URL)
   - `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` = the **same** Web application OAuth client
   - `TOKEN_ENCRYPTION_KEY` = one Base64 string decoding to exactly 32 bytes. Do not rotate a valid existing key.
3. Go to `/profile` *without any `?google=...` query*, then click **Connect Google Drive**.
4. If the app redirects back with an error, the specific issue will now be shown with a reference ID. Use that reference ID in the Vercel Runtime Logs to correlate failure categories. Do not share raw credentials or tokens.
5. Google Cloud must authorize `${NEXT_PUBLIC_SITE_URL}/api/google/callback` as a redirect URI; keep the separate Supabase auth callback intact.

## Tests and limitations

- New OAuth diagnostic regression tests passed.
- Full test suite: 96 of 97 passed locally; an unrelated test did not start because the local `zod` dependency is not installed.
- Full dependency-backed `next build` and live Google OAuth are **not** verified here. The change improves diagnosis but cannot supply missing Vercel variables automatically.
- No Supabase SQL migration is required for this change.
