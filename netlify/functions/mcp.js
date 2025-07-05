const { netlifyHandler } = require('../../src/server/transports/serverless.js');

// Export the handler directly from the serverless transport
exports.handler = netlifyHandler;