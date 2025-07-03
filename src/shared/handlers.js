import { SentryHandler, JiraHandler } from '../mcp/index.js';
import DateTimeHandler from '../mcp/datetimeHandler.js';

/**
 * Create handler instances with the provided credentials
 * @param {Object} credentials - Credentials object containing sentry and jira properties
 * @returns {Object} Object containing sentryHandler and jiraHandler instances
 */
export function createHandlers(credentials) {
  const sentryHandler = new SentryHandler(
    credentials.sentry.host,
    credentials.sentry.organization,
    credentials.sentry.token,
  );

  const jiraHandler = new JiraHandler(
    credentials.jira.domain,
    credentials.jira.token,
    credentials.jira.email,
  );

  const datetimeHandler = new DateTimeHandler();

  return {
    sentryHandler,
    jiraHandler,
    datetimeHandler,
  };
}
