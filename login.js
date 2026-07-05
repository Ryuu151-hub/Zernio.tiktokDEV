// GET /api/auth/tiktok/login?state=<csrf-token>
//
// The extension opens this URL (via chrome.identity.launchWebAuthFlow).
// It 302s the user to TikTok's consent screen. TikTok then redirects back
// to TIKTOK_REDIRECT_URI (the extension's chrome-extension redirect page)
// with ?code=...&state=...
const { buildAuthorizeUrl } = require('../../../lib/tiktok');

module.exports = (req, res) => {
  try {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const url = buildAuthorizeUrl({
      state,
      scope: 'user.info.basic,video.publish',
    });
    res.writeHead(302, { Location: url });
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
