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
    const deepDetails = args.deepDetails || false; // Default to false for cost optimization

    if (!ticketKey) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: JIRA ticket key is required (e.g., "MAN-1234", "BUG-4774")',
          },
        ],
      };
    }

    try {
      const jiraService = this.createJiraService();
      logger.info(`Fetching JIRA ticket details for: ${ticketKey}`);

      try {
        const result = await jiraService.getJiraTicketDetails(ticketKey, deepDetails);
        logger.info(`Successfully fetched JIRA ticket details for: ${ticketKey}`);

        const formattedResponse = JiraFormatter.formatJiraTicketResponse(result);
        if (!formattedResponse) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Failed to format JIRA ticket ${ticketKey}. The ticket may be empty or corrupted.`,
              },
            ],
          };
        }

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
        } catch (tokenError) {
          logger.warn(`Token counting failed: ${tokenError.message}`);
          return response;
        }
      } catch (error) {
        // Handle specific JIRA API errors
        if (error.status === 404) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: JIRA ticket ${ticketKey} not found. Please check if the ticket exists and you have permission to view it.`,
              },
            ],
          };
        }
        if (error.status === 401 || error.status === 403) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Authentication failed. Please check your JIRA credentials and permissions.`,
              },
            ],
          };
        }
        if (error.status === 400) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Invalid request. Please check if the ticket key "${ticketKey}" is correct.`,
              },
            ],
          };
        }
        if (error.status === 500) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: JIRA server error. Please try again later.\nDetails: ${error.message}`,
              },
            ],
          };
        }

        // Generic error handler
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching JIRA ticket: ${error.message}\n\nPlease try again or contact support if the issue persists.`,
            },
          ],
        };
      }
    } catch (error) {
      logger.error(`Error in getJiraTicketDetails: ${error.message}`);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to process your request: ${error.message}\n\nPlease check your JIRA configuration and try again.`,
          },
        ],
      };
    }
  }
}

module.exports = JiraHandler;
