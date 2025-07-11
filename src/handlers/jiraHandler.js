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
        TOOL_NAMES.GET_JIRA_ISSUE_DETAILS,
      );
      const { ticketKey, deepDetails } = validatedArgs;

      if (!ticketKey) {
        return 'Error: JIRA ticket key is required (e.g., "MAN-1234", "BUG-4774")';
      }

      console.info('JIRA Handler: Creating service...');
      const jiraService = this.createJiraService();
      console.info('JIRA Handler: Service created successfully');
      logger.info(`Fetching JIRA ticket details for: ${ticketKey}`);
      console.info('JIRA Handler: About to call service method...');

      const result = await jiraService.getJiraTicketDetails(ticketKey, deepDetails);
      logger.info(`Successfully fetched JIRA ticket details for: ${ticketKey}`);

      // Debug logging to understand the data structure
      logger.debug('JIRA service result structure:', {
        hasKey: !!result?.key,
        hasSummary: !!result?.summary,
        resultType: typeof result,
        resultKeys: result ? Object.keys(result) : 'null',
      });

      const formattedResponse = JiraFormatter.formatJiraTicketResponse(result);
      console.info(
        'JIRA Handler: About to return response, length:',
        formattedResponse?.length || 0,
      );

      if (!formattedResponse) {
        return `Error: Failed to format JIRA ticket ${ticketKey}. The ticket may be empty or corrupted.`;
      }

      console.info('JIRA Handler: Returning formatted response successfully');
      return formattedResponse;
    } catch (error) {
      return ErrorHandler.handleError(error, TOOL_NAMES.GET_JIRA_ISSUE_DETAILS);
    }
  }

  async getJiraFields(args) {
    try {
      const {
        ticketKey,
        showOnlyEditable = true,
        includeCustomFields = true,
        specificFields,
      } = args;

      if (!ticketKey) {
        return 'Error: JIRA ticket key is required (e.g., "MAN-1234", "BUG-4774")';
      }

      const jiraService = this.createJiraService();
      logger.info(`Fetching JIRA fields for: ${ticketKey}`);

      const result = await jiraService.getJiraIssueFieldsForTicket(
        ticketKey,
        showOnlyEditable,
        includeCustomFields,
        specificFields,
      );
      logger.info(`Successfully fetched JIRA fields for: ${ticketKey}`);

      return this.formatFieldsResponse(result, specificFields);
    } catch (error) {
      return ErrorHandler.handleError(error, TOOL_NAMES.GET_JIRA_FIELDS);
    }
  }

  async editJiraTicket(args) {
    try {
      const { ticketKey, fields } = args;

      if (!ticketKey) {
        return 'Error: JIRA ticket key is required (e.g., "MAN-1234", "BUG-4774")';
      }

      if (!fields || Object.keys(fields).length === 0) {
        return 'Error: Fields to update are required. Use GET_JIRA_FIELDS first to see available fields.';
      }

      const jiraService = this.createJiraService();
      logger.info(`Updating JIRA ticket: ${ticketKey}`);

      const result = await jiraService.editJiraTicket(ticketKey, fields);
      logger.info(`Successfully updated JIRA ticket: ${ticketKey}`);

      return this.formatUpdateResponse(result);
    } catch (error) {
      return ErrorHandler.handleError(error, TOOL_NAMES.EDIT_JIRA_ISSUE);
    }
  }

  formatFieldsResponse(result, specificFields = null) {
    const { ticketKey, ticketSummary, essentialFields, customFields, fieldCount } = result;

    let response = `## JIRA Fields for ${ticketKey}\n`;
    response += `**Summary:** ${ticketSummary}\n`;

    if (specificFields && specificFields.length > 0) {
      response += `**Filtered Fields:** Showing only ${specificFields.join(', ')}\n\n`;
    } else {
      response += `**Field Count:** ${fieldCount.total} total (${fieldCount.essential} essential, ${fieldCount.custom} custom)\n\n`;
    }

    if (essentialFields.length > 0) {
      response += `### Essential Fields\n`;
      essentialFields.forEach(field => {
        response += this.formatFieldDetails(field);
      });
    }

    if (customFields.length > 0) {
      response += `### Custom Fields\n`;
      customFields.forEach(field => {
        response += this.formatFieldDetails(field);
      });
    }

    response += `\n**Usage:** Use the field keys or names in the EDIT_JIRA_ISSUE tool to update this ticket.`;

    return response;
  }

  formatFieldDetails(field) {
    let fieldResponse = `**${field.name}** (${field.key})\n`;
    fieldResponse += `- Type: ${field.type}\n`;
    fieldResponse += `- Required: ${field.required ? 'Yes' : 'No'}\n`;
    fieldResponse += `- Current Value: ${field.currentValue || 'None'}\n`;

    if (field.allowedValues && field.allowedValues.length > 0) {
      const allowedValuesString = field.allowedValues.map(v => v.name || v).join(', ');
      if (allowedValuesString.length > 200) {
        fieldResponse += `- Allowed Values: ${allowedValuesString.substring(0, 200)}... (${field.allowedValues.length} total options)\n`;
      } else {
        fieldResponse += `- Allowed Values: ${allowedValuesString}\n`;
      }
    }

    fieldResponse += `\n`;
    return fieldResponse;
  }

  formatUpdateResponse(result) {
    const { success, ticketKey, updatedFields, skippedFields, message } = result;

    let response = `## JIRA Update Result for ${ticketKey}\n`;
    response += `**Status:** ${success ? 'Success' : 'Failed'}\n`;
    response += `**Message:** ${message}\n\n`;

    if (updatedFields.length > 0) {
      response += `**Updated Fields:** ${updatedFields.join(', ')}\n`;
    }

    if (skippedFields.length > 0) {
      response += `**Skipped Fields:** ${skippedFields.join(', ')}\n`;
      response += `**Tip:** Use GET_JIRA_FIELDS to see available fields for this ticket.\n`;
    }

    return response;
  }
}

module.exports = JiraHandler;
