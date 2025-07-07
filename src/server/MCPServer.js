const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');
const { TOOL_DEFINITIONS, TOOL_NAMES, ENABLED_TOOLS } = require('../tools/index.js');
const { Logger } = require('../utils/index.js');
const { extractCredentials } = require('../shared/credentials');
const { createHandlers } = require('../shared/handlers');
const { getVersion } = require('../utils/version.js');

/**
 * Core MCP Server class - transport-agnostic implementation
 * Handles all MCP protocol methods and tool execution
 */
class MCPServer {
  constructor(options = {}) {
    this.logger = new Logger(process.env.LOG_LEVEL || 'INFO');
    this.serverInfo = {
      name: 'sentry-sensei-mcp',
      version: getVersion(),
      ...options.serverInfo,
    };
    this.capabilities = {
      tools: { listChanged: true },
      ...options.capabilities,
    };
  }

  /**
   * Initialize MCP server
   * @returns {Object} Initialize response
   */
  async initialize() {
    this.logger.info('Initializing MCP server');

    return {
      protocolVersion: '2024-11-05',
      capabilities: this.capabilities,
      serverInfo: this.serverInfo,
    };
  }

  /**
   * Handle initialized notification
   */
  async initialized() {
    this.logger.info('Received initialized notification');
    // No response needed for notifications
  }

  /**
   * List available tools
   * @returns {Object} Tools list response
   */
  async listTools() {
    this.logger.info('Listing available tools');

    return {
      tools: TOOL_DEFINITIONS.filter(tool => ENABLED_TOOLS.includes(tool.name)),
    };
  }

  /**
   * Execute a tool
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} toolArgs - Arguments for the tool
   * @param {Object} context - Request context (for credential extraction)
   * @returns {Object} Tool execution result
   */
  async callTool(toolName, toolArgs = {}, context = {}) {
    if (!toolName) {
      throw new McpError(ErrorCode.InvalidParams, 'Tool name is required');
    }

    this.logger.info(`🔧 Executing tool: ${toolName}`);
    this.logger.debug('Tool arguments:', toolArgs);

    const startTime = Date.now();

    try {
      // Extract credentials from context (headers, env, etc.)
      const credentials = extractCredentials(context);
      const { sentryHandler, jiraHandler, datetimeHandler } = createHandlers(credentials);

      let result;

      switch (toolName) {
        case TOOL_NAMES.GET_SENTRY_ORGANIZATIONS:
          result = await sentryHandler.getOrganizations(toolArgs);
          break;

        case TOOL_NAMES.GET_SENTRY_PROJECTS:
          result = await sentryHandler.getProjects(toolArgs);
          break;

        case TOOL_NAMES.GET_SENTRY_ISSUES:
          result = await sentryHandler.getSentryIssuesList(toolArgs);
          break;

        case TOOL_NAMES.GET_JIRA_TICKET_DETAILS:
          this.logger.info(`🎟️ Executing JIRA ticket details: ${JSON.stringify(toolArgs)}`);
          if (!toolArgs?.ticketKey) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'ticketKey is required for JIRA ticket details',
            );
          }
          result = await jiraHandler.getJiraTicketDetails(toolArgs);
          break;

        case TOOL_NAMES.GET_CURRENT_DATETIME:
          this.logger.info(`📅 Executing current datetime: ${JSON.stringify(toolArgs)}`);
          result = await datetimeHandler.getCurrentDateTime(toolArgs);
          break;

        case TOOL_NAMES.GET_SENTRY_ISSUE_DETAILS:
          this.logger.info(`🔍 Executing Sentry issue details: ${JSON.stringify(toolArgs)}`);
          result = await sentryHandler.getSentryIssueDetails(toolArgs);
          break;

        default:
          this.logger.warn(`❌ Unknown tool: ${toolName}`);
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
      }

      const elapsed = Date.now() - startTime;
      this.logger.info(`✅ Tool ${toolName} completed successfully in ${elapsed}ms`);

      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      this.logger.error(`❌ Tool ${toolName} failed after ${elapsed}ms:`, error.message);
      this.logger.debug('Tool error details:', error.stack);

      // Re-throw MCP errors as-is
      if (error instanceof McpError) {
        throw error;
      }

      // Wrap other errors
      throw new McpError(
        ErrorCode.InternalError,
        `Error executing tool ${toolName}: ${error.message}`,
      );
    }
  }

  /**
   * Process MCP request for HTTP/serverless transports
   * @param {Object} req - Request object (for credential extraction)
   * @param {Object} body - Parsed request body
   * @returns {Object} Response object with status and body
   */
  async processRequest(req, body) {
    const { jsonrpc, method, params, id } = body || {};

    this.logger.info('Processing MCP method:', method);
    this.logger.debug('Request params:', params);

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

    try {
      let result;

      switch (method) {
        case 'initialize':
          result = await this.initialize();
          break;

        case 'notifications/initialized':
          await this.initialized();
          return {
            status: 200,
            body: null, // No response body for notifications
          };

        case 'tools/list':
          result = await this.listTools();
          break;

        case 'tools/call':
          const { name: toolName, arguments: toolArgs } = params || {};
          result = await this.callTool(toolName, toolArgs, req);
          break;

        default:
          this.logger.warn(`Unknown method: ${method}`);
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

      return {
        status: 200,
        body: {
          jsonrpc: '2.0',
          result,
          id,
        },
      };
    } catch (error) {
      this.logger.error(`❌ Error processing ${method}:`, error.message);
      this.logger.debug('Error details:', error.stack);

      // Handle different error types appropriately
      if (error instanceof McpError) {
        return {
          status: 400,
          body: {
            jsonrpc: '2.0',
            error: {
              code: error.code,
              message: error.message,
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
            data: process.env.NODE_ENV === 'development' ? error.message : undefined,
          },
          id: id || null,
        },
      };
    }
  }
}

module.exports = { MCPServer };
