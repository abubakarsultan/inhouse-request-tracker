/** Safe user-facing OAuth start error categories; never expose credentials or provider bodies. */
export type GoogleConnectErrorCode =
  | 'site_url_error'
  | 'oauth_credentials_error'
  | 'encryption_key_error'
  | 'error';

export function classifyGoogleConnectError(error: unknown): GoogleConnectErrorCode {
  const message = error instanceof Error ? error.message : '';
  if (/NEXT_PUBLIC_SITE_URL|Google Drive setup is incomplete/i.test(message)) return 'site_url_error';
  if (/GOOGLE_OAUTH_CLIENT_ID|GOOGLE_OAUTH_CLIENT_SECRET|Google OAuth is not configured/i.test(message)) return 'oauth_credentials_error';
  if (/TOKEN_ENCRYPTION_KEY/i.test(message)) return 'encryption_key_error';
  return 'error';
}
