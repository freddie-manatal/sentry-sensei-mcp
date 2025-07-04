const Logger = require('../../src/utils/Logger.js').default;
const { processMCPRequest } = require('../../src/shared/mcp-processor.js');
const { getCORSHeaders, isPreflightRequest } = require('../../src/shared/cors.js');

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

exports.handler = async function handler(event, _context) {
  logger.info('MCP Handler Called (Netlify)');
  logger.debug('Method:', event.httpMethod);
  logger.debug('Headers:', Object.keys(event.headers || {}));

  const headers = getCORSHeaders();

  if (isPreflightRequest(event)) {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (parseError) {
    logger.error('Failed to parse request body:', parseError.message);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  try {
    // Use Netlify event as req for processMCPRequest (it expects req.headers)
    const result = await processMCPRequest(event, body);
    return {
      statusCode: result.status,
      headers,
      body: result.body === null ? '' : JSON.stringify(result.body),
    };
  } catch (error) {
    logger.error('MCP Handler Error:', error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message,
        },
        id: body?.id || null,
      }),
    };
  }
};
