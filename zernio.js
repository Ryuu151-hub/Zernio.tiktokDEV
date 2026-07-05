// lib/zernio.js
//
// Minimal client for Zernio's profile endpoints, per Zernio's API reference
// (https://docs.zernio.com). Server-side only — ZERNIO_API_KEY should never
// be exposed to the extension; the extension talks to our own /api/zernio/*
// routes instead, and those routes attach the key.

const ZERNIO_BASE_URL = 'https://zernio.com/api/v1';

class ZernioBillingError extends Error {
  constructor(payload) {
    super(payload.error || 'Zernio billing gate');
    this.name = 'ZernioBillingError';
    this.code = payload.code;
    this.reason = payload.reason; // free_tier_exceeded | twitter_passthrough | enterprise_required
    this.documentationUrl = payload.documentation_url;
    this.dashboardUrl = payload.dashboard_url;
    this.details = payload.details || {};
  }
}

function requireApiKey() {
  const key = process.env.sk_efb6e47f5ef22920c4c227ed88adbc67611301f0241a37a27a3bd17db348206c;
  if (!key) throw new Error('Missing required environment variable: sk_efb6e47f5ef22920c4c227ed88adbc67611301f0241a37a27a3bd17db348206c');
  return key;
}

async function zernioRequest(path, options = {}) {
  const apiKey = requireApiKey();

  const res = await fetch(`${ZERNIO_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 402) {
    // Billing gate: free_tier_exceeded, twitter_passthrough, or
    // enterprise_required. Let the caller decide what to show the user.
    throw new ZernioBillingError(data);
  }

  if (!res.ok) {
    const message = data.error || `Zernio request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}

/** GET /v1/profiles */
function listProfiles({ includeOverLimit } = {}) {
  const query = includeOverLimit ? '?includeOverLimit=true' : '';
  return zernioRequest(`/profiles${query}`, { method: 'GET' });
}

/** POST /v1/profiles */
function createProfile({ name, description, color }) {
  if (!name) throw new Error('name is required to create a Zernio profile');
  return zernioRequest('/profiles', {
    method: 'POST',
    body: JSON.stringify({ name, description, color }),
  });
}

module.exports = {
  listProfiles,
  createProfile,
  ZernioBillingError,
};
