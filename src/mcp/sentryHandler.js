const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');
const { SentryService } = require('../services/index.js');
const { Logger, SentryFormatter, TokenCounter, ErrorHandler, schemas } = require('../utils/index.js');
const { TOOL_NAMES } = require('../tools/constants.js');

const { 
  SentryIssueDetailsSchema,
  SentryIssuesSchema,
  SentryOrganizationsSchema,
  SentryProjectsSchema,
  validateSchema 
} = schemas;

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

class SentryHandler {
  constructor(host, organization, token) {
    this.host = host;
    this.organization = organization;
    this.token = token;
    this.logger = new Logger(process.env.LOG_LEVEL || 'INFO');
  }

  // Helper method to get current date information
  getCurrentDateInfo() {
    const now = new Date();
    return {
      currentDate: now.toISOString().split('T')[0], // YYYY-MM-DD
      currentDateTime: now.toISOString(),
      year: now.getFullYear(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  // Helper method to calculate relative dates
  calculateRelativeDates(relativeDays) {
    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(now.getDate() - relativeDays);

    // Set times for proper range
    fromDate.setHours(0, 0, 0, 0); // Start of the day
    now.setHours(23, 59, 59, 999); // End of current day

    return {
      dateFrom: fromDate.toISOString(),
      dateTo: now.toISOString(),
    };
  }

  // Helper methods
  getToken() {
    return this.token || process.env.SENTRY_TOKEN;
  }

  getSentryHost() {
    return this.host;
  }

  getOrganization(args) {
    return args.organization || this.organization;
  }

  createSentryService(args) {
    const token = this.getToken(args);
    const host = this.getSentryHost(args);

    if (!token) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Sentry API token is required. Provide it as a parameter, pass --token argument, or set SENTRY_TOKEN environment variable.',
      );
    }

    return new SentryService(token, host);
  }

  // Fetch organizations
  async fetchOrganizations(sentryService) {
    logger.info('🏢 Fetching Sentry organizations...');

    const organizations = await sentryService.getOrganizations();
    logger.info(`📊 Found ${organizations.length} organizations`);

    // Compact formatting
    const formattedOrgs = SentryFormatter.formatOrganizationsList(organizations);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(formattedOrgs, null, 2),
        },
      ],
    };
  }

  // Fetch projects for an organization or all projects
  async fetchProjects(sentryService, organization = null) {
    if (organization) {
      logger.info(`🏗️ Fetching Sentry projects for organization: ${organization}`);
    } else {
      logger.info('🏗️ Fetching all Sentry projects...');
    }

    const projects = await sentryService.getProjects(organization);
    logger.info(`📊 Found ${projects.length} projects`);

    const formattedProjects = SentryFormatter.formatProjectsList(projects);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(formattedProjects, null, 2),
        },
      ],
    };
  }

  // Fetch issues for an organization
  async fetchIssues(sentryService, organization, options) {
    const { project } = options;
    const projectInfo = project
      ? Array.isArray(project)
        ? `projects: ${project.join(', ')}`
        : `project: ${project}`
      : 'all projects';

    logger.info(`🔍 Fetching Sentry issues for ${projectInfo} in organization: ${organization}`);

    if (!organization) {
      throw new McpError(ErrorCode.InvalidParams, 'Organization is required for fetching issues');
    }

    const issues = await sentryService.getIssues(organization, options);
    logger.info(`📊 Found ${issues.length} issues`);

    // Compact issues list using formatter
    const formattedIssues = SentryFormatter.formatIssuesList(issues);

    // Build filter summary including current date context
    const filterSummary = [
      `Query executed on: ${this.getCurrentDateInfo().currentDateTime} (${this.getCurrentDateInfo().timezone})`,
    ];

    if (options.project) {
      filterSummary.push(
        `Project(s): ${
          Array.isArray(options.project) ? options.project.join(', ') : options.project
        }`,
      );
    }
    if (options.environment) {
      filterSummary.push(
        `Environment(s): ${
          Array.isArray(options.environment) ? options.environment.join(', ') : options.environment
        }`,
      );
    }

    if (options.excludeErrorType) {
      filterSummary.push(`Excluding Error Type: ${options.excludeErrorType}`);
    }
    if (options.errorMessage) {
      filterSummary.push(`Error Message: ${options.errorMessage}`);
    }
    if (options.dateFrom && options.dateTo) {
      filterSummary.push(`Date Range: ${options.dateFrom} to ${options.dateTo}`);
    }
    if (options.relativeDaysUsed) {
      filterSummary.push(`Relative Period: Last ${options.relativeDaysUsed} days from today`);
    }
    if (options.limit) {
      filterSummary.push(`Limit: ${options.limit}`);
    }

    const filterText =
      filterSummary.length > 1
        ? `\n\nQuery Information:\n${filterSummary.map(f => f).join('\n')}`
        : '';

    // Build annotation summary
    const issuesWithAnnotations = issues.filter(
      issue => issue.annotations && issue.annotations.length > 0,
    );

    let annotationText = '';
    if (issuesWithAnnotations.length > 0) {
      annotationText = `\n\nIssues with JIRA Links (${issuesWithAnnotations.length}/${issues.length}):\n`;
      issuesWithAnnotations.forEach(issue => {
        annotationText += `${issue.shortId || issue.id}: ${issue.title}\n`;
        issue.annotations.forEach(annotation => {
          annotationText += `${annotation.displayName}: ${annotation.url}\n`;
        });
      });
    } else {
      annotationText = '\n\nJIRA Links: None of the issues have linked JIRA tickets.';
    }

    return {
      content: [
        {
          type: 'text',
          text: `Found ${
            issues.length
          } issues in organization "${organization}":${filterText}${annotationText}\n\nIssues:\n${JSON.stringify(
            formattedIssues,
            null,
            2,
          )}`,
        },
      ],
    };
  }

  // Helper method to get token counter with model from args
  getTokenCounter(args) {
    return new TokenCounter(args.model);
  }

  // Get organizations
  async getOrganizations(args) {
    try {
      const validatedArgs = validateSchema(SentryOrganizationsSchema, args, TOOL_NAMES.GET_SENTRY_ORGANIZATIONS);
      const sentryService = this.createSentryService(validatedArgs);
      const response = await this.fetchOrganizations(sentryService);
      return this.getTokenCounter(validatedArgs).addTokenCounts(response, validatedArgs);
    } catch (error) {
      return ErrorHandler.handleError(error, TOOL_NAMES.GET_SENTRY_ORGANIZATIONS);
    }
  }

  // Get projects
  async getProjects(args) {
    try {
      const validatedArgs = validateSchema(SentryProjectsSchema, args, TOOL_NAMES.GET_SENTRY_PROJECTS);
      const sentryService = this.createSentryService(validatedArgs);
      const organization = this.getOrganization(validatedArgs);
      const response = await this.fetchProjects(sentryService, organization);
      return this.getTokenCounter(validatedArgs).addTokenCounts(response, validatedArgs);
    } catch (error) {
      return ErrorHandler.handleError(error, TOOL_NAMES.GET_SENTRY_PROJECTS);
    }
  }

  // Get issues
  async getIssues(args) {
    try {
      const validatedArgs = validateSchema(SentryIssuesSchema, args, TOOL_NAMES.GET_SENTRY_ISSUES);
      const sentryService = this.createSentryService(validatedArgs);
      const organization = this.getOrganization(validatedArgs);

      if (!organization && !validatedArgs.organization) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Organization is required for fetching issues. Provide it as a parameter or set a default organization.',
        );
      }

      // Handle relativeDays parameter to auto-calculate dates
      const issueOptions = {
        project: validatedArgs.project,
        dateFrom: validatedArgs.dateFrom,
        dateTo: validatedArgs.dateTo,
        sortBy: validatedArgs.sortBy,
        excludeErrorType: validatedArgs.excludeErrorType,
        errorMessage: validatedArgs.errorMessage,
        environment: validatedArgs.environment,
        limit: validatedArgs.limit,
        statsPeriod: validatedArgs.statsPeriod,
        groupStatsPeriod: validatedArgs.groupStatsPeriod,
        query: validatedArgs.query,
        expand: validatedArgs.expand,
        collapse: validatedArgs.collapse,
        cursor: validatedArgs.cursor,
      };

      // If relativeDays is provided and statsPeriod is not, calculate the actual dates
      if (validatedArgs.relativeDays && !validatedArgs.statsPeriod) {
        const { dateFrom, dateTo } = this.calculateRelativeDates(validatedArgs.relativeDays);
        issueOptions.dateFrom = dateFrom;
        issueOptions.dateTo = dateTo;
        issueOptions.relativeDaysUsed = validatedArgs.relativeDays;
        logger.info(
          `📅 Using relative date range: last ${validatedArgs.relativeDays} days (${dateFrom} to ${dateTo})`,
        );
      }

      const response = await this.fetchIssues(sentryService, organization, issueOptions);
      return this.getTokenCounter(validatedArgs).addTokenCounts(response, validatedArgs);
    } catch (error) {
      return ErrorHandler.handleError(error, TOOL_NAMES.GET_SENTRY_ISSUES);
    }
  }

  async getSentryIssueDetails(args) {
    try {
      const validatedArgs = validateSchema(SentryIssueDetailsSchema, args, TOOL_NAMES.GET_SENTRY_ISSUE_DETAILS);
      const sentryService = this.createSentryService(validatedArgs);
      const { 
        issueId, 
        includeTags, 
        environment, 
        trace, 
        deepDetails 
      } = validatedArgs;
      
      // Force optimization defaults unless explicitly requested
      const actualIncludeTags = includeTags === true ? true : false;
      const actualTrace = trace === false ? false : true; // Keep trace true by default for debugging
      const actualDeepDetails = deepDetails === true ? true : false;
      
      const checkDeepDetails = actualDeepDetails;

      logger.info(`🔎 Fetching details for Sentry issue: ${issueId}`);
      const issueDetails = await sentryService.getIssueDetails(
        this.getOrganization(validatedArgs),
        issueId,
      );
      logger.info(`✅ Fetched details for issue: ${issueId}`);

      let tags = null;
      let latestEvent = null;

      if (actualIncludeTags || checkDeepDetails) {
        try {
          tags = await sentryService.getIssueTags(
            this.getOrganization(validatedArgs),
            issueId,
            environment,
          );
        } catch (e) {
          logger.warn(`Could not fetch tags: ${e.message}`);
        }
      }

      if (actualTrace || checkDeepDetails) {
        try {
          latestEvent = await sentryService.getLatestEventForIssue(
            this.getOrganization(validatedArgs),
            issueId,
          );
        } catch (e) {
          logger.warn(`Could not fetch latest event: ${e.message}`);
        }
      }

      const currentDateInfo = this.getCurrentDateInfo();
      const formattedIssue = SentryFormatter.formatIssueDetails(
        issueDetails,
        tags,
        latestEvent,
        checkDeepDetails,
      );
      const markdown = SentryFormatter.issueToMarkdown(formattedIssue, currentDateInfo);

      const response = {
        content: [
          {
            type: 'text',
            text: `${markdown}\n\nDetailed Information:\n${JSON.stringify(formattedIssue, null, 2)}`,
          },
        ],
      };
      return this.getTokenCounter(validatedArgs).addTokenCounts(response, validatedArgs);
    } catch (error) {
      return ErrorHandler.handleError(error, TOOL_NAMES.GET_SENTRY_ISSUE_DETAILS);
    }
  }
}

module.exports = SentryHandler;
