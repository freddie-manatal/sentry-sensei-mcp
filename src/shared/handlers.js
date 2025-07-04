const { SentryService, JiraService } = require('../services/index.js');
const { DatetimeHandler, SentryHandler, JiraHandler } = require('../mcp/index.js');

/**
 * Create service handlers with credentials
 * @param {Object} credentials - Credentials object
 * @returns {Object} Service handlers
 */
function createHandlers(credentials) {
  const sentryService = new SentryService(credentials.sentry);
  const jiraService = new JiraService(credentials.jira);

  return {
    sentryHandler: new SentryHandler(sentryService),
    jiraHandler: new JiraHandler(jiraService),
    datetimeHandler: new DatetimeHandler(),
  };
}

module.exports = {
  createHandlers,
};
