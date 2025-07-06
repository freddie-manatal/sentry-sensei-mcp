#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const { config } = require('dotenv');
const { Logger } = require('../../utils/index.js');
const { MCPServer } = require('../MCPServer.js');

config();

/**
 * Stdio transport implementation for MCP server
 * Uses the standard MCP SDK for stdio communication
 */
class StdioTransport {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(process.env.LOG_LEVEL || 'INFO');
    this.mcpServer = new MCPServer(options);

    // Create SDK server instance
    this.server = new Server(
      {
        name: this.mcpServer.serverInfo.name,
        version: this.mcpServer.serverInfo.version,
      },
      {
        capabilities: this.mcpServer.capabilities,
      },
    );

    this.setupErrorHandling();
    this.setupToolHandlers();
  }

  setupErrorHandling() {
    this.server.onerror = error => this.logger.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      this.logger.info('Shutting down MCP server...');
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
      const result = await this.mcpServer.listTools();
      return result;
    });
  }

  setupCallToolHandler() {
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.mcpServer.callTool(name, args);
        return result;
      } catch (error) {
        this.logger.error('Error in tool call:', error);
        throw error;
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Initialize authentication sessions
    await this.mcpServer.initializeAuthSessions();

    // Only log to stderr in non-MCP mode, or to log file in MCP mode
    if (!this.logger.isMCPMode()) {
      console.error('Sentry Sensei MCP server running on stdio');
    } else {
      this.logger.info('Sentry Sensei MCP server started in MCP mode');
      if (this.logger.getLogFilePath()) {
        this.logger.info(`📁 Logs are being written to: ${this.logger.getLogFilePath()}`);
      }
    }
  }
}

module.exports = { StdioTransport };
