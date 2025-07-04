const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');
const Logger = require('../utils/Logger');
const JiraFormatter = require('../utils/JiraFormatter');
const JiraService = require('../services/JiraService');

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

class JiraHandler {
  constructor(atlassianDomain, jiraAccessToken, jiraUserEmail) {
    this.jiraAccessToken = jiraAccessToken;
    this.atlassianDomain = atlassianDomain;
    this.jiraUserEmail = jiraUserEmail;
  }

  // Helper methods
  getToken() {
    return this.jiraAccessToken || process.env.JIRA_ACCESS_TOKEN;
  }

  getAtlassianDomain() {
    return this.atlassianDomain || process.env.ATLASSIAN_DOMAIN;
  }

  getJiraUserEmail() {
    return this.jiraUserEmail || process.env.JIRA_USER_EMAIL;
  }

  createJiraService() {
    const token = this.getToken();
    const domain = this.getAtlassianDomain();
    const userEmail = this.getJiraUserEmail();

    if (!token) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'JIRA API token is required. Provide it as a parameter, pass --jiraAccessToken argument, or set JIRA_ACCESS_TOKEN environment variable.',
      );
    }

    if (!domain) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'JIRA domain is required. Provide it as a parameter, pass --atlassianDomain argument, or set ATLASSIAN_DOMAIN environment variable.',
      );
    }

    if (!userEmail) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'JIRA user email is required. Provide it as a parameter, pass --jiraUserEmail argument, or set JIRA_USER_EMAIL environment variable.',
      );
    }

    return new JiraService(domain, token, userEmail);
  }

  async getJiraTicketDetails(ticketKey) {
    if (!ticketKey) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "JIRA ticket key is required (e.g., 'MAN-1234', 'BUG-4774')",
      );
    }
    logger.info(`Fetching JIRA ticket details for: ${ticketKey}`);

    try {
      const jiraService = this.createJiraService();
      logger.debug(`Created JIRA service with domain: ${jiraService.atlassianDomain}`);
      logger.debug(`API base URL: ${jiraService.apiBase}`);

      const result = await jiraService.getJiraTicketDetails(ticketKey);

      logger.info(`Successfully fetched JIRA ticket details for: ${ticketKey}`);
      logger.debug(`JIRA ticket summary: ${result.summary}`);
      logger.debug(`JIRA ticket status: ${result.status} (${result.statusCategory})`);

      // Format the response for MCP
      const formattedResponse = JiraFormatter.formatJiraTicketResponse(result);

      return {
        content: [
          {
            type: 'text',
            text: formattedResponse,
          },
        ],
      };
    } catch (error) {
      logger.error(`Failed to fetch JIRA ticket details for ${ticketKey}: ${error.message}`);
      logger.debug('Error details:', error.stack);

      // Convert to McpError for consistent error handling
      if (error instanceof McpError) {
        throw error;
      }

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch JIRA ticket details for ${ticketKey}: ${error.message}`,
      );
    }
  }
}

module.exports = JiraHandler;
