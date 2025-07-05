#!/usr/bin/env node

const { config } = require('dotenv');
const { Logger } = require('./utils/index.js');
const { getVersion } = require('./utils/version.js');

config();

// Create global logger instance
const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

// Parse command line arguments
const args = process.argv.slice(2);

// Helper function to get argument value
function getArgValue(argName) {
  const index = args.indexOf(argName);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

// Check for version flag
if (args.includes('--version') || args.includes('-v')) {
  console.log(`Sentry Sensei MCP Server v${getVersion()}`);
  process.exit(0);
}

// Check for help flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Sentry Sensei MCP Server v${getVersion()}

Usage: sentry-sensei [options]
       sentry-sensei-mcp [options]
       node src/index.js [options]

Options:
  --token <token>              Sentry API token
  --sentryHost <host>          Sentry host domain (default: sentry.io)
  --organization <org>         Default organization slug
  --jiraAccessToken <token>    JIRA API token
  --atlassianDomain <domain>   JIRA domain (default: jira.com)
  --jiraUserEmail <email>      JIRA user email
  --version, -v                Show version number
  --help, -h                   Show this help message

Environment Variables:
  SENTRY_TOKEN                 Sentry API token (alternative to --token)
  LOG_LEVEL                    Log level (DEBUG, INFO, WARN, ERROR) - default: INFO
  MCP_MODE                     Set to 'true' to force MCP mode (logs to ~/.sentry-mcp-logs/)
  JIRA_ACCESS_TOKEN            JIRA API token (alternative to --jiraAccessToken)
  ATLASSIAN_DOMAIN             JIRA domain (alternative to --atlassianDomain)
  JIRA_USER_EMAIL              JIRA user email (alternative to --jiraUserEmail)

Examples:
  # Using global CLI after npm install -g
  sentry-sensei --token your_token --sentryHost your-org.sentry.io --organization your-org
  
  # Using npx
  npx @freddie-manatal/sentry-sensei-mcp --token your_token --sentryHost your-org.sentry.io
  
  # Development usage
  node src/index.js --token your_token --sentryHost your-org.sentry.io --organization your-org --jiraAccessToken your_jira_token --atlassianDomain jira.com --jiraUserEmail your_jira_email

For more information, visit: https://github.com/freddie-manatal/sentry-sensei-mcp
  `);
  process.exit(0);
}

// Parse CLI arguments
const CLI_TOKEN = getArgValue('--token');
const CLI_SENTRY_HOST = getArgValue('--sentryHost');
const CLI_ORGANIZATION = getArgValue('--organization');
const CLI_JIRA_ACCESS_TOKEN = getArgValue('--jiraAccessToken');
const CLI_ATLASSIAN_DOMAIN = getArgValue('--atlassianDomain');
const CLI_JIRA_USER_EMAIL = getArgValue('--jiraUserEmail');

// Parse CLI arguments for credential context
const credentialContext = {
  CLI_TOKEN,
  CLI_SENTRY_HOST,
  CLI_ORGANIZATION,
  CLI_JIRA_ACCESS_TOKEN,
  CLI_ATLASSIAN_DOMAIN,
  CLI_JIRA_USER_EMAIL,
};

// Start the server using new transport
const { StdioTransport } = require('./server/transports/stdio.js');

const transport = new StdioTransport({
  serverInfo: {
    name: 'sentry-sensei-mcp',
    version: getVersion(),
  },
  credentials: credentialContext,
});

transport.start().catch(error => {
  if (logger.isMCPMode()) {
    logger.error('Server startup failed:', error);
  } else {
    console.error('Server startup failed:', error);
  }
  process.exit(1);
});
