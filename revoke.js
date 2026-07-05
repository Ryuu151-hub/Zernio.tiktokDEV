// POST /api/auth/tiktok/revoke
// Body: { "access_token": "..." }
//
// Call this when the user clicks "Log out" / "Disconnect TikTok" in the
// extension, then have the extension clear its local chrome.storage copy.
const { revokeToken } = require('../../../lib/tiktok');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { access_token: accessToken } = req.body || {};
  if (!accessToken) {
    res.status(400).json({ error: 'Missing "access_token" in request body' });
    return;
  }

  try {
    await revokeToken(accessToken);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
