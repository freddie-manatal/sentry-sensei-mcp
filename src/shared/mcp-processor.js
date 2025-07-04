import { TOOL_DEFINITIONS, TOOL_NAMES } from '../tools/index.js';
import { Logger } from '../utils/index.js';
import { extractCredentials } from './credentials.js';
import { createHandlers } from './handlers.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

/**
 * Process MCP requests and return appropriate responses
 * @param {Object} req - Request object
 * @param {Object} body - Request body
 * @returns {Object} Response object
 */
export async function processMCPRequest(req, body) {
  const { jsonrpc, method, params, id } = body || {};

  logger.info('Processing MCP method:', method);

  if (jsonrpc !== '2.0') {
    return {
      status: 400,
      body: {
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id,
      },
    };
  }

  if (method === 'initialize') {
    logger.info('Initializing MCP server');

    return {
      status: 200,
      body: {
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: true },
          },
          serverInfo: {
            name: 'sentry-sensei-mcp',
            version: '1.0.0',
          },
        },
        id,
      },
    };
  }

  if (method === 'notifications/initialized') {
    logger.info('Received initialized notification');

    return {
      status: 200,
      body: null, // No response body for notifications
    };
  }

  if (method === 'tools/list') {
    logger.info('Listing available tools');
    return {
      status: 200,
      body: {
        jsonrpc: '2.0',
        result: {
          tools: TOOL_DEFINITIONS,
        },
        id,
      },
    };
  }

  if (method === 'tools/call') {
    const { name: toolName, arguments: toolArgs } = params || {};
    logger.info(`Executing tool: ${toolName}`);
    logger.info('Tool arguments:', toolArgs);
    // Extract credentials from headers for this request
    const credentials = extractCredentials(req);
    const { sentryHandler, jiraHandler, datetimeHandler } = createHandlers(credentials);

    let result;

    try {
      switch (toolName) {
        case TOOL_NAMES.GET_SENTRY_ORGANIZATIONS:
          result = await sentryHandler.getOrganizations(toolArgs || {});
          break;

        case TOOL_NAMES.GET_SENTRY_PROJECTS:
          result = await sentryHandler.getProjects(toolArgs || {});
          break;

        case TOOL_NAMES.GET_SENTRY_ISSUES:
          result = await sentryHandler.getIssues(toolArgs || {});
          break;

        case TOOL_NAMES.GET_JIRA_TICKET_DETAILS:
          logger.info(`🎟️ Executing JIRA ticket details: ${JSON.stringify(toolArgs)}`);
          result = await jiraHandler.getJiraTicketDetails(toolArgs.ticketKey);
          break;

        case TOOL_NAMES.GET_CURRENT_DATETIME:
          logger.info(`📅 Executing current datetime: ${JSON.stringify(toolArgs)}`);
          result = await datetimeHandler.getCurrentDateTime(toolArgs);
          break;

        case TOOL_NAMES.GET_SENTRY_ISSUE_DETAILS:
          logger.info(`🔍 Executing Sentry issue details: ${JSON.stringify(toolArgs)}`);
          result = await sentryHandler.getSentryIssueDetails(toolArgs);
          break;

        default:
          logger.warn(`❌ Unknown tool: ${toolName}`);
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
      }

      logger.info(`Tool ${toolName} executed successfully`);
      return {
        status: 200,
        body: {
          jsonrpc: '2.0',
          result,
          id,
        },
      };
    } catch (toolError) {
      logger.error(`❌ Error executing tool ${toolName}:`, toolError.message);
      logger.debug('Tool error details:', toolError.stack);

      if (toolError instanceof McpError) {
        throw toolError;
      }

      throw new McpError(ErrorCode.InternalError, `Error executing tool: ${toolError.message}`);
    }
  }

  logger.warn(`Unknown method: ${method}`);
  return {
    status: 400,
    body: {
      jsonrpc: '2.0',
      error: { code: -32601, message: `Method not found: ${method}` },
      id,
    },
  };
}
