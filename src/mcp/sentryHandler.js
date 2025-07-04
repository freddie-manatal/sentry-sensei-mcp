import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { SentryService } from '../services/index.js';
import { Logger } from '../utils/index.js';

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

    // Format organizations with more details
    const formattedOrgs = organizations.map(org => ({
      id: org.id,
      slug: org.slug,
      name: org.name,
      status: org.status,
      dateCreated: org.dateCreated,
      isEarlyAdopter: org.isEarlyAdopter,
      require2FA: org.require2FA,
      avatar: org.avatar,
      links: org.links,
      features: org.features ? org.features.slice(0, 10) : [], // Limit features for readability
    }));

    const currentDateInfo = this.getCurrentDateInfo();

    return {
      content: [
        {
          type: 'text',
          text: `**Current Date/Time:** ${currentDateInfo.currentDateTime} (${currentDateInfo.timezone})\n\nFound ${organizations.length} organizations:\n\n${organizations
            .map(org => `- ${org.name} (${org.slug}) - ID: ${org.id}`)
            .join('\n')}\n\n**Detailed Information:**\n${JSON.stringify(formattedOrgs, null, 2)}`,
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
    const contextMsg = organization ? `in "${organization}"` : 'accessible to you';
    logger.info(`📊 Found ${projects.length} projects ${contextMsg}`);

    // Format projects with more details
    const formattedProjects = projects.map(project => ({
      id: project.id,
      slug: project.slug,
      name: project.name,
      platform: project.platform,
      dateCreated: project.dateCreated,
      isBookmarked: project.isBookmarked,
      isMember: project.isMember,
      teams: project.teams
        ? project.teams.map(team => ({
            id: team.id,
            slug: team.slug,
            name: team.name,
          }))
        : [],
      features: project.features ? project.features.slice(0, 5) : [], // Limit features for readability
      access: project.access || [],
    }));

    const currentDateInfo = this.getCurrentDateInfo();

    return {
      content: [
        {
          type: 'text',
          text: `**Current Date/Time:** ${currentDateInfo.currentDateTime} (${currentDateInfo.timezone})\n\nFound ${projects.length} projects ${contextMsg}:\n\n${projects
            .map(
              project =>
                `- ${project.name} (${project.slug}) - ID: ${project.id} - Platform: ${project.platform}`,
            )
            .join('\n')}\n\n**Detailed Information:**\n${JSON.stringify(
            formattedProjects,
            null,
            2,
          )}`,
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

    // Format issues with comprehensive details
    const formattedIssues = issues.map(issue => ({
      id: issue.id,
      shareId: issue.shareId,
      shortId: issue.shortId,
      title: issue.title,
      culprit: issue.culprit,
      permalink: issue.permalink,
      logger: issue.logger,
      level: issue.level,
      status: issue.status,
      statusDetails: issue.statusDetails,
      substatus: issue.substatus,
      isPublic: issue.isPublic,
      platform: issue.platform,
      type: issue.type,
      issueType: issue.issueType,
      count: issue.count,
      userCount: issue.userCount || 0,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
      numComments: issue.numComments,
      assignedTo: issue.assignedTo,
      isBookmarked: issue.isBookmarked,
      isSubscribed: issue.isSubscribed,
      subscriptionDetails: issue.subscriptionDetails,
      hasSeen: issue.hasSeen,
      annotations: issue.annotations,
      project: issue.project
        ? {
            id: issue.project.id,
            name: issue.project.name,
            slug: issue.project.slug,
            platform: issue.project.platform,
          }
        : null,
      metadata: issue.metadata
        ? {
            type: issue.metadata.type,
            value: issue.metadata.value,
            filename: issue.metadata.filename,
            function: issue.metadata.function,
            title: issue.metadata.title,
            severity: issue.metadata.severity,
            initial_priority: issue.metadata.initial_priority,
          }
        : null,
    }));

    // Build filter summary including current date context
    const currentDateInfo = this.getCurrentDateInfo();
    const filterSummary = [
      `Query executed on: ${currentDateInfo.currentDateTime} (${currentDateInfo.timezone})`,
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
      shortIdLookup: args.shortIdLookup,
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
    const organization = this.getOrganization(args);
    const issueId = args.issueId;
    try {
      const issueDetails = await sentryService.getIssueDetails(organization, issueId);
      const issueTags = args.includeTags
        ? await sentryService.getIssueTags(organization, issueId, args.environment)
        : null;

      // Format the issue details
      const formattedIssue = {
        id: issueDetails.id,
        shareId: issueDetails.shareId,
        shortId: issueDetails.shortId,
        title: issueDetails.title,
        culprit: issueDetails.culprit,
        permalink: issueDetails.permalink,
        logger: issueDetails.logger,
        level: issueDetails.level,
        status: issueDetails.status,
        statusDetails: issueDetails.statusDetails,
        substatus: issueDetails.substatus,
        isPublic: issueDetails.isPublic,
        platform: issueDetails.platform,
        type: issueDetails.type,
        issueType: issueDetails.issueType,
        count: issueDetails.count,
        userCount: issueDetails.userCount || 0,
        firstSeen: issueDetails.firstSeen,
        lastSeen: issueDetails.lastSeen,
        numComments: issueDetails.numComments,
        assignedTo: issueDetails.assignedTo,
        isBookmarked: issueDetails.isBookmarked,
        isSubscribed: issueDetails.isSubscribed,
        subscriptionDetails: issueDetails.subscriptionDetails,
        hasSeen: issueDetails.hasSeen,
        annotations: issueDetails.annotations,
        project: issueDetails.project
          ? {
              id: issueDetails.project.id,
              name: issueDetails.project.name,
              slug: issueDetails.project.slug,
              platform: issueDetails.project.platform,
            }
          : null,
        metadata: issueDetails.metadata
          ? {
              type: issueDetails.metadata.type,
              value: issueDetails.metadata.value,
              filename: issueDetails.metadata.filename,
              function: issueDetails.metadata.function,
              title: issueDetails.metadata.title,
              severity: issueDetails.metadata.severity,
              initial_priority: issueDetails.metadata.initial_priority,
            }
          : null,
        tags: issueTags,
      };

      // Get current date info for context
      const currentDateInfo = this.getCurrentDateInfo();

      // Build annotation summary if present
      let annotationText = '';
      if (formattedIssue.annotations && formattedIssue.annotations.length > 0) {
        annotationText = '\n\n**JIRA Links:**\n';
        formattedIssue.annotations.forEach(annotation => {
          annotationText += `→ ${annotation.displayName}: ${annotation.url}\n`;
        });
      } else {
        annotationText = '\n\n**JIRA Links:** No linked JIRA tickets found.';
      }

      // Build the formatted text response
      const responseText = [
        `**Current Date/Time:** ${currentDateInfo.currentDateTime} (${currentDateInfo.timezone})\n`,
        `**Issue:** ${formattedIssue.shortId || formattedIssue.id} - ${formattedIssue.title}`,
        `**Status:** ${formattedIssue.status}`,
        `**Level:** ${formattedIssue.level}`,
        `**First Seen:** ${formattedIssue.firstSeen}`,
        `**Last Seen:** ${formattedIssue.lastSeen}`,
        `**Event Count:** ${formattedIssue.count}`,
        `**User Count:** ${formattedIssue.userCount}`,
        `**Project:** ${formattedIssue.project ? formattedIssue.project.name : 'Unknown'}`,
        `**Platform:** ${formattedIssue.platform}`,
        annotationText,
        '\n**Detailed Information:**',
        JSON.stringify(formattedIssue, null, 2),
      ].join('\n');

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    } catch (error) {
      logger.error('Error fetching Sentry issue details:', error);
      throw error;
    }
  }
}

export default SentryHandler;
