const fetch = require('node-fetch');
const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');

class SentryService {
  constructor(token, domain = 'sentry.io') {
    this.sentryDomain = domain;
    this.sentryToken = token;
    this.apiBase = `https://${domain}/api/0`;
    this.sentryApiBase = 'https://sentry.io/api/0';
    this.headers = this.getHeaders();
  }

  getHeaders() {
    if (!this.sentryToken) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Sentry API token is required. Provide it as a parameter, pass --token argument, or set SENTRY_TOKEN environment variable.',
      );
    }
    return {
      Authorization: `Bearer ${this.sentryToken}`,
      'Content-Type': 'application/json',
    };
  }

  async fetchJson(url, description = 'API call') {
    try {
      const response = await fetch(url, {
        headers: this.headers,
        timeout: 30000,
      });

      if (!response.ok) {
        throw new Error(`${description} failed: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      return json;
    } catch (error) {
      throw new Error(`${description}: ${error.message}`);
    }
  }

  /**
   * List organizations available to the authenticated user
   *
   * Endpoint: GET /api/0/organizations/
   * Reference: https://docs.sentry.io/api/organizations/list-your-organizations/
   *
   * @returns {Promise<Array>} Array of organization objects
   */
  async getOrganizations() {
    const url = `${this.apiBase}/organizations/`;
    return await this.fetchJson(url, 'Fetching organizations');
  }

  /**
   * List projects in an organization or all accessible projects
   *
   * Endpoints:
   * - GET /api/0/organizations/{organization_slug}/projects/ (organization-specific)
   * - GET /api/0/projects/ (all accessible projects)
   *
   * References:
   * - https://docs.sentry.io/api/projects/list-your-projects/
   * - https://docs.sentry.io/api/organizations/list-an-organizations-projects/
   *
   * @param {string|null} organization - Organization slug (optional)
   * @returns {Promise<Array>} Array of project objects
   */
  async getProjects(organization = null) {
    let url;
    if (organization) {
      // Organization-specific projects
      url = `${this.apiBase}/organizations/${encodeURIComponent(organization)}/projects/`;
    } else {
      // All projects the user has access to
      url = `${this.apiBase}/projects/`;
    }
    return await this.fetchJson(url, 'Fetching projects');
  }

  /**
   * List issues in an organization with filtering and search capabilities
   *
   * Endpoint: GET /api/0/organizations/{organization_slug}/issues/
   * Reference: https://docs.sentry.io/api/events/list-a-projects-issues/
   *
   * Supports advanced filtering:
   * - Date ranges (start/end or statsPeriod)
   * - Environment filtering
   * - Project filtering
   * - Search queries (is:unresolved, error.type, message, etc.)
   * - Sorting options (freq, date, new, trends, user, inbox)
   * - Pagination with cursor
   * - Field collapse for performance optimization
   *
   * @param {string} organization - Organization slug
   * @param {Object} options - Filter and search options
   * @returns {Promise<Array>} Array of issue objects
   */
  async getSentryIssuesList(organization, options = {}) {
    const {
      project, // Can be array of project IDs or single project ID
      dateFrom,
      dateTo,
      sortBy = 'freq',
      excludeErrorType,
      errorMessage,
      environment,
      limit = 10,
      issue,
      utc = true,
      statsPeriod,
      groupStatsPeriod,
      query: customQuery,
      collapse,
      cursor,
    } = options;

    // Build query parts
    const queryParts = [];

    // Add custom query if provided, otherwise use default
    if (customQuery !== undefined) {
      if (customQuery) {
        queryParts.push(customQuery);
      }
    } else {
      queryParts.push('is:unresolved');
    }

    if (issue) {
      queryParts.push(`issue:"${issue}"`);
    }

    if (excludeErrorType) {
      queryParts.push(`!error.type:"${excludeErrorType}"`);
    }

    if (errorMessage) {
      queryParts.push(`message:"${errorMessage}"`);
    }

    const query = queryParts.join(' ');

    // Build URL parameters
    const params = new URLSearchParams({
      sort: sortBy,
      limit: limit.toString(),
      utc: utc ? 'true' : 'false',
    });

    // Add query if not empty
    if (query.trim()) {
      params.append('query', query);
    }

    // Add statsPeriod if provided (overrides dateFrom/dateTo)
    if (statsPeriod) {
      params.append('statsPeriod', statsPeriod);
    } else {
      // Set date range if statsPeriod not provided
      let startDate = dateFrom;
      let endDate = dateTo;

      if (!startDate || !endDate) {
        const range = this.getPreviousWeekRange();
        startDate = startDate || range.startDate;
        endDate = endDate || range.endDate;
      }

      // Remove 'Z' suffix from dates for Sentry API compatibility
      const formatDateForSentry = dateStr => {
        return dateStr ? dateStr.replace(/Z$/, '') : dateStr;
      };

      params.append('start', formatDateForSentry(startDate));
      params.append('end', formatDateForSentry(endDate));
    }

    // Add groupStatsPeriod if provided
    if (groupStatsPeriod) {
      params.append('groupStatsPeriod', groupStatsPeriod);
    }

    // Add environment if specified
    if (environment) {
      if (Array.isArray(environment)) {
        environment.forEach(env => params.append('environment', env));
      } else {
        params.append('environment', environment);
      }
    }

    // Add project(s) if specified
    if (project) {
      if (Array.isArray(project)) {
        project.forEach(proj => params.append('project', proj.toString()));
      } else {
        params.append('project', project.toString());
      }
    }

    // Add collapse fields if specified
    if (collapse && Array.isArray(collapse) && collapse.length > 0) {
      collapse.forEach(field => params.append('collapse', field));
    }

    // Add cursor if specified
    if (cursor) {
      params.append('cursor', cursor);
    }

    // Add shortIdLookup
    params.append('shortIdLookup', '1');

    // Use organization-level issues endpoint
    // URL: GET /api/0/organizations/{organization_slug}/issues/?{params}
    const url = `${this.apiBase}/organizations/${encodeURIComponent(organization)}/issues/?${params}`;
    return await this.fetchJson(url, 'Fetching issues');
  }

  getPreviousWeekRange() {
    // Use UTC to avoid timezone issues
    const today = new Date();
    const utcToday = new Date(today.getTime() + today.getTimezoneOffset() * 60000);
    const currentDay = utcToday.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.

    // Calculate last Sunday (end of previous week)
    const lastSunday = new Date(utcToday);
    lastSunday.setUTCDate(utcToday.getUTCDate() - currentDay);
    lastSunday.setUTCHours(23, 59, 59, 999); // End of day

    // Calculate last Monday (start of previous week)
    const lastMonday = new Date(lastSunday);
    lastMonday.setUTCDate(lastSunday.getUTCDate() - 6);
    lastMonday.setUTCHours(0, 0, 0, 0); // Start of day

    // Format dates for Sentry API (ISO format)
    const formatForSentry = date => {
      return date.toISOString().replace(/\.\d{3}Z$/, ''); // Remove milliseconds, keep timezone
    };

    // Format dates for display (YYYY-MM-DD)
    const formatForDisplay = date => {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return {
      startDate: formatForSentry(lastMonday),
      endDate: formatForSentry(lastSunday),
      startDateDisplay: formatForDisplay(lastMonday),
      endDateDisplay: formatForDisplay(lastSunday),
      rangeStr: `${formatForDisplay(lastMonday)} - ${formatForDisplay(lastSunday)}`,
    };
  }

  /**
   * Retrieve detailed information about a specific issue
   *
   * Endpoint: GET /api/0/organizations/{organization_slug}/issues/{issue_id}/
   * Reference: https://docs.sentry.io/api/events/retrieve-an-issue/
   *
   * @param {string} organization - Organization slug
   * @param {number} issueId - Numeric issue ID
   * @returns {Promise<Object>} Issue details object
   */
  async getIssueDetails(organization, issueId) {
    const response = await this.fetchJson(
      `${this.sentryApiBase}/organizations/${organization}/issues/${issueId}/`,
    );
    return response;
  }

  /**
   * Retrieve the latest event for a specific issue
   *
   * Endpoint: GET /api/0/organizations/{organization_slug}/issues/{issue_id}/events/latest/
   * Reference: https://docs.sentry.io/api/events/retrieve-the-latest-event-for-an-issue/
   *
   * @param {string} organization - Organization slug
   * @param {number} issueId - Numeric issue ID
   * @returns {Promise<Object>} Latest event object with stack trace and context
   */
  async getLatestEventForIssue(organization, issueId) {
    const url = `${this.sentryApiBase}/organizations/${organization}/issues/${issueId}/events/latest/`;
    return this.fetchJson(url, `Fetching latest event for issue ${issueId}`);
  }

  /**
   * List tags for a specific issue
   *
   * Endpoint: GET /api/0/organizations/{organization_slug}/issues/{issue_id}/tags/
   * Reference: https://docs.sentry.io/api/events/list-an-issues-tags/
   *
   * @param {string} organization - Organization slug
   * @param {number} issueId - Numeric issue ID
   * @param {string} environment - Environment filter (optional)
   * @returns {Promise<Array>} Array of tag objects
   */
  async getIssueTags(organization, issueId, environment) {
    const response = await this.fetchJson(
      `${this.sentryApiBase}/organizations/${organization}/issues/${issueId}/tags/`,
      {
        params: {
          environment,
          limit: 3,
          readable: true,
        },
      },
    );
    return response;
  }

  /**
   * Retrieve a specific event for an issue
   *
   * Endpoint: GET /api/0/organizations/{organization_slug}/issues/{issue_id}/events/{event_id}/
   * Reference: https://docs.sentry.io/api/events/retrieve-an-event-for-an-issue/
   *
   * @param {string} organization - Organization slug
   * @param {string} environment - Environment filter (optional)
   * @param {string} event_id - Event ID
   * @param {number} issue_id - Issue ID
   * @returns {Promise<Object>} Event object with full details
   */
  async getIssueEvents(organization, environment, event_id, issue_id) {
    const response = await this.fetchJson(
      `${this.sentryApiBase}/organizations/${organization}/issues/${issue_id}/events/${event_id}/`,
      {
        params: {
          environment,
        },
      },
    );
    return response;
  }
}

module.exports = SentryService;
