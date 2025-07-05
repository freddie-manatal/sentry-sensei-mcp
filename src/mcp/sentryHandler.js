const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');
const { SentryService } = require('../services/index.js');
const { Logger, SentryFormatter } = require('../utils/index.js');

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

class SentryHandler {
  constructor(defaultSentryHost, defaultOrganization, cliToken) {
    this.defaultSentryHost = defaultSentryHost;
    this.defaultOrganization = defaultOrganization;
    this.cliToken = cliToken;
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
    return this.cliToken || process.env.SENTRY_TOKEN;
  }

  getSentryHost() {
    return this.defaultSentryHost;
  }

  getOrganization(args) {
    return args.organization || this.defaultOrganization;
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
        ? `\n\n**Query Information:**\n${filterSummary.map(f => `- ${f}`).join('\n')}`
        : '';

    // Build annotation summary
    const issuesWithAnnotations = issues.filter(
      issue => issue.annotations && issue.annotations.length > 0,
    );

    let annotationText = '';
    if (issuesWithAnnotations.length > 0) {
      annotationText = `\n\n**Issues with JIRA Links (${issuesWithAnnotations.length}/${issues.length}):**\n`;
      issuesWithAnnotations.forEach(issue => {
        annotationText += `- ${issue.shortId || issue.id}: ${issue.title}\n`;
        issue.annotations.forEach(annotation => {
          annotationText += `  → ${annotation.displayName}: ${annotation.url}\n`;
        });
      });
    } else {
      annotationText = '\n\n**JIRA Links:** None of the issues have linked JIRA tickets.';
    }

    return {
      content: [
        {
          type: 'text',
          text: `Found ${
            issues.length
          } issues in organization "${organization}":${filterText}${annotationText}\n\n**Issues:**\n${JSON.stringify(
            formattedIssues,
            null,
            2,
          )}`,
        },
      ],
    };
  }

  // Get organizations
  async getOrganizations(args) {
    const sentryService = this.createSentryService(args);
    return this.fetchOrganizations(sentryService);
  }

  // Get projects
  async getProjects(args) {
    const sentryService = this.createSentryService(args);
    const organization = this.getOrganization(args);
    return this.fetchProjects(sentryService, organization);
  }

  // Get issues
  async getIssues(args) {
    const sentryService = this.createSentryService(args);
    const organization = this.getOrganization(args);

    if (!organization && !args.organization) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Organization is required for fetching issues. Provide it as a parameter or set a default organization.',
      );
    }

    // Handle relativeDays parameter to auto-calculate dates
    const issueOptions = {
      project: args.project,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      sortBy: args.sortBy,
      excludeErrorType: args.excludeErrorType,
      errorMessage: args.errorMessage,
      environment: args.environment,
      limit: args.limit,
      statsPeriod: args.statsPeriod,
      groupStatsPeriod: args.groupStatsPeriod,
      query: args.query,
      expand: args.expand,
      collapse: args.collapse,
      cursor: args.cursor,
    };

    // If relativeDays is provided and statsPeriod is not, calculate the actual dates
    if (args.relativeDays && !args.statsPeriod) {
      const { dateFrom, dateTo } = this.calculateRelativeDates(args.relativeDays);
      issueOptions.dateFrom = dateFrom;
      issueOptions.dateTo = dateTo;
      issueOptions.relativeDaysUsed = args.relativeDays; // Track this for display

      logger.info(
        `📅 Using relative date range: last ${args.relativeDays} days (${dateFrom} to ${dateTo})`,
      );
    }

    return this.fetchIssues(sentryService, organization, issueOptions);
  }

  async getSentryIssueDetails(args) {
    const sentryService = this.createSentryService(args);
    const {
      organization,
      issueId,
      includeTags,
      environment,
      trace,
      checkDeepDetails,
    } = args;

    try {
      // Fetch issue details
      logger.info(`🔎 Fetching details for Sentry issue: ${issueId}`);
      const issueDetails = await sentryService.getIssueDetails(organization, issueId);
      logger.info(`✅ Fetched details for issue: ${issueId}`);

      // Always fetch tags if checkDeepDetails is true
      let tags = null;
      if (includeTags || checkDeepDetails) {
        try {
          logger.info(`🏷️ Fetching tags for issue: ${issueId}`);
          tags = await sentryService.getIssueTags(organization, issueId, environment);
          logger.info(`✅ Fetched tags for issue: ${issueId}`);
        } catch (e) {
          logger.warn(`Could not fetch tags for issue ${issueId}: ${e.message}`);
        }
      }

      // Always fetch latest event if checkDeepDetails is true
      let latestEvent = null;
      if (trace || checkDeepDetails) {
        try {
          logger.info(`📄 Fetching latest event for issue ${issueId} to get stacktrace.`);
          latestEvent = await sentryService.getLatestEventForIssue(organization, issueId);
          logger.info(`✅ Fetched latest event for issue ${issueId}.`);
        } catch (e) {
          logger.warn(`Could not fetch latest event for issue ${issueId}: ${e.message}`);
          // Continue without stacktrace
        }
      }

      // Format with SentryFormatter
      const currentDateInfo = this.getCurrentDateInfo();
      const formattedIssue = SentryFormatter.formatIssueDetails(
        issueDetails,
        tags,
        latestEvent,
        checkDeepDetails // Pass checkDeepDetails to formatter
      );
      const markdown = SentryFormatter.issueToMarkdown(formattedIssue, currentDateInfo);

      return {
        content: [
          {
            type: 'text',
            text: `${markdown}\n\n**Detailed Information:**\n${JSON.stringify(formattedIssue, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      logger.error('Error fetching Sentry issue details:', error);
      throw error;
    }
  }
}

module.exports = SentryHandler;
