import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { readFile } from 'fs/promises';
import markdownit from 'markdown-it';
import hljs from 'highlight.js';
import { Logger } from './src/utils/index.js';
import { processMCPRequest } from './src/shared/index.js';

config();

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

// Health check endpoint
app.get(['/', '/health'], (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    transport: 'express-server',
    protocolVersion: '2024-11-05',
    mode: 'server',
    version: '1.0.0',
  });
});

// About page endpoint
app.get('/about', async (req, res) => {
  try {
    const markdownContent = await readFile('README.md', 'utf-8');
    const md = markdownit({
      html: true,
      linkify: true,
      typographer: true,
      highlight(str, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(str, { language: lang }).value;
          } catch (err) {
            // Fall back to default escaping if highlighting fails
            console.warn('Syntax highlighting failed:', err.message);
          }
        }
        return ''; // use external default escaping
      },
    });
    const htmlContent = md.render(markdownContent);

    const fullHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>About - Sentry MCP Server</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 2rem;
                line-height: 1.6;
                color: #333;
                background-color: #f8f9fa;
            }
            h1 {
                color: #2c3e50;
                border-bottom: 3px solid #3498db;
                padding-bottom: 0.5rem;
            }
            h2 {
                color: #34495e;
                margin-top: 2rem;
            }
            h3 {
                color: #5d6d7e;
            }
            code {
                background-color: #f1f2f6;
                padding: 0.2rem 0.4rem;
                border-radius: 3px;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            }
            pre {
                background-color: #f8f8f8;
                border: 1px solid #e1e4e8;
                border-radius: 6px;
                padding: 16px;
                overflow-x: auto;
                margin: 1rem 0;
            }
            pre code {
                background-color: transparent;
                padding: 0;
                border-radius: 0;
            }
            ul {
                padding-left: 1.5rem;
            }
            li {
                margin-bottom: 0.5rem;
            }
            hr {
                border: none;
                border-top: 1px solid #bdc3c7;
                margin: 2rem 0;
            }
            p {
                margin-bottom: 1rem;
            }
            .container {
                background-color: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }
        </style>
    </head>
    <body>
        <div class="container">
            ${htmlContent}
        </div>
    </body>
    </html>
    `;

    res.set('Content-Type', 'text/html');
    res.send(fullHtml);
  } catch (error) {
    logger.error('Error serving about page:', error);
    res.status(500).json({
      error: 'Failed to load about page',
      message: error.message,
    });
  }
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
  logger.info(`📖 About page: http://localhost:${PORT}/about`);
  logger.info(`🔧 MCP endpoint: http://localhost:${PORT}/mcp`);
});

export default app;
