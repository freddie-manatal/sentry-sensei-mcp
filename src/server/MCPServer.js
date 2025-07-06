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

    // Check authentication status first
    const credentials = await extractCredentials();
    const hasSentryAuth = !!(
      credentials.sentry.token &&
      credentials.sentry.host &&
      credentials.sentry.organization
    );
    const hasJiraAuth = !!(credentials.jira.token && credentials.jira.cloudId);

    // If no authentication, return empty tools list
    if (!hasSentryAuth && !hasJiraAuth) {
      this.logger.warn('No authentication found - hiding tools list');
      return {
        tools: [],
      };
    }

    // Filter tools based on available authentication
    const availableTools = [];

    if (hasSentryAuth) {
      const sentryTools = TOOL_DEFINITIONS.filter(
        tool => tool.name.includes('sentry') && ENABLED_TOOLS.includes(tool.name),
      );
      availableTools.push(...sentryTools);
    }

    if (hasJiraAuth) {
      const jiraTools = TOOL_DEFINITIONS.filter(
        tool => tool.name.includes('jira') && ENABLED_TOOLS.includes(tool.name),
      );
      availableTools.push(...jiraTools);
    }

    // Add service-agnostic tools if any auth is available
    const generalTools = TOOL_DEFINITIONS.filter(
      tool =>
        !tool.name.includes('sentry') &&
        !tool.name.includes('jira') &&
        ENABLED_TOOLS.includes(tool.name),
    );
    availableTools.push(...generalTools);

    this.logger.info(
      `Showing ${availableTools.length} tools (Sentry: ${hasSentryAuth}, Jira: ${hasJiraAuth})`,
    );

    return {
      tools: availableTools,
    };
  }

  /**
   * Execute a tool
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} toolArgs - Arguments for the tool
   * @param {Object} context - Request context (for credential extraction)
   * @returns {Object} Tool execution result
   */
  async callTool(toolName, toolArgs = {}) {
    if (!toolName) {
      throw new McpError(ErrorCode.InvalidParams, 'Tool name is required');
    }

    this.logger.info(`🔧 Executing tool: ${toolName}`);
    this.logger.debug('Tool arguments:', toolArgs);

    const startTime = Date.now();

    try {
      // Extract credentials from stored OAuth tokens
      const credentials = await extractCredentials();

      // Check authentication status
      const authStatus = this.checkAuthenticationStatus(credentials, toolName);
      if (!authStatus.canProceed) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Authentication required for ${authStatus.requiredService}. Please authenticate using: /v1/sse?service=${authStatus.requiredService}&org=your-org`,
          {
            missingAuth: authStatus.missingAuth,
            authUrls: {
              sentry: '/v1/sse?service=sentry&org=your-org',
              atlassian: '/v1/sse?service=atlassian&org=your-org',
            },
          },
        );
      }

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
          result = await sentryHandler.getIssues(toolArgs);
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

  /**
   * Check authentication status for tool execution
   * @param {Object} credentials - Extracted credentials
   * @param {string} toolName - Name of the tool being called
   * @returns {Object} Authentication status
   */
  checkAuthenticationStatus(credentials, toolName) {
    const sentryTools = [
      'get_sentry_organizations',
      'get_sentry_projects',
      'get_sentry_issues',
      'get_sentry_issue_details',
      'search_sentry_issues',
    ];

    const jiraTools = [
      'get_jira_projects',
      'get_jira_issues',
      'get_jira_issue_details',
      'create_jira_issue',
      'update_jira_issue',
      'add_jira_comment',
      'search_jira_issues',
    ];

    const hasSentryAuth = !!(
      credentials.sentry.token &&
      credentials.sentry.host &&
      credentials.sentry.organization
    );
    const hasJiraAuth = !!(credentials.jira.token && credentials.jira.cloudId);

    let requiredService = null;
    const missingAuth = [];

    if (sentryTools.includes(toolName) && !hasSentryAuth) {
      requiredService = 'sentry';
      missingAuth.push('sentry');
    }

    if (jiraTools.includes(toolName) && !hasJiraAuth) {
      requiredService = 'atlassian';
      missingAuth.push('atlassian');
    }

    // For tools that need both services, check both
    const needsBothServices = ['create_jira_issue']; // Tools that might use both
    if (needsBothServices.includes(toolName)) {
      if (!hasSentryAuth) missingAuth.push('sentry');
      if (!hasJiraAuth) missingAuth.push('atlassian');
      if (missingAuth.length > 0) {
        requiredService = missingAuth[0]; // Primary service needed
      }
    }

    return {
      canProceed: missingAuth.length === 0,
      requiredService,
      missingAuth,
      hasSentryAuth,
      hasJiraAuth,
    };
  }

  /**
   * Initialize authentication sessions on server start
   */
  async initializeAuthSessions() {
    this.logger.info('🔐 Checking authentication status...');

    const credentials = await extractCredentials();
    const hasSentryAuth = !!(
      credentials.sentry.token &&
      credentials.sentry.host &&
      credentials.sentry.organization
    );
    const hasJiraAuth = !!(credentials.jira.token && credentials.jira.cloudId);

    if (!hasSentryAuth || !hasJiraAuth) {
      this.logger.warn('⚠️  Authentication required for full functionality');

      const authUrls = [];

      if (!hasSentryAuth) {
        // Direct Sentry OAuth URL
        const sentryClientId = process.env.SENTRY_CLIENT_ID;
        if (sentryClientId) {
          const state = `sentry_${this.generateRandomString(16)}`;
          const sentryAuthUrl =
            `https://sentry.io/oauth/authorize/?` +
            `response_type=code&` +
            `client_id=${encodeURIComponent(sentryClientId)}&` +
            `redirect_uri=${encodeURIComponent(`${this.getServerBaseUrl()}/v1/callback`)}&` +
            `state=${encodeURIComponent(state)}&` +
            `scope=org:read,project:read,event:read,team:read`;
          authUrls.push(sentryAuthUrl);
          this.logger.info('🔑 Sentry authentication needed - opening official OAuth page');
        } else {
          this.logger.warn('⚠️  SENTRY_CLIENT_ID not configured - skipping Sentry auth');
        }
      }

      if (!hasJiraAuth) {
        // Direct Atlassian OAuth URL
        const atlassianClientId = process.env.ATLASSIAN_CLIENT_ID;
        if (atlassianClientId) {
          const scopes = 'read:jira-work read:jira-user write:jira-work read:account read:me';
          const state = `atlassian_${this.generateRandomString(16)}`;

          const atlassianAuthUrl =
            `https://auth.atlassian.com/authorize?` +
            `audience=api.atlassian.com&` +
            `client_id=${encodeURIComponent(atlassianClientId)}&` +
            `scope=${encodeURIComponent(scopes)}&` +
            `redirect_uri=${encodeURIComponent(`${this.getServerBaseUrl()}/v1/callback`)}&` +
            `state=${encodeURIComponent(state)}&` +
            `response_type=code&` +
            `prompt=consent`;
          authUrls.push(atlassianAuthUrl);
          this.logger.info('🔑 Atlassian authentication needed - opening official OAuth page');
        } else {
          this.logger.warn('⚠️  ATLASSIAN_CLIENT_ID not configured - skipping Atlassian auth');
        }
      }

      if (authUrls.length > 0) {
        this.logger.info('🚀 Auto-opening official OAuth pages for authentication...');
        this.logger.info('💡 Complete the OAuth process in your browser, then return to continue using MCP tools');
        await this.openAuthUrls(authUrls);
      }
    } else {
      this.logger.info('✅ All services authenticated successfully');
    }
  }

  /**
   * Get server base URL for OAuth redirects
   */
  getServerBaseUrl() {
    // Check for common environment variables
    const deployedUrl = process.env.URL || process.env.DEPLOY_URL;
    if (deployedUrl) {
      return deployedUrl;
    }

    // Default to localhost for development
    const port = process.env.PORT || 8888;
    return `http://localhost:${port}`;
  }

  /**
   * Generate a random string for OAuth state parameter
   */
  generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Open OAuth URLs in browser automatically
   */
  async openAuthUrls(urls) {
    try {
      const { exec } = require('child_process');

      for (const url of urls) {
        this.logger.info(`🌐 Opening: ${url}`);

        // Cross-platform browser opening
        const command =
          process.platform === 'darwin'
            ? `open "${url}"`
            : process.platform === 'win32'
              ? `start "${url}"`
              : `xdg-open "${url}"`;

        exec(command, error => {
          if (error) {
            this.logger.warn(`Failed to auto-open browser: ${error.message}`);
            this.logger.info(`Please manually visit: ${url}`);
          }
        });

        // Small delay between opening tabs
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      this.logger.info('💡 Complete OAuth in the opened browser tabs');
    } catch (error) {
      this.logger.error('Failed to open OAuth URLs:', error);
      this.logger.info('💡 Please manually visit the authentication URLs shown above');
    }
  }
}

module.exports = { MCPServer };
