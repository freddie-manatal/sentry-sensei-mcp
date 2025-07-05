const { DatetimeHandler, SentryHandler, JiraHandler } = require('../handlers/index.js');

/**
 * Create service handlers with credentials
 * @param {Object} credentials - Credentials object
 * @returns {Object} Service handlers
 */
function createHandlers(credentials) {
  return {
    sentryHandler: new SentryHandler(
      credentials.sentry.host,
      credentials.sentry.organization,
      credentials.sentry.token,
    ),
    jiraHandler: new JiraHandler(
      credentials.jira.domain,
      credentials.jira.token,
      credentials.jira.email,
    ),
    datetimeHandler: new DatetimeHandler(),
  };
}

module.exports = {
  createHandlers,
};
