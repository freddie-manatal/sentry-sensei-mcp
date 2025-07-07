const { TOOL_NAMES } = require('./constants');

// Get current date for tool descriptions
const getCurrentDateInfo = () => {
  const now = new Date();
  return {
    currentDate: now.toISOString().split('T')[0], // YYYY-MM-DD
    currentDateTime: now.toISOString(),
    year: now.getFullYear(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
};

// Shared properties for all tools that return responses
const SHARED_PROPERTIES = {
  model: {
    type: 'string',
    description: '[Required] Model identifier (e.g., "claude-xxxx", "gpt -xxxx","claude-xxxx")',
  },
};

// Tool definitions
const TOOL_DEFINITIONS = [
  {
    name: TOOL_NAMES.GET_SENTRY_ORGANIZATIONS,
    description: 'List Sentry organizations accessible to the authenticated user.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SHARED_PROPERTIES,
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.GET_SENTRY_PROJECTS,
    description:
      'List projects in a Sentry organization with their IDs, names, platforms, teams, and environments. Use onlyProduction=true to filter environments to only show production environments.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SHARED_PROPERTIES,
        onlyProduction: {
          type: 'boolean',
          description:
            'Filter environments to show only production environments. When true, only environments containing "production" are shown. When false, all environments are displayed. Default: true',
          default: true,
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.GET_SENTRY_ISSUES,
    description: `Search and filter Sentry issues with precise targeting. KEY WORKFLOW: 1) Always call GET_SENTRY_PROJECTS first to get project IDs, 2) Use errorMessage to INCLUDE specific error types (e.g., **APIError**), 3) Use excludeErrorType to EXCLUDE unwanted errors (e.g., **404**), 4) Combine filters for precise results. COMMON PATTERNS: "API errors excluding 404s" = errorMessage:"**APIError**" + excludeErrorType:"**404**", "Database issues but not timeouts" = errorMessage:"**DatabaseError**" + excludeErrorType:"**TimeoutError**". CURRENT DATE: ${getCurrentDateInfo().currentDate}`,
    inputSchema: {
      type: 'object',
      properties: {
        ...SHARED_PROPERTIES,
        project: {
          oneOf: [
            {
              type: 'string',
              description: 'Single project ID (e.g., "123456")',
            },
            {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Array of project IDs (e.g., ["123456", "789012"])',
            },
          ],
          description:
            'Project ID or array of project IDs. Must be numeric IDs, not shortId or name.',
        },
        environment: {
          oneOf: [
            {
              type: 'string',
              description:
                'Target environment: "production", "staging", "development", "testing", or custom names',
            },
            {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Array of environment names',
            },
          ],
          description:
            'Filter issues by deployment environment(s). Use single environment or array for multiple environments.',
        },
        utc: {
          type: 'boolean',
          description: 'Use UTC time for date range. Default: true',
        },
        sortBy: {
          type: 'string',
          description:
            'Sort order for issues: "date" (Last Seen), "new" (First Seen), "trends" (Trends), "freq" (Events), "user" (Users), "inbox" (Date Added). Default: "freq"',
          enum: ['date', 'freq', 'inbox', 'new', 'trends', 'user'],
        },
        issue: {
          type: 'string',
          description:
            'Filter by short ID or full ID of a specific Sentry issue (e.g., "PROJECT-NAME-XXXX"). Use this to find a single issue by its identifier.',
        },
        excludeErrorType: {
          type: 'string',
          description:
            "EXCLUDE filter: Remove issues matching this error type/message. FORMAT: Use **ErrorType** syntax. COMMON EXCLUSIONS: Noise (**404**, **TimeoutError**), Known Issues (**MaintenanceError**), HTTP codes (**401**, **500**), Infrastructure (**ConnectionError**). EXAMPLE: To exclude 404s use excludeErrorType:'**404**'. COMBINE with errorMessage for precise filtering (e.g., API errors but not 404s).",
        },
        errorMessage: {
          type: 'string',
          description:
            "INCLUDE filter: Show ONLY issues matching this error type/message. FORMAT: Use **ErrorType** syntax. COMMON TYPES: Frontend (**TypeError**, **ReferenceError**), Backend (**DatabaseError**, **ValidationError**), API (**APIError**, **HTTPError**), Auth (**AuthError**), HTTP Status (**404**, **500**), Custom (**PaymentError**). EXAMPLE: To find API errors use errorMessage:'**APIError**'.",
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of issues to return (1-100). Default: 10',
          minimum: 1,
          maximum: 100,
        },
        statsPeriod: {
          type: 'string',
          description:
            'The period of time for the query (e.g., "24h", "7d", "1w"). Will override dateFrom and dateTo. Format: number + unit (d=days, h=hours, m=minutes, s=seconds, w=weeks)',
        },
        dateFrom: {
          type: 'string',
          description: `Start date for issues (YYYY-MM-DDT00:00:00 format). For relative dates, calculate from current date: ${getCurrentDateInfo().currentDate}`,
        },
        dateTo: {
          type: 'string',
          description: `End date for issues (YYYY-MM-DDT23:59:59 format). For relative dates, calculate from current date: ${getCurrentDateInfo().currentDate}`,
        },
        groupStatsPeriod: {
          type: 'string',
          description: 'The timeline for group stats presentation',
          enum: ['14d', '24h', 'auto'],
        },
        query: {
          type: 'string',
          description:
            'Advanced Sentry search syntax for complex filtering. DEFAULT: "is:unresolved issue.priority:[high,medium] issue:shortIdOfIssue". SYNTAX: Status ("is:unresolved"), HTTP Codes ("error.type:404"), Messages ("message:**timeout**"), Priority ("issue.priority:[high,medium]"), Users ("has:user"), Environment ("environment:production"), Combine ("is:unresolved AND message:**API**"). LEAVE EMPTY for standard errorMessage/excludeErrorType filtering.',
        },
        collapse: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['base', 'filtered', 'lifetime', 'stats', 'unhandled'],
          },
          description: 'Fields to remove from the response to improve query performance',
        },
        cursor: {
          type: 'string',
          description: 'Pointer to the last object fetched and its sort order; used for pagination',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.GET_JIRA_TICKET_DETAILS,
    description:
      'Get JIRA ticket details including summary, status, assignee, and recent comments.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SHARED_PROPERTIES,
        ticketKey: {
          type: 'string',
          description: "JIRA ticket key (e.g., 'MAN-123456')",
        },
        deepDetails: {
          type: 'boolean',
          description:
            'Include comprehensive ticket details and full comment history. Default: false.',
          default: false,
        },
      },
      required: ['ticketKey'],
    },
  },
  {
    name: TOOL_NAMES.GET_CURRENT_DATETIME,
    description: 'Get current date and time in various formats.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SHARED_PROPERTIES,
        format: {
          type: 'string',
          description:
            'Optional format for the date output: "iso" (default), "readable", or "unix"',
          enum: ['iso', 'readable', 'unix'],
        },
        timezone: {
          type: 'string',
          description:
            'Optional timezone for the output (e.g., "America/New_York", "UTC"). Defaults to system timezone',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.GET_SENTRY_ISSUE_DETAILS,
    description:
      'Get detailed information about a specific Sentry issue including stack trace and metadata. Requires numeric issue ID.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SHARED_PROPERTIES,
        issueId: {
          type: 'number',
          description:
            'Issue ID must be number (e.g., 5829644011). To get the numeric ID from a short ID, first list issues with GET_SENTRY_ISSUES using a query filter like "issue:SHORTID" and read the returned id field.',
        },
        includeTags: {
          type: 'boolean',
          description: 'Include environment and browser tags. Default: false.',
          default: false,
        },
        environment: {
          type: 'string',
          description: 'Environment name (e.g., "production", "staging", "**pr**")',
        },
        trace: {
          type: 'boolean',
          description: 'Include stack trace from the latest event. Default: true.',
          default: true,
        },
        deepDetails: {
          type: 'boolean',
          description:
            'Include comprehensive details like environment breakdowns, user data, and statistics. Default: false.',
          default: false,
        },
      },
      required: ['issueId'],
    },
  },
];

module.exports = TOOL_DEFINITIONS;
