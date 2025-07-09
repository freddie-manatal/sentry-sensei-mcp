const { z } = require('zod');
const { getVersion } = require('../utils/version.js');
const { createHandlers } = require('../shared/handlers');
const {
  TOOL_NAMES,
  ENABLED_TOOLS,
  TOOL_DEFINITIONS,
  SHARED_PROPERTIES,
} = require('../tools/index.js');

/**
 * Convert JSON Schema property to Zod schema
 * @param {Object} property - JSON Schema property definition
 * @returns {z.ZodType} Zod schema
 */
function convertToZodSchema(property) {
  let schema;

  if (property.type === 'string') {
    schema = z.string();
  } else if (property.type === 'number' || property.type === 'integer') {
    schema = z.number();
    if (property.type === 'integer') schema = schema.int();
    if (property.minimum !== undefined) schema = schema.min(property.minimum);
    if (property.maximum !== undefined) schema = schema.max(property.maximum);
  } else if (property.type === 'boolean') {
    schema = z.boolean();
  } else if (property.type === 'array') {
    const itemSchema = convertToZodSchema(property.items);
    schema = z.array(itemSchema);
  } else if (property.oneOf) {
    const unionSchemas = property.oneOf.map(p => convertToZodSchema(p));
    schema = z.union(unionSchemas);
  } else if (property.enum) {
    schema = z.enum(property.enum);
  } else {
    schema = z.any();
  }

  if (property.default !== undefined) {
    schema = schema.default(property.default);
  }

  if (property.description) {
    schema = schema.describe(property.description);
  }

  return schema;
}

/**
 * Convert tool definition to FastMCP tool
 * @param {Object} toolDef - Tool definition from TOOL_DEFINITIONS
 * @param {Object} handlers - Handler functions
 * @returns {Object} FastMCP tool configuration
 */
function convertToolDefinition(toolDef, handlers) {
  const parameters = {};

  // Convert all properties except model (which we'll handle separately)
  Object.entries(toolDef.inputSchema.properties).forEach(([key, prop]) => {
    if (key !== 'model') {
      parameters[key] = convertToZodSchema(prop);
      if (!toolDef.inputSchema.required?.includes(key)) {
        parameters[key] = parameters[key].optional();
      }
    }
  });

  // Add model parameter
  const modelSchema = z.string().describe(SHARED_PROPERTIES.model.description);
  parameters.model = modelSchema;

  // Get the handler function
  const handlerMap = {
    [TOOL_NAMES.GET_SENTRY_PROJECTS]: args => handlers.sentryHandler.getProjects(args),
    [TOOL_NAMES.GET_SENTRY_ISSUES]: args => handlers.sentryHandler.getSentryIssuesList(args),
    [TOOL_NAMES.GET_JIRA_TICKET_DETAILS]: args => handlers.jiraHandler.getJiraTicketDetails(args),
    [TOOL_NAMES.GET_CURRENT_DATETIME]: args => handlers.datetimeHandler.getCurrentDateTime(args),
    [TOOL_NAMES.GET_SENTRY_ISSUE_DETAILS]: args =>
      handlers.sentryHandler.getSentryIssueDetails(args),
  };

  return {
    name: toolDef.name,
    description: toolDef.description,
    parameters: z.object(parameters),
    execute: handlerMap[toolDef.name],
  };
}

/**
 * Create FastMCP server with all tools
 * @param {Object} credentials - Credentials object
 * @returns {Promise<FastMCP>} Configured FastMCP server
 */
async function createFastMCPServer(credentials) {
  // Dynamic import for ES module
  const { FastMCP } = await import('fastmcp');

  const server = new FastMCP({
    name: 'sentry-sensei-mcp',
    version: getVersion(),
  });

  // Create handlers with credentials
  const handlers = createHandlers(credentials);

  // Add all enabled tools
  TOOL_DEFINITIONS.filter(toolDef => ENABLED_TOOLS.includes(toolDef.name)).forEach(toolDef => {
    const toolConfig = convertToolDefinition(toolDef, handlers);
    server.addTool(toolConfig);
  });

  return server;
}

module.exports = {
  createFastMCPServer,
};
