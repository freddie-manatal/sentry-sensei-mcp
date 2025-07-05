const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');
const { JiraService } = require('../services/index.js');
const { Logger, JiraFormatter, TokenCounter } = require('../utils/index.js');

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

class JiraHandler {
  constructor(domain, token, email) {
    this.domain = domain;
    this.token = token;
    this.email = email;
    this.logger = new Logger(process.env.LOG_LEVEL || 'INFO');
  }

  // Helper method to get token counter with model from args
  getTokenCounter(args) {
    return new TokenCounter(args.model);
  }

  // Helper methods
  getToken() {
    return this.token || process.env.JIRA_ACCESS_TOKEN;
  }

  getAtlassianDomain() {
    return this.domain || process.env.ATLASSIAN_DOMAIN;
  }

  getJiraUserEmail() {
    return this.email || process.env.JIRA_USER_EMAIL;
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

  async getJiraTicketDetails(args) {
    const ticketKey = args.ticketKey;
    const deepDetails = args.deepDetails;

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
      logger.info(JSON.stringify(args, null, 2));
      const result = await jiraService.getJiraTicketDetails(ticketKey, deepDetails);

      logger.info(`Successfully fetched JIRA ticket details for: ${ticketKey}`);
      logger.debug(`JIRA ticket summary: ${result.summary}`);
      logger.debug(`JIRA ticket status: ${result.status} (${result.statusCategory})`);

      // Format the response for MCP
      const formattedResponse = JiraFormatter.formatJiraTicketResponse(result);

      if (!formattedResponse) {
        logger.warn('JiraFormatter returned null/undefined response');
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to format JIRA ticket details for ${ticketKey}: Empty response`
        );
      }

      logger.debug('Formatted JIRA result:', result);
      logger.debug('Response before token counting:', formattedResponse);
      logger.debug('Args before token counting:', args);

      const response = {
        content: [
          {
            type: 'text',
            text: formattedResponse,
          },
        ],
      };

      try {
        return this.getTokenCounter(args).addTokenCounts(response, args);
      } catch (error) {
        logger.error(`Error during token counting: ${error.message}`);
        // Return the response without token counts rather than failing completely
        return response;
      }
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
