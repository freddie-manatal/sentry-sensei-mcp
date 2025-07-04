const { Logger } = require('../../src/utils/index.js');
const { processMCPRequest } = require('../../src/shared/index.js');
const { getCORSHeaders, isPreflightRequest } = require('../../src/shared/cors');

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

// MCP server configuration
const MCP_SERVER_INFO = {
  name: 'sentry-sensei-mcp',
  version: '1.0.0',
  protocolVersion: '2024-11-05',
};

exports.handler = async function handler(event, _context) {
  logger.info('MCP Handler Called (Netlify)');
  logger.debug('Method:', event.httpMethod);
  logger.debug('Path:', event.path);
  logger.debug('Headers:', Object.keys(event.headers || {}));

  const headers = {
    ...getCORSHeaders(),
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight requests
  if (isPreflightRequest(event)) {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Handle GET requests for MCP endpoint discovery
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        result: {
          protocolVersion: MCP_SERVER_INFO.protocolVersion,
          capabilities: {
            tools: { listChanged: true },
            resources: {},
          },
          serverInfo: {
            name: MCP_SERVER_INFO.name,
            version: MCP_SERVER_INFO.version,
          },
        },
      }),
    };
  }

  // Only allow POST requests for MCP operations
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: 'Method not allowed. Only POST requests are supported.',
        },
        id: null,
      }),
    };
  }

  // Parse request body with comprehensive error handling
  let requestBody;
  try {
    if (!event.body) {
      throw new Error('Request body is required');
    }

    requestBody = JSON.parse(event.body);

    // Validate basic JSON-RPC structure
    if (!requestBody.jsonrpc || requestBody.jsonrpc !== '2.0') {
      throw new Error('Invalid JSON-RPC format');
    }

    if (!requestBody.method) {
      throw new Error('Method is required');
    }

  } catch (parseError) {
    logger.error('Failed to parse or validate request body:', parseError.message);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error',
          data: parseError.message,
        },
        id: null,
      }),
    };
  }

  // Process MCP request with comprehensive error handling
  try {
    const result = await processMCPRequest(event, requestBody);
    
    return {
      statusCode: result.status || 200,
      headers,
      body: result.body === null ? '' : JSON.stringify(result.body),
    };
  } catch (error) {
    logger.error('MCP Handler Error:', error.message);
    logger.debug('Error stack:', error.stack);

    // Return structured JSON-RPC error response
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data: process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
        id: requestBody?.id || null,
      }),
    };
  }
};
