const { TOOL_DEFINITIONS, TOOL_NAMES } = require('../tools/index.js');
const { Logger } = require('../utils/index.js');
const { extractCredentials } = require('./credentials');
const { createHandlers } = require('./handlers');
const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

/**
 * Process MCP requests and return appropriate responses
 * @param {Object} req - Request object (Netlify event)
 * @param {Object} body - Parsed request body
 * @returns {Object} Response object with status and body
 */
async function processMCPRequest(req, body) {
  const { jsonrpc, method, params, id } = body || {};

  logger.info('Processing MCP method:', method);
  logger.debug('Request params:', params);

  // Validate JSON-RPC format
  if (!jsonrpc || jsonrpc !== '2.0') {
    return {
      status: 400,
      body: {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request - JSON-RPC 2.0 format required',
        },
        id: id || null,
      },
    };
  }

  // Validate method is provided
  if (!method) {
    return {
      status: 400,
      body: {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request - method is required',
        },
        id: id || null,
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

    // Validate tool call parameters
    if (!toolName) {
      return {
        status: 400,
        body: {
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Invalid params - tool name is required',
          },
          id: id || null,
        },
      };
    }

    logger.info(`Executing tool: ${toolName}`);
    logger.debug('Tool arguments:', toolArgs);

    try {
      // Extract credentials from headers for this request
      const credentials = extractCredentials(req);
      const { sentryHandler, jiraHandler, datetimeHandler } = createHandlers(credentials);

      let result;

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
          if (!toolArgs?.ticketKey) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'ticketKey is required for JIRA ticket details',
            );
          }
          result = await jiraHandler.getJiraTicketDetails(toolArgs);
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
          return {
            status: 404,
            body: {
              jsonrpc: '2.0',
              error: {
                code: -32601,
                message: `Method not found: ${toolName}`,
              },
              id: id || null,
            },
          };
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

      // Handle different error types appropriately
      if (toolError instanceof McpError) {
        return {
          status: 400,
          body: {
            jsonrpc: '2.0',
            error: {
              code: toolError.code,
              message: toolError.message,
            },
            id: id || null,
          },
        };
      }

      // Generic error handling
      return {
        status: 500,
        body: {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: process.env.NODE_ENV === 'development' ? toolError.message : undefined,
          },
          id: id || null,
        },
      };
    }
  }

  logger.warn(`Unknown method: ${method}`);
  return {
    status: 404,
    body: {
      jsonrpc: '2.0',
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
      id: id || null,
    },
  };
}

module.exports = { processMCPRequest };
