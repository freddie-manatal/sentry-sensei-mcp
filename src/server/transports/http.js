const express = require('express');
const cors = require('cors');
const { Logger } = require('../../utils/index.js');
const { createFastMCPServer } = require('../FastMCPServer.js');
const { extractCredentials } = require('../../shared/credentials');

/**
 * HTTP transport implementation for MCP server using FastMCP
 * Supports HTTP streaming and Server-Sent Events (SSE)
 */
class HttpTransport {
  constructor(options = {}) {
    this.logger = new Logger(process.env.LOG_LEVEL || 'INFO');
    this.port = options.port || process.env.PORT || 3000;

    // Extract credentials from options
    this.credentials = extractCredentials(options.credentials || {});

    // Also create Express app for additional health endpoints
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // CORS configuration
    this.app.use(
      cors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
        credentials: true,
      }),
    );

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        server: 'sentry-sensei-mcp',
        version: require('../../../package.json').version,
      });
    });
  }

  async start() {
    try {
      // Create FastMCP server with credentials
      this.server = await createFastMCPServer(this.credentials);

      // Start FastMCP server with HTTP streaming
      await this.server.start({
        transportType: 'httpStream',
        httpStream: {
          port: this.port,
          endpoint: '/mcp',
        },
      });

      // Start Express app on a different port for health checks
      const healthPort = this.port + 1;
      this.expressServer = this.app.listen(healthPort, () => {
        this.logger.info(`🚀 MCP HTTP server running on port ${this.port}`);
        this.logger.info(`📡 MCP endpoint: http://localhost:${this.port}/mcp`);
        this.logger.info(`❤️  Health check: http://localhost:${healthPort}/health`);
      });

      this.expressServer.on('error', error => {
        this.logger.error('Express server error:', error);
        throw error;
      });
    } catch (error) {
      this.logger.error('Failed to start HTTP server:', error);
      throw error;
    }
  }

  async stop() {
    if (this.expressServer) {
      return new Promise(resolve => {
        this.expressServer.close(() => {
          this.logger.info('MCP HTTP server stopped');
          resolve();
        });
      });
    }
  }
}

module.exports = { HttpTransport };
