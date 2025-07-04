const { JiraService } = require('../services/index.js');
const { DatetimeHandler, SentryHandler, JiraHandler } = require('../mcp/index.js');

/**
 * Create service handlers with credentials
 * @param {Object} credentials - Credentials object
 * @returns {Object} Service handlers
 */
function createHandlers(credentials) {
  const jiraService = new JiraService(credentials.jira);

  return {
    sentryHandler: new SentryHandler(
      credentials.sentry.host,
      credentials.sentry.organization,
      credentials.sentry.token
    ),
    jiraHandler: new JiraHandler(jiraService),
    datetimeHandler: new DatetimeHandler(),
  };
}

module.exports = {
  createHandlers,
};
