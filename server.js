const { config } = require('dotenv');
const { HttpTransport } = require('./src/server/transports/http.js');

config();

// Create and start HTTP transport
const httpTransport = new HttpTransport({
  port: process.env.PORT || 3000,
  serverInfo: {
    name: 'sentry-sensei-mcp',
    version: '1.0.0',
  },
});

httpTransport.start().catch(error => {
  console.error('Failed to start HTTP server:', error);
  process.exit(1);
});
