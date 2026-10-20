# Google Drive OAuth connection fix (V8.5)

## Diagnosed source/schema mismatch

Migration `012_per_user_google_drive_and_access.sql` defines `user_google_connections.scopes` as `text`, but `storeGoogleConnection()` in the source previously supplied a `string[]`. The updated code serializes granted scopes to a space-delimited `text` value. This can cause a database upsert failure even after Google consent succeeds. This is a *verified code mismatch*, but the actual live failure needs confirmation from a deployment.

## Diagnostics

The OAuth callback now distinguishes:
- `google=token_error`: Google authorization code could not be exchanged for tokens.
- `google=storage_error`: Google authorized access, but storing the encrypted refresh token failed.
- `google=reconnect_required`: Google returned no refresh token.
- `google=configuration_error`: missing/invalid Google OAuth site configuration or token encryption key at start.

Failed callback attempts include an 8-character reference in the Profile error. Search Vercel Runtime Logs for `[google-drive-oauth][reference]`. Logs contain only the stage and classified error category; never Google authorization codes, refresh tokens or secrets.

## Required production configuration

Check in Vercel > Settings > Environment Variables (Production):
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.

Do not expose values. `TOKEN_ENCRYPTION_KEY` must decode from Base64 into exactly 32 bytes; do not rotate an existing key casually, as it decrypts saved refresh tokens.

Google Cloud authorized redirects must include both the Supabase authentication callback and `${NEXT_PUBLIC_SITE_URL}/api/google/callback`. Do not delete the Supabase callback.

Read-only Supabase verification:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_google_connections'
  AND column_name IN ('user_id','google_email','refresh_token_encrypted','scopes','status');
```
`scopes` should be `text` for this code. If the actual database schema differs, inspect migrations before running any schema changes.

## Deploy and test

Push updated code to GitHub, then redeploy in Vercel. Visit Profile > Connect Google Drive; complete Google consent. If the connection still fails, send only the user-visible error and its reference ID along with the matching Vercel log `step` and `category` (never tokens or client secrets).

No new database migration is required for this targeted change if migration 012 is already applied.

This source patch has not been end-to-end tested against the user's Google Cloud and Supabase environments.
