importScripts('config.js');

const STORAGE_KEY = 'tiktokAuth'; // { access_token, refresh_token, open_id, expires_at }

function saveAuth(auth) {
  return chrome.storage.local.set({ [STORAGE_KEY]: auth });
}

function getAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => resolve(result[STORAGE_KEY] || null));
  });
}

function clearAuth() {
  return chrome.storage.local.remove([STORAGE_KEY]);
}

/**
 * Kicks off TikTok's OAuth consent screen using chrome.identity, which
 * handles the redirect entirely inside the browser (no page navigation the
 * user has to babysit, no server session needed). On success we get the
 * `code` back and hand it to our Vercel backend to exchange for tokens.
 */
async function loginWithTikTok() {
  const redirectUri = chrome.identity.getRedirectURL(); // https://<ext-id>.chromiumapp.org/
  const state = crypto.randomUUID();
  const authUrl = `${BACKEND_URL}/api/auth/tiktok/login?state=${encodeURIComponent(state)}`;

  // Our own /login endpoint 302s to TikTok's real authorize URL, but
  // launchWebAuthFlow needs the *final* TikTok URL up front to recognize
  // the eventual redirect back to redirectUri, so we resolve the redirect
  // ourselves first.
  const tiktokAuthorizeUrl = await resolveRedirect(authUrl);

  const resultUrl = await chrome.identity.launchWebAuthFlow({
    url: tiktokAuthorizeUrl,
    interactive: true,
  });

  const url = new URL(resultUrl);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const err = url.searchParams.get('error');

  if (err) throw new Error(`TikTok authorization was not granted: ${err}`);
  if (!code) throw new Error('TikTok did not return an authorization code.');
  if (returnedState !== state) throw new Error('State mismatch — possible CSRF, aborting.');

  const tokenRes = await fetch(`${BACKEND_URL}/api/auth/tiktok/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(tokenData.error || 'Token exchange failed');

  const auth = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    open_id: tokenData.open_id,
    expires_at: Date.now() + tokenData.expires_in * 1000,
  };
  await saveAuth(auth);
  return auth;
}

// launchWebAuthFlow follows redirects itself, but it needs a URL that
// eventually lands on redirectUri; a plain fetch is the simplest way to
// pre-resolve our server's 302 into the concrete tiktok.com authorize URL.
async function resolveRedirect(url) {
  const res = await fetch(url, { redirect: 'follow' });
  return res.url;
}

async function logoutFromTikTok() {
  const auth = await getAuth();
  if (auth?.access_token) {
    try {
      await fetch(`${BACKEND_URL}/api/auth/tiktok/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: auth.access_token }),
      });
    } catch (e) {
      // Best-effort; still clear local state below even if revoke fails.
    }
  }
  await clearAuth();
}

/** Returns a valid access token, refreshing first if it's expired/near-expiry. */
async function getValidAccessToken() {
  const auth = await getAuth();
  if (!auth) throw new Error('Not logged in to TikTok.');

  const isExpiringSoon = Date.now() > auth.expires_at - 60_000;
  if (!isExpiringSoon) return auth.access_token;

  const res = await fetch(`${BACKEND_URL}/api/auth/tiktok/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: auth.refresh_token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Token refresh failed');

  const refreshed = {
    ...auth,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  await saveAuth(refreshed);
  return refreshed.access_token;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'LOGIN': {
          const auth = await loginWithTikTok();
          sendResponse({ ok: true, auth });
          break;
        }
        case 'LOGOUT': {
          await logoutFromTikTok();
          sendResponse({ ok: true });
          break;
        }
        case 'GET_AUTH': {
          const auth = await getAuth();
          sendResponse({ ok: true, auth });
          break;
        }
        case 'GET_VALID_TOKEN': {
          const token = await getValidAccessToken();
          sendResponse({ ok: true, token });
          break;
        }
        default:
          sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // keep the message channel open for the async response
});
