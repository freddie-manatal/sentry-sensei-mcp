import { TOOL_NAMES } from './index.js';

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

// Tool definitions
export const TOOL_DEFINITIONS = [
  {
    name: TOOL_NAMES.GET_SENTRY_ORGANIZATIONS,
    description:
      'Get list of Sentry organizations that the authenticated user has access to, including organization details, status, and available features.',
    inputSchema: {
      type: 'object',
      properties: {},
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
        organization: {
          type: 'string',
          description: 'Organization slug (optional - uses default if not provided)',
        },
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
        organization: {
          type: 'string',
          description: 'Organization slug (optional - uses default if not provided)',
        },
        project: {
          oneOf: [
            {
              type: 'string',
              description: 'Single project id',
            },
            {
              type: 'array',
              items: {
                oneOf: [{ type: 'string' }, { type: 'number' }],
              },
              description: 'Array of project IDs',
            },
          ],
          description:
            'Project ID or array of project IDs (optional - gets all projects if not provided)',
        },
        environment: {
          oneOf: [
            {
              type: 'string',
              description: 'Single environment name',
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
            "Environment name(s) to filter by (e.g., 'production', ['production', 'staging'])",
        },
        dateFrom: {
          type: 'string',
          description: `Start date for issues (YYYY-MM-DDT00:00:00 format). For relative dates, calculate from current date: ${getCurrentDateInfo().currentDate}`,
        },
        dateTo: {
          type: 'string',
          description: `End date for issues (YYYY-MM-DDT23:59:59 format). For relative dates, calculate from current date: ${getCurrentDateInfo().currentDate}`,
        },
        relativeDays: {
          type: 'integer',
          description: `Get issues from the last N days from today (${getCurrentDateInfo().currentDate}). This will automatically set dateFrom and dateTo. Use this for queries like "last 2 days", "last week" (7 days), etc.`,
          minimum: 1,
          maximum: 365,
        },
        utc: {
          type: 'boolean',
          description: 'Use UTC time for date range. Default: true',
        },
        sortBy: {
          type: 'string',
          description: 'Sort order for issues: "date" (Last Seen), "new" (First Seen), "trends" (Trends), "freq" (Events), "user" (Users), "inbox" (Date Added). Default: "freq"',
          enum: ['date', 'freq', 'inbox', 'new', 'trends', 'user'],
        },
        excludeErrorType: {
          type: 'string',
          description:
            "Exclude specific error type from issues (e.g., 'NullPointerException', '**404**', '**500**')",
        },
        errorMessage: {
          type: 'string',
          description:
            "Filter issues by error message or type (e.g., '**404**', '**500**', '**APIError**', '**TypeError**')",
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of issues to return (1-100). Default: 50',
          minimum: 1,
          maximum: 100,
        },
        shortIdLookup: {
          type: 'boolean',
          description: 'Enable parsing of issue short IDs in queries. Default: false',
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
        ticketKey: {
          type: 'string',
          description: "JIRA ticket key (e.g., 'MAN-123456')",
        },
      },
      required: ['ticketKey'],
    },
  },
  {
    name: TOOL_NAMES.GET_CURRENT_DATETIME,
    description:
      'Get current date and time information for accurate date calculations and context when working with time-sensitive queries or generating reports',
    inputSchema: {
      type: 'object',
      properties: {
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
];
