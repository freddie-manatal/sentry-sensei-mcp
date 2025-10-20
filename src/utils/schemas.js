const { z } = require('zod');

// Base schemas
const ModelSchema = z.string().min(1, 'Model identifier is required');
const IssueIdSchema = z.number().int().positive('Issue ID must be a positive integer');
const ProjectIdSchema = z.string().regex(/^\d+$/, 'Project ID must be numeric string');
const EnvironmentSchema = z.string().min(1);
const DateStringSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|(\.\d{3}Z?)?)?$/,
    'Invalid datetime format. Use YYYY-MM-DDTHH:MM:SS or YYYY-MM-DDTHH:MM:SSZ',
  )
  .optional();

// Sentry schemas
const SentryIssueDetailsSchema = z.object({
  model: ModelSchema,
  organization: z.string().optional(),
  issueId: IssueIdSchema,
  includeTags: z.boolean().default(false),
  environment: EnvironmentSchema.optional(),
  trace: z.boolean().default(true),
  deepDetails: z.boolean().default(false),
});

const SentryIssuesSchema = z.object({
  model: ModelSchema,
  organization: z.string().optional(),
  project: z.union([ProjectIdSchema, z.array(ProjectIdSchema)]).optional(),
  environment: z.union([EnvironmentSchema, z.array(EnvironmentSchema)]).optional(),
  utc: z.boolean().default(true),
  sortBy: z.enum(['date', 'freq', 'inbox', 'new', 'trends', 'user']).default('freq'),
  issue: z.string().optional(),
  excludeErrorType: z.string().optional(),
  errorMessage: z.string().optional(),
  limit: z.number().int().min(1).max(9999).default(10),
  statsPeriod: z.string().optional(),
  dateFrom: DateStringSchema,
  dateTo: DateStringSchema,
  groupStatsPeriod: z.enum(['14d', '24h', 'auto']).optional(),
  query: z.string().optional(),
  collapse: z.array(z.enum(['base', 'filtered', 'lifetime', 'stats', 'unhandled'])).optional(),
  cursor: z.string().optional(),
  relativeDays: z.number().int().min(1).max(365).optional(),
});

const SentryOrganizationsSchema = z.object({
  model: ModelSchema,
});

const SentryProjectsSchema = z.object({
  model: ModelSchema,
  organization: z.string().optional(),
  onlyProduction: z.boolean().default(true),
  preview: z.string().optional(),
});

// JIRA schemas
const JiraTicketDetailsSchema = z.object({
  model: ModelSchema,
  ticketKey: z.string().min(1, 'JIRA ticket key is required'),
  deepDetails: z.boolean().default(false),
});

// Datetime schemas
const DateTimeSchema = z.object({
  model: ModelSchema,
  format: z.enum(['iso', 'readable', 'unix']).default('iso'),
  timezone: z.string().optional(),
});

// Validation helper function
function validateSchema(schema, data, toolName) {
  try {
    return schema.parse(data);
  } catch (error) {
    const errorMessage = error.errors
      .map(err => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new Error(`${toolName} validation failed: ${errorMessage}`);
  }
}

module.exports = {
  // Schemas
  SentryIssueDetailsSchema,
  SentryIssuesSchema,
  SentryOrganizationsSchema,
  SentryProjectsSchema,
  JiraTicketDetailsSchema,
  DateTimeSchema,

  // Helper
  validateSchema,

  // Individual field schemas for reuse
  ModelSchema,
  IssueIdSchema,
  ProjectIdSchema,
  EnvironmentSchema,
};
