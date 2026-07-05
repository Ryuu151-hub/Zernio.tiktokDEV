// POST /api/auth/tiktok/refresh
// Body: { "refresh_token": "..." }
//
// Access tokens expire after ~24h. The extension calls this before making
// a TikTok API call if the stored token is expired (or about to be).
const { refreshAccessToken } = require('../../../lib/tiktok');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { refresh_token: refreshToken } = req.body || {};
  if (!refreshToken) {
    res.status(400).json({ error: 'Missing "refresh_token" in request body' });
    return;
  }

  try {
    const tokenData = await refreshAccessToken(refreshToken);
    res.status(200).json({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      refresh_expires_in: tokenData.refresh_expires_in,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
