/**
 * Set CORS headers on response
 * @param {Object} res - Response object
 */
export function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Sentry-Host, X-Sentry-Organization, X-Sentry-Token, X-Atlassian-Domain, X-Jira-Token, X-Jira-Email',
  );
}

/**
 * Handle CORS preflight requests
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {boolean} True if handled, false otherwise
 */
export function handleCORSPreflight(req, res) {
  if (req.method === 'OPTIONS') {
    setCORSHeaders(res);
    res.status(200).end();
    return true;
  }
  return false;
}

/**
 * Get CORS headers as an object (for Netlify or manual use)
 */
export function getCORSHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Sentry-Host, X-Sentry-Organization, X-Sentry-Token, X-Atlassian-Domain, X-Jira-Token, X-Jira-Email',
  };
}

/**
 * Check if request is a CORS preflight (OPTIONS)
 * @param {Object} req - Request object (Express/Netlify)
 * @returns {boolean}
 */
export function isPreflightRequest(req) {
  // Express/Next: req.method; Netlify: event.httpMethod
  return req.method === 'OPTIONS' || req.httpMethod === 'OPTIONS';
}
