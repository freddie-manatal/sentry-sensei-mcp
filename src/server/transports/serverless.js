const { MCPServer } = require('../MCPServer.js');
const { Logger } = require('../../utils/index.js');

/**
 * Serverless transport implementation for MCP server
 * Compatible with Netlify Functions, Vercel, AWS Lambda, etc.
 */
class ServerlessTransport {
  constructor(options = {}) {
    this.logger = new Logger(process.env.LOG_LEVEL || 'INFO');
    this.mcpServer = new MCPServer(options);
  }

  /**
   * Handle serverless function request
   * @param {Object} event - Serverless event object
   * @param {Object} context - Serverless context object
   * @returns {Object} Serverless response object
   */
  async handleRequest(event, _context) {
    try {
      // Log request details
      this.logger.info(`Serverless function invoked: ${event.httpMethod} ${event.path}`);
      this.logger.debug('Event:', JSON.stringify(event, null, 2));

      // Handle different HTTP methods
      switch (event.httpMethod) {
        case 'GET':
          return await this.handleGetRequest(event);
        case 'POST':
          return await this.handlePostRequest(event);
        case 'OPTIONS':
          return this.handleOptionsRequest();
        default:
          return this.createResponse(405, {
            error: 'Method not allowed',
          });
      }
    } catch (error) {
      this.logger.error('Serverless function error:', error);
      return this.createResponse(500, {
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * Handle GET requests
   */
  async handleGetRequest(event) {
    const path = event.path || event.rawPath || '';
    const pathInfo = event.pathParameters?.proxy || '';

    this.logger.debug(`Request path: ${path}, pathInfo: ${pathInfo}`);

    // Health check endpoint - check multiple possible path formats
    if (
      path === '/health' ||
      path === '/.netlify/functions/mcp/health' ||
      path.endsWith('/health') ||
      pathInfo === 'health' ||
      (event.queryStringParameters && 'health' in event.queryStringParameters)
    ) {
      return this.createResponse(200, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        server: this.mcpServer.serverInfo.name,
        version: this.mcpServer.serverInfo.version,
        environment: 'serverless',
        debug: {
          path: path,
          pathInfo: pathInfo,
          headers: event.headers,
        },
      });
    }

    // Default response for GET requests
    return this.createResponse(200, {
      message: 'Sentry Sensei MCP Server',
      version: this.mcpServer.serverInfo.version,
      endpoints: {
        mcp: 'POST /.netlify/functions/mcp',
        health: 'GET /health',
      },
    });
  }

  /**
   * Handle POST requests (MCP protocol)
   */
  async handlePostRequest(event) {
    let body;

    try {
      // Parse request body
      if (event.body) {
        body = event.isBase64Encoded
          ? JSON.parse(Buffer.from(event.body, 'base64').toString())
          : JSON.parse(event.body);
      } else {
        body = {};
      }
    } catch (error) {
      this.logger.error('Failed to parse request body:', error);
      return this.createResponse(400, {
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error - Invalid JSON',
        },
        id: null,
      });
    }

    // Create request object for credential extraction
    const req = {
      headers: event.headers || {},
      query: event.queryStringParameters || {},
      body: body,
    };

    // Process MCP request
    const result = await this.mcpServer.processRequest(req, body);

    // Handle notification responses (no body)
    if (result.body === null) {
      return this.createResponse(result.status, null);
    }

    return this.createResponse(result.status, result.body);
  }

  /**
   * Handle OPTIONS requests (CORS preflight)
   */
  handleOptionsRequest() {
    return {
      statusCode: 200,
      headers: this.getCorsHeaders(),
      body: '',
    };
  }

  /**
   * Create standardized response object
   */
  createResponse(statusCode, body) {
    const response = {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...this.getCorsHeaders(),
      },
    };

    if (body !== null) {
      response.body = typeof body === 'string' ? body : JSON.stringify(body);
    } else {
      response.body = '';
    }

    return response;
  }

  /**
   * Get CORS headers
   */
  getCorsHeaders() {
    return {
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-Sentry-Token, X-Sentry-Host, X-Sentry-Organization, X-Jira-Access-Token, X-Atlassian-Domain, X-Jira-User-Email',
      'Access-Control-Allow-Credentials': 'true',
    };
  }
}

/**
 * Netlify Functions handler
 */
const netlifyHandler = async (event, context) => {
  const transport = new ServerlessTransport();
  return await transport.handleRequest(event, context);
};

/**
 * Vercel handler
 */
const vercelHandler = async (req, res) => {
  const transport = new ServerlessTransport();

  // Convert Vercel request to Netlify-style event
  const event = {
    httpMethod: req.method,
    path: req.url,
    headers: req.headers,
    queryStringParameters: req.query,
    body: req.body ? JSON.stringify(req.body) : null,
    isBase64Encoded: false,
  };

  const result = await transport.handleRequest(event, {});

  res.status(result.statusCode);
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.end(result.body);
};

/**
 * AWS Lambda handler
 */
const lambdaHandler = async (event, context) => {
  const transport = new ServerlessTransport();
  return await transport.handleRequest(event, context);
};

module.exports = {
  ServerlessTransport,
  netlifyHandler,
  vercelHandler,
  lambdaHandler,
  // Default export for Netlify
  handler: netlifyHandler,
};
