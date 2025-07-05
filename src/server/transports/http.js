const express = require('express');
const cors = require('cors');
const { Logger } = require('../../utils/index.js');
const { MCPServer } = require('../MCPServer.js');

/**
 * HTTP transport implementation for MCP server
 * Supports both regular HTTP and Server-Sent Events (SSE) streaming
 */
class HttpTransport {
  constructor(options = {}) {
    this.logger = new Logger(process.env.LOG_LEVEL || 'INFO');
    this.mcpServer = new MCPServer(options);
    this.app = express();
    this.port = options.port || process.env.PORT || 3000;
    this.sessions = new Map(); // Track active sessions for SSE

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
        server: this.mcpServer.serverInfo.name,
        version: this.mcpServer.serverInfo.version,
      });
    });

    // MCP endpoint - supports both single requests and streaming
    this.app.post('/mcp', async (req, res) => {
      try {
        const result = await this.mcpServer.processRequest(req, req.body);

        // Handle different response types
        if (result.body === null) {
          // Notification response
          res.status(result.status).end();
        } else {
          res.status(result.status).json(result.body);
        }
      } catch (error) {
        this.logger.error('Error processing MCP request:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: process.env.NODE_ENV === 'development' ? error.message : undefined,
          },
          id: null,
        });
      }
    });

    // SSE endpoint for streaming support
    this.app.get('/mcp/stream/:sessionId', (req, res) => {
      const sessionId = req.params.sessionId;

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      // Store session
      this.sessions.set(sessionId, {
        response: res,
        timestamp: Date.now(),
      });

      this.logger.info(`SSE session started: ${sessionId}`);

      // Send initial connection event
      res.write(`event: connected\n`);
      res.write(`data: ${JSON.stringify({ sessionId, timestamp: new Date().toISOString() })}\n\n`);

      // Handle client disconnect
      req.on('close', () => {
        this.sessions.delete(sessionId);
        this.logger.info(`SSE session ended: ${sessionId}`);
      });

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        if (this.sessions.has(sessionId)) {
          res.write(`event: ping\n`);
          res.write(`data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
    });

    // MCP streaming endpoint
    this.app.post('/mcp/stream/:sessionId', async (req, res) => {
      const sessionId = req.params.sessionId;
      const session = this.sessions.get(sessionId);

      if (!session) {
        return res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session not found',
          },
          id: req.body.id || null,
        });
      }

      try {
        // Process the MCP request
        const result = await this.mcpServer.processRequest(req, req.body);

        // Send result via SSE
        if (result.body !== null) {
          session.response.write(`event: response\n`);
          session.response.write(`data: ${JSON.stringify(result.body)}\n\n`);
        }

        // Send acknowledgment
        res.json({
          jsonrpc: '2.0',
          result: { status: 'sent' },
          id: req.body.id || null,
        });
      } catch (error) {
        this.logger.error('Error processing streaming MCP request:', error);

        // Send error via SSE
        const errorResponse = {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: process.env.NODE_ENV === 'development' ? error.message : undefined,
          },
          id: req.body.id || null,
        };

        session.response.write(`event: error\n`);
        session.response.write(`data: ${JSON.stringify(errorResponse)}\n\n`);

        res.status(500).json(errorResponse);
      }
    });

    // Session management
    this.app.post('/mcp/session', (req, res) => {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.json({
        jsonrpc: '2.0',
        result: { sessionId },
        id: req.body.id || null,
      });
    });

    // List active sessions (development only)
    if (process.env.NODE_ENV === 'development') {
      this.app.get('/mcp/sessions', (req, res) => {
        const sessions = Array.from(this.sessions.keys()).map(sessionId => ({
          sessionId,
          timestamp: this.sessions.get(sessionId).timestamp,
        }));
        res.json({ sessions });
      });
    }
  }

  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          this.logger.info(`🚀 MCP HTTP server running on port ${this.port}`);
          this.logger.info(`📡 MCP endpoint: http://localhost:${this.port}/mcp`);
          this.logger.info(`🔄 SSE streaming: http://localhost:${this.port}/mcp/stream/:sessionId`);
          resolve();
        });

        this.server.on('error', error => {
          this.logger.error('Server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop() {
    if (this.server) {
      return new Promise(resolve => {
        // Close all SSE connections
        for (const [, session] of this.sessions) {
          session.response.end();
        }
        this.sessions.clear();

        this.server.close(() => {
          this.logger.info('MCP HTTP server stopped');
          resolve();
        });
      });
    }
  }
}

module.exports = { HttpTransport };
