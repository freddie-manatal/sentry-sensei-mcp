const { Logger } = require('../utils/index.js');

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

/**
 * Extract credentials from request headers
 * @param {Object} req - Request object
 * @returns {Object} Credentials object
 */
function extractCredentials(req) {
  const headers = req.headers || {};

  const credentials = {
    sentry: {
      host: headers['x-sentry-host'] || process.env.SENTRY_HOST,
      organization:
        headers['x-sentry-organization'] ||
        process.env.SENTRY_ORG ||
        process.env.SENTRY_ORGANIZATION,
      token: headers['x-sentry-token'] || process.env.SENTRY_TOKEN,
    },
    jira: {
      domain: headers['x-atlassian-domain'] || process.env.ATLASSIAN_DOMAIN,
      token: headers['x-jira-token'] || process.env.JIRA_TOKEN,
      email: headers['x-jira-email'] || process.env.JIRA_EMAIL,
    },
  };

  logger.debug('Extracted credentials:', {
    sentry: {
      host: credentials.sentry.host,
      organization: credentials.sentry.organization,
      token: credentials.sentry.token ? '***' : undefined,
    },
    jira: {
      domain: credentials.jira.domain,
      email: credentials.jira.email,
      token: credentials.jira.token ? '***' : undefined,
    },
  });

  return credentials;
}

module.exports = {
  extractCredentials,
};
