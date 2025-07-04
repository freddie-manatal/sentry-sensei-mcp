#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from 'dotenv';
import { Logger } from './utils/index.js';
import { TOOL_NAMES, TOOL_DEFINITIONS } from './tools/index.js';
import { SentryHandler, JiraHandler } from './mcp/index.js';

config();

// Create global logger instance
const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

// Parse command line arguments
const args = process.argv.slice(2);

// Helper function to get argument value
function getArgValue(argName) {
  const index = args.indexOf(argName);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Sentry Sensei MCP Server

Usage: node src/index.js [options]

Options:
  --token <token>              Sentry API token
  --sentryHost <host>          Sentry host domain (default: sentry.io)
  --organization <org>         Default organization slug
  --jiraAccessToken <token>    JIRA API token
  --atlassianDomain <domain>        JIRA domain (default: jira.com)
  --jiraUserEmail <email>      JIRA user email
  --help, -h                   Show this help message

Environment Variables:
  SENTRY_TOKEN                 Sentry API token (alternative to --token)
  LOG_LEVEL                    Log level (DEBUG, INFO, WARN, ERROR) - default: INFO
  MCP_MODE                     Set to 'true' to force MCP mode (logs to ~/.sentry-mcp-logs/)
  JIRA_ACCESS_TOKEN            JIRA API token (alternative to --jiraAccessToken)
  ATLASSIAN_DOMAIN              JIRA domain (alternative to --atlassianDomain)
  JIRA_USER_EMAIL              JIRA user email (alternative to --jiraUserEmail)

Examples:
  node src/index.js --token your_token --sentryHost your-org.sentry.io --organization your-org --jiraAccessToken your_jira_token --atlassianDomain jira.com --jiraUserEmail your_jira_email
  `);
  process.exit(0);
}

// Parse CLI arguments
const CLI_TOKEN = getArgValue('--token');
const CLI_SENTRY_HOST = getArgValue('--sentryHost');
const CLI_ORGANIZATION = getArgValue('--organization');
const CLI_JIRA_ACCESS_TOKEN = getArgValue('--jiraAccessToken');
const CLI_ATLASSIAN_DOMAIN = getArgValue('--atlassianDomain');
const CLI_JIRA_USER_EMAIL = getArgValue('--jiraUserEmail');

class SentryMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'sentry-sensei-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Initialize Sentry handler
    this.sentryHandler = new SentryHandler(
      CLI_SENTRY_HOST || 'sentry.io',
      CLI_ORGANIZATION,
      CLI_TOKEN,
    );

    // Initialize Jira handler
    this.jiraHandler = new JiraHandler(
      CLI_ATLASSIAN_DOMAIN,
      CLI_JIRA_ACCESS_TOKEN,
      CLI_JIRA_USER_EMAIL,
    );

    this.setupErrorHandling();
    this.setupToolHandlers();
  }

  setupErrorHandling() {
    this.server.onerror = error => logger.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      logger.info('Shutting down MCP server...');
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.setupListToolsHandler();
    this.setupCallToolHandler();
  }

  setupListToolsHandler() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: TOOL_DEFINITIONS };
    });
  }

  setupCallToolHandler() {
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      const startTime = Date.now();

      this.logToolStart(name, args);

      try {
        const result = await this.handleToolCall(name, args);
        this.logToolSuccess(name, startTime);
        return result;
      } catch (error) {
        console.error('Error:', error);
        this.logToolError(name, startTime, error);
        throw this.wrapToolError(name, error);
      }
    });
  }

  async handleToolCall(name, args) {
    switch (name) {
      case TOOL_NAMES.GET_SENTRY_ORGANIZATIONS:
        return await this.sentryHandler.getOrganizations(args);
      case TOOL_NAMES.GET_SENTRY_PROJECTS:
        return await this.sentryHandler.getProjects(args);
      case TOOL_NAMES.GET_SENTRY_ISSUES:
        return await this.sentryHandler.getIssues(args);
      case TOOL_NAMES.GET_JIRA_TICKET_DETAILS:
        return await this.jiraHandler.getJiraTicketDetails(args.ticketKey);
      case TOOL_NAMES.GET_SENTRY_ISSUE_DETAILS:
        return await this.sentryHandler.getSentryIssueDetails(args);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  }

  logToolStart(name, args) {
    logger.info(`🔧 Tool called: ${name}`);
    logger.debug('📋 Tool parameters:', args);
  }

  logToolSuccess(name, startTime) {
    const elapsed = Date.now() - startTime;
    logger.info(`✅ Tool ${name} completed successfully in ${elapsed}ms`);
  }

  logToolError(name, startTime, error) {
    const elapsed = Date.now() - startTime;
    logger.error(`❌ Tool ${name} failed after ${elapsed}ms:`, error.message);
  }

  wrapToolError(name, error) {
    if (error instanceof McpError) {
      return error;
    }
    return new McpError(ErrorCode.InternalError, `Error executing tool ${name}: ${error.message}`);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Only log to stderr in non-MCP mode, or to log file in MCP mode
    if (!logger.isMCPMode()) {
      console.error('Sentry Sensei MCP server running on stdio');
    } else {
      // TODO: Add MCP mode logging to a file
      logger.info('Sentry Sensei MCP server started in MCP mode');
      if (logger.getLogFilePath()) {
        logger.info(`📁 Logs are being written to: ${logger.getLogFilePath()}`);
      }
    }
  }
}

// Start the server
const server = new SentryMCPServer();
server.run().catch(error => {
  if (logger.isMCPMode()) {
    logger.error('Server startup failed:', error);
  } else {
    console.error('Server startup failed:', error);
  }
  process.exit(1);
});
