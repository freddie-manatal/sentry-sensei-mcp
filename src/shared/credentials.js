const { Logger } = require('../utils/index.js');
const { TokenStorage } = require('./tokenStorage.js');

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');
const tokenStorage = new TokenStorage();

/**
 * Extract credentials from stored OAuth tokens only
 * @returns {Object} Credentials object
 */
async function extractCredentials() {
  const credentials = {
    sentry: {
      host: null,
      organization: null,
      token: null,
    },
    jira: {
      domain: null,
      token: null,
      email: null,
      cloudId: null,
      resourceId: null,
    },
  };

  // Get stored Sentry OAuth tokens
  try {
    const storedSentryToken = await tokenStorage.getSentryToken();
    if (storedSentryToken) {
      credentials.sentry.token = storedSentryToken.token;
      credentials.sentry.host = storedSentryToken.host;
      credentials.sentry.organization = storedSentryToken.org;
      logger.debug('Using stored Sentry OAuth token');
    }
  } catch (error) {
    logger.warn('Failed to retrieve stored Sentry token:', error);
  }

  // Get stored Atlassian OAuth tokens
  try {
    const storedAtlassianToken = await tokenStorage.getAtlassianOAuthToken();
    if (storedAtlassianToken) {
      credentials.jira.token = storedAtlassianToken.token;
      credentials.jira.domain = storedAtlassianToken.cloudId;
      credentials.jira.email = 'oauth-user@atlassian.local'; // OAuth doesn't need real email
      credentials.jira.cloudId = storedAtlassianToken.cloudId;
      credentials.jira.resourceId = storedAtlassianToken.resourceId;
      logger.debug('Using stored Atlassian OAuth token');
    }
  } catch (error) {
    logger.warn('Failed to retrieve stored Atlassian token:', error);
  }

  logger.debug('Extracted credentials:', {
    sentry: {
      host: credentials.sentry.host,
      organization: credentials.sentry.organization,
      token: credentials.sentry.token ? '***' : undefined,
      connected: !!credentials.sentry.token,
    },
    jira: {
      domain: credentials.jira.domain,
      email: credentials.jira.email,
      token: credentials.jira.token ? '***' : undefined,
      connected: !!credentials.jira.token,
    },
  });

  return credentials;
}

module.exports = {
  extractCredentials,
};
