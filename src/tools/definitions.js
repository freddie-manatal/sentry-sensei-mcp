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
    description:
      'Required: Tell me the model you are using for this request and add model id or model name',
  },
};

// Tool definitions
const TOOL_DEFINITIONS = [
  {
    name: TOOL_NAMES.GET_SENTRY_ORGANIZATIONS,
    description:
      'Get list of Sentry organizations that the authenticated user has access to, including organization details, status, and available features.',
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
      'Get list of Sentry projects for an organization, including project details, platform information, team assignments, and access permissions. Essential for identifying the correct project before querying issues.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SHARED_PROPERTIES,
      },
      required: [],
    },
  },
  {
    name: TOOL_NAMES.GET_SENTRY_ISSUES,
    description: `Get list of Sentry issues for an organization and project(s). Supports filtering by environment, date ranges, error types, and sorting options. Use this to analyze error trends, investigate specific issues, or generate reports. Returns JIRA ticket links when available - if issues have linked JIRA tickets, follow up with GET_JIRA_TICKET_DETAILS to get comprehensive issue context. CURRENT DATE: ${getCurrentDateInfo().currentDate} (${getCurrentDateInfo().year}). Use this current date to calculate relative dates like 'last 2 days', 'this week', etc.`,
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
            'Project ID or array of project IDs (optional - gets all projects if not provided). Project IDs must be the full numeric ID, not the shortId(PROJECT-NAME-XXXX), name, slug.',
        },
        environment: {
          oneOf: [
            {
              type: 'string',
              description: 'Single environment name (e.g., "production", "staging", "**pr**")',
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
            "Environment name(s) to filter by (e.g., 'production', ['production', 'staging', '**pr**'])",
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
            "Exclude specific error type from issues (e.g., 'NullPointerException', '**404**', '**500**'), this is not a shortId of the issue, it is the error message or type of the issue",
        },
        errorMessage: {
          type: 'string',
          description:
            "Filter by error message or type (e.g., '**404**', '**500**', '**APIError**', '**TypeError**'), this is not a shortId of the issue, it is the error message or type of the issue",
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of issues to return (1-100). Default: 50',
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
            'Search query for filtering issues. Empty string returns all results. Default query: is:unresolved issue.priority:[high,medium] issue:shortIdOfIssue',
        },
        expand: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'inbox',
              'integrationIssues',
              'latestEventHasAttachments',
              'owners',
              'pluginActions',
              'pluginIssues',
              'sentryAppIssues',
              'sessions',
            ],
          },
          description: 'Additional data to include in the response',
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
      'Get detailed information about a JIRA ticket including summary, status, assignee, comments, and progress updates. Returns the last 5 comments to help analyze ticket progression and next steps.',
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
          description: 'Include deep details of the ticket in the response. Default: false',
        },
      },
      required: ['ticketKey'],
    },
  },
  {
    name: TOOL_NAMES.GET_CURRENT_DATETIME,
    description:
      'Get current date and time information in various formats. Useful for calculating relative dates, timestamps, and working with date-based queries or operations.',
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
      'Get comprehensive details about a specific Sentry issue... IMPORTANT: You must provide the numeric issue ID. If you only know the shortId, first use GET_SENTRY_ISSUES with query="issue:SHORTID" to get the numeric ID.',
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
          description: 'Include tags in the response if available. Default: false',
        },
        environment: {
          type: 'string',
          description: 'Environment name (e.g., "production", "staging", "**pr**")',
        },
        trace: {
          type: 'boolean',
          description:
            '(Optional) Include stack trace from the latest event in the response. Default: false, if you are asked to check deep details, set this to true',
        },
        checkDeepDetails: {
          type: 'boolean',
          description:
            '(Optional) Include detailed information in the response when you are asked to check deep details. Default: false, if you are asked to check deep details, set this to true',
        },
      },
      required: ['issueId'],
    },
  },
];

module.exports = TOOL_DEFINITIONS;
