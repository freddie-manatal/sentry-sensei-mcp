  const Logger = require('../src/utils/Logger');
  const { processMCPRequest, setCORSHeaders, handleCORSPreflight } = require('../src/shared/mcp-processor');

  const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

  async function handler(req, res) {
    logger.info('MCP Handler Called');
    logger.debug('Method:', req.method);
    logger.debug('Headers:', Object.keys(req.headers || {}));

    // Set CORS headers
    setCORSHeaders(res);

    // Handle CORS preflight requests
    if (handleCORSPreflight(req, res)) {
      return;
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      // Process the MCP request using shared logic
      const result = await processMCPRequest(req, req.body);

      if (result.body === null) {
        // For notifications that don't need a response body
        return res.status(result.status).end();
      }
      return res.status(result.status).json(result.body);
    } catch (error) {
      logger.error('MCP Handler Error:', error.message);
      logger.debug('Error details:', error.stack);

      return res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message,
        },
        id: req.body?.id || null,
      });
    }
  }

  module.exports = handler;