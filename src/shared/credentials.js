import Logger from '../utils/Logger.js';

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

/**
 * Extract credentials from request headers and environment variables
 * @param {Object} req - Request object
 * @returns {Object} Extracted credentials
 */
export function extractCredentials(req) {
  const headers = req.headers || {};

  // Helper function to get header value (case-insensitive)
  const getHeader = name => {
    const lowerName = name.toLowerCase();
    return headers[lowerName] || headers[name] || headers[name.toUpperCase()];
  };

  const credentials = {
    sentry: {
      host: getHeader('x-sentry-host') || process.env.SENTRY_HOST || 'https://sentry.io',
      organization: getHeader('x-sentry-organization') || process.env.SENTRY_ORGANIZATION,
      token: getHeader('x-sentry-token') || process.env.SENTRY_TOKEN,
    },
    jira: {
      domain: getHeader('x-atlassian-domain') || process.env.ATLASSIAN_DOMAIN,
      token: getHeader('x-jira-token') || process.env.JIRA_ACCESS_TOKEN,
      email: getHeader('x-jira-email') || process.env.JIRA_USER_EMAIL,
    },
  };

  logger.debug('Extracted credentials:', {
    sentry: {
      host: credentials.sentry.host,
      organization: credentials.sentry.organization ? '[REDACTED]' : undefined,
      token: credentials.sentry.token ? '[REDACTED]' : undefined,
    },
    jira: {
      domain: credentials.jira.domain,
      token: credentials.jira.token ? '[REDACTED]' : undefined,
      email: credentials.jira.email,
    },
  });

  return credentials;
}
