const { extractCredentials } = require('./credentials.js');
const { createHandlers } = require('./handlers.js');
const { processMCPRequest } = require('./mcp-processor.js');
const { setCORSHeaders, handleCORSPreflight } = require('./cors.js');

module.exports = {
  extractCredentials,
  createHandlers,
  processMCPRequest,
  setCORSHeaders,
  handleCORSPreflight,
};
