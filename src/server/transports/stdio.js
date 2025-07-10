#!/usr/bin/env node

const { config } = require('dotenv');
const { Logger } = require('../../utils/index.js');
const { createFastMCPServer } = require('../FastMCPServer.js');
const { extractCredentials } = require('../../shared/credentials');

config();

/**
 * Stdio transport implementation for MCP server using FastMCP
 */
class StdioTransport {
  constructor(options = {}) {
    this.options = options;
    this.logger = new Logger(process.env.LOG_LEVEL || 'INFO');

    // Extract credentials from options
    this.credentials = extractCredentials(options.credentials || {});

    this.setupErrorHandling();
  }

  setupErrorHandling() {
    process.on('SIGINT', async () => {
      this.logger.info('Shutting down MCP server...');
      process.exit(0);
    });
  }

  async start() {
    try {
      // Create FastMCP server with credentials
      this.server = await createFastMCPServer(this.credentials);

      // Start the FastMCP server with stdio transport
      await this.server.start({
        transportType: 'stdio',
      });

      // Only log to stderr in non-MCP mode, or to log file in MCP mode
      if (!this.logger.isMCPMode()) {
        console.error('Sentry Sensei MCP server running on stdio');
        console.error('Note: This server expects JSON-RPC messages from stdin.');
        console.error('Use an MCP client or pipe JSON-RPC messages to test.');
      } else {
        this.logger.info('Sentry Sensei MCP server started in MCP mode');
        if (this.logger.getLogFilePath()) {
          this.logger.info(`📁 Logs are being written to: ${this.logger.getLogFilePath()}`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to start MCP server:', error);
      throw error;
    }
  }
}

module.exports = { StdioTransport };
