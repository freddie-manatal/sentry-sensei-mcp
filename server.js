import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from './src/utils/index.js';
import { processMCPRequest } from './src/shared/index.js';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

// Middleware
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Sentry-Host',
      'X-Sentry-Organization',
      'X-Sentry-Token',
      'X-Atlassian-Domain',
      'X-Jira-Token',
      'X-Jira-Email',
    ],
  }),
);
app.use(express.json());

// Serve static documentation files
app.use('/', express.static(path.join(__dirname, 'docs/build')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    transport: 'express-server',
    protocolVersion: '2024-11-05',
    mode: 'server',
    version: '1.0.0',
  });
});

// MCP endpoint
app.post(['/mcp'], async (req, res) => {
  logger.info('MCP Handler Called');
  logger.debug('Method:', req.method);

  try {
    // Process the MCP request using shared logic
    const result = await processMCPRequest(req, req.body);

    if (result.body === null) {
      // For notifications that don't need a response body
      return res.status(result.status).end();
    }

    return res.status(result.status).json(result.body);
  } catch (error) {
    logger.error('Request processing error:', error);
    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
      id: req.body?.id,
    });
  }
});

// Error handling middleware
app.use((err, req, res, _next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📡 Health check: http://localhost:${PORT}/health`);
  logger.info(`📖 Documentation: http://localhost:${PORT}/`);
  logger.info(`🔧 MCP endpoint: http://localhost:${PORT}/mcp`);
});

export default app;
