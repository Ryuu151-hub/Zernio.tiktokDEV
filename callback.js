// POST /api/auth/tiktok/callback
// Body: { "code": "..." }
//
// chrome.identity.launchWebAuthFlow intercepts TikTok's redirect back to
// https://<extension-id>.chromiumapp.org/?code=...&state=... entirely inside
// the browser — it never reaches this server. The extension pulls `code`
// out of that URL itself, then calls this endpoint to do the actual
// code -> token exchange, since that step requires TIKTOK_CLIENT_SECRET
// which must stay server-side.
const { exchangeCodeForToken } = require('../../../lib/tiktok');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { code } = req.body || {};
  if (!code) {
    res.status(400).json({ error: 'Missing "code" in request body' });
    return;
  }

  try {
    const tokenData = await exchangeCodeForToken(code);
    // Returned to the extension, which stores it in chrome.storage.local.
    // Nothing is persisted on the server — this backend is stateless by
    // design so there's no token database to secure or leak.
    res.status(200).json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      open_id: tokenData.open_id,
      scope: tokenData.scope,
      expires_in: tokenData.expires_in,
      refresh_expires_in: tokenData.refresh_expires_in,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
