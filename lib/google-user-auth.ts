import 'server-only';
import { google } from 'googleapis';
import { adminClient } from '@/lib/supabase-admin';
import { decryptToken, encryptToken } from '@/lib/token-crypto';

export const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'] as const;
export class GoogleReconnectRequired extends Error {
  readonly code = 'GOOGLE_RECONNECT_REQUIRED';
  constructor(message = 'Your Google Drive connection expired. Reconnect Google Drive and try again.') { super(message); this.name = 'GoogleReconnectRequired'; }
}
function oauthClient(redirectUri?: string) {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.');
  return new google.auth.OAuth2(id, secret, redirectUri || callbackUrl());
}
export function callbackUrl() {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!base) throw new Error('Google Drive setup is incomplete: set NEXT_PUBLIC_SITE_URL to the full site origin (for example https://inhouse.example.com) in Vercel.');
  let parsed: URL;
  try { parsed = new URL(base); } catch { throw new Error('NEXT_PUBLIC_SITE_URL must be a valid absolute URL such as https://inhouse.example.com.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error('NEXT_PUBLIC_SITE_URL must contain only the site origin, for example https://inhouse.example.com.');
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') throw new Error('NEXT_PUBLIC_SITE_URL must use HTTPS in production.');
  return `${parsed.origin}/api/google/callback`;
}
export function createGoogleConsentUrl(state: string) {
  return oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', include_granted_scopes: true, scope: [...GOOGLE_DRIVE_SCOPES], state });
}
export async function exchangeGoogleCode(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new GoogleReconnectRequired('Google did not return a refresh token. Remove this app from your Google Account permissions, then reconnect with consent.');
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const user = await oauth2.userinfo.get();
  const email = String(user.data.email || '').trim().toLowerCase();
  if (!email || user.data.verified_email === false) throw new Error('Google did not provide a verified email address.');
  return { refreshToken: tokens.refresh_token, email, scopes: String(tokens.scope || GOOGLE_DRIVE_SCOPES.join(' ')).split(' ') };
}
export async function storeGoogleConnection(userId: string, connection: { refreshToken: string; email: string; scopes: string[] }) {
  const { error } = await adminClient.from('user_google_connections').upsert({ user_id: userId, google_email: connection.email, refresh_token_encrypted: encryptToken(connection.refreshToken), scopes: connection.scopes.join(' '), status: 'connected', last_error: null, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(`Could not save Google Drive connection: ${error.message}`);
}
export async function getConnectionStatus(userId: string): Promise<{ connected: boolean; status: 'connected' | 'needs_reconnect' | 'disconnected'; email: string | null; lastError: string | null }> {
  const { data, error } = await adminClient.from('user_google_connections').select('google_email,status,last_error').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Could not read Google Drive connection: ${error.message}`);
  return { connected: data?.status === 'connected', status: data?.status === 'connected' ? 'connected' : data?.status === 'needs_reconnect' ? 'needs_reconnect' : 'disconnected', email: data?.google_email ?? null, lastError: data?.last_error ?? null };
}
export async function getUserGoogleClient(userId: string) {
  const { data, error } = await adminClient.from('user_google_connections').select('refresh_token_encrypted,status').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Could not read Google Drive connection: ${error.message}`);
  if (!data || data.status !== 'connected' || !data.refresh_token_encrypted) throw new GoogleReconnectRequired('Connect your Google Drive to create or repair this sheet.');
  const client = oauthClient();
  client.setCredentials({ refresh_token: decryptToken(String(data.refresh_token_encrypted)) });
  client.on('tokens', async (tokens) => {
    if (tokens.refresh_token) {
      try { await adminClient.from('user_google_connections').update({ refresh_token_encrypted: encryptToken(tokens.refresh_token), updated_at: new Date().toISOString(), status: 'connected', last_error: null }).eq('user_id', userId); } catch { /* token refresh persistence is best effort; never log secrets */ }
    }
  });
  try { await client.getAccessToken(); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/invalid_grant|invalid grant|revoked/i.test(message)) {
      await adminClient.from('user_google_connections').update({ status: 'needs_reconnect', last_error: 'Google revoked or expired the refresh token.', updated_at: new Date().toISOString() }).eq('user_id', userId);
      throw new GoogleReconnectRequired();
    }
    throw error;
  }
  return client;
}
export async function disconnectGoogleDrive(userId: string) {
  const { data } = await adminClient.from('user_google_connections').select('refresh_token_encrypted').eq('user_id', userId).maybeSingle();
  if (data?.refresh_token_encrypted) {
    try { await oauthClient().revokeToken(decryptToken(String(data.refresh_token_encrypted))); } catch { /* best effort revocation */ }
  }
  const { error } = await adminClient.from('user_google_connections').delete().eq('user_id', userId);
  if (error) throw new Error(`Could not remove Google Drive connection: ${error.message}`);
}
