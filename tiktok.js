// lib/tiktok.js
//
// Thin wrapper around TikTok's official Login Kit + OAuth endpoints.
// https://developers.tiktok.com/doc/login-kit-web/
// https://developers.tiktok.com/doc/oauth-user-access-token-management
//
// IMPORTANT: client_secret is only ever used here (server-side). It must
// never be sent to, or read by, the extension.

const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Builds the URL the user's browser should be sent to in order to approve
 * the app. Scopes requested here must also be enabled for your app in the
 * TikTok Developer Portal (Manage apps > your app > Login Kit).
 */
function buildAuthorizeUrl({ state, scope }) {
  const clientKey = requireEnv('aw2wpejprl1319dr');
  const redirectUri = requireEnv('https://kahiincfmmiakmllfommanokdeepkecd.chromiumapp.org/');

  const params = new URLSearchParams({
    client_key: clientKey,
    scope: scope || 'user.info.basic,video.publish',
    response_type: 'code',
    redirect_uri: redirectUri,
    state: state || '',
  });

  return `${TIKTOK_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchanges an authorization code (from the redirect after user consent)
 * for an access_token + refresh_token. Server-side only.
 */
async function exchangeCodeForToken(code) {
  const clientKey = requireEnv('aw2wpejprl1319dr');
  const clientSecret = requireEnv('RB9zGA2GzAIDxxnr9zTdQHzqfrUoFfpe');
  const redirectUri = requireEnv('https://kahiincfmmiakmllfommanokdeepkecd.chromiumapp.org/');

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'TikTok token exchange failed');
  }
  return data; // { access_token, refresh_token, expires_in, open_id, scope, ... }
}

/**
 * Refreshes an access_token using a refresh_token. Server-side only
 * because it needs client_secret.
 */
async function refreshAccessToken(refreshToken) {
  const clientKey = requireEnv('aw2wpejprl1319dr');
  const clientSecret = requireEnv('RB9zGA2GzAIDxxnr9zTdQHzqfrUoFfpe');

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || 'TikTok token refresh failed');
  }
  return data;
}

/**
 * Revokes a token (e.g. when the user disconnects their account).
 */
async function revokeToken(accessToken) {
  const clientKey = requireEnv('aw2wpejprl1319dr');
  const clientSecret = requireEnv('RB9zGA2GzAIDxxnr9zTdQHzqfrUoFfpe');

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    token: accessToken,
  });

  const res = await fetch(TIKTOK_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error_description || 'TikTok token revoke failed');
  }
}

module.exports = {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  revokeToken,
};
