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
