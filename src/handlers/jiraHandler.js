const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');
const { JiraService } = require('../services/index.js');
const { Logger, JiraFormatter, ErrorHandler, schemas } = require('../utils/index.js');
const { TOOL_NAMES } = require('../tools/constants.js');
const { JiraTicketDetailsSchema, validateSchema } = schemas;

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

class JiraHandler {
  constructor(domain, token, email) {
    this.domain = domain;
    this.token = token;
    this.email = email;
    this.logger = new Logger(process.env.LOG_LEVEL || 'INFO');
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
    try {
      const validatedArgs = validateSchema(
        JiraTicketDetailsSchema,
        args,
        TOOL_NAMES.GET_JIRA_TICKET_DETAILS,
      );
      const { ticketKey, deepDetails } = validatedArgs;

      if (!ticketKey) {
        return 'Error: JIRA ticket key is required (e.g., "MAN-1234", "BUG-4774")';
      }

      const jiraService = this.createJiraService();
      logger.info(`Fetching JIRA ticket details for: ${ticketKey}`);

      const result = await jiraService.getJiraTicketDetails(ticketKey, deepDetails);
      logger.info(`Successfully fetched JIRA ticket details for: ${ticketKey}`);

      const formattedResponse = JiraFormatter.formatJiraTicketResponse(result);
      if (!formattedResponse) {
        return `Error: Failed to format JIRA ticket ${ticketKey}. The ticket may be empty or corrupted.`;
      }

      return formattedResponse;
    } catch (error) {
      return ErrorHandler.handleError(error, TOOL_NAMES.GET_JIRA_TICKET_DETAILS);
    }
  }
}

module.exports = JiraHandler;
