// GET  /api/zernio/profiles              -> list profiles
// GET  /api/zernio/profiles?includeOverLimit=true
// POST /api/zernio/profiles { name, description?, color? } -> create profile
//
// This route holds ZERNIO_API_KEY server-side and proxies for the
// extension, so the real Zernio key never ships in extension code.
const { listProfiles, createProfile, ZernioBillingError } = require('../../lib/zernio');

function billingErrorResponse(err) {
  // Mirrors Zernio's 402 shape so the extension can switch on `reason`
  // and, for free_tier_exceeded / twitter_passthrough, deep-link the user
  // to dashboardUrl to add a payment method; for enterprise_required,
  // deep-link to the enterprise contact page.
  return {
    error: err.message,
    code: err.code,
    reason: err.reason,
    documentation_url: err.documentationUrl,
    dashboard_url: err.dashboardUrl,
    details: err.details,
  };
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const includeOverLimit = req.query.includeOverLimit === 'true';
      const data = await listProfiles({ includeOverLimit });
      res.status(200).json(data);
      return;
    }

    if (req.method === 'POST') {
      const { name, description, color } = req.body || {};
      const data = await createProfile({ name, description, color });
      res.status(201).json(data);
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof ZernioBillingError) {
      res.status(402).json(billingErrorResponse(err));
      return;
    }
    res.status(400).json({ error: err.message });
  }
};
