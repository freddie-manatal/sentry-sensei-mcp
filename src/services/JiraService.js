const JiraFormatter = require('../utils/JiraFormatter');

/**
 * JIRA Service for interacting with JIRA Cloud REST API v3
 *
 * Uses Basic Authentication with email and API token
 * Base URL: https://{domain}/rest/api/3
 *
 * References:
 * - JIRA Cloud REST API: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 * - Authentication: https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/
 */
class JiraService {
  /**
   * Initialize JIRA service with authentication credentials
   *
   * @param {string} atlassianDomain - JIRA domain (e.g., 'company.atlassian.net')
   * @param {string} jiraAccessToken - JIRA API token
   * @param {string} jiraUserEmail - JIRA user email for authentication
   */
  constructor(atlassianDomain, jiraAccessToken, jiraUserEmail) {
    this.jiraAccessToken = jiraAccessToken;
    this.jiraUserEmail = jiraUserEmail;
    this.atlassianDomain = atlassianDomain;
    this.apiBase = `https://${atlassianDomain}/rest/api/3`;
    this.fieldMappings = null;
  }

  /**
   * Generate Basic Authentication headers for JIRA API requests
   *
   * Uses email:token combination encoded in base64
   * Reference: https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/
   *
   * @returns {Object} HTTP headers with Authorization and Content-Type
   */
  getHeaders() {
    const credentials = `${this.jiraUserEmail}:${this.jiraAccessToken}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');

    return {
      Authorization: `Basic ${encodedCredentials}`,
      'Content-Type': 'application/json',
    };
  }

  async getJiraIssueFields() {
    // URL: GET /rest/api/3/field
    const url = `${this.apiBase}/field`;
    try {
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`JIRA API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('JIRA API request timed out after 15 seconds');
      }
      throw new Error(`Failed to fetch JIRA issue fields: ${error.message}`);
    }
  }

  async getFieldMappings() {
    if (!this.fieldMappings) {
      const fields = await this.getJiraIssueFields();
      this.fieldMappings = {};

      fields.forEach(field => {
        this.fieldMappings[field.id] = {
          name: field.name,
          key: field.key,
          custom: field.custom,
          schema: field.schema,
        };
      });
    }

    return this.fieldMappings;
  }
  /**
   * Retrieve detailed information about a JIRA issue/ticket
   *
   * Endpoint: GET /rest/api/3/issue/{issueIdOrKey}
   * Reference: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get
   *
   * Returns comprehensive issue data including:
   * - Basic info (key, summary, status, priority, assignee)
   * - Detailed fields (description, labels, components, fix versions)
   * - Comments and change history (when deepDetails=true)
   * - Custom fields and workflow transitions
   *
   * @param {string} ticketKey - JIRA issue key (e.g., 'PROJ-123')
   * @param {boolean} deepDetails - Include full comment history and extended details
   * @returns {Promise<Object>} Formatted JIRA ticket details
   */
  async getJiraTicketDetails(ticketKey, deepDetails) {
    // URL: GET /rest/api/3/issue/{ticketKey}
    const url = `${this.apiBase}/issue/${ticketKey}`;

    try {
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`JIRA API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const json = await response.json();
      const fieldMappings = await this.getFieldMappings();
      return JiraFormatter.formatJiraResponse(
        json,
        this.atlassianDomain,
        deepDetails,
        fieldMappings,
      );
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`JIRA API request timed out after 15 seconds for ticket: ${ticketKey}`);
      }
      throw new Error(`Failed to fetch JIRA ticket details: ${error.message}`);
    }
  }
}

module.exports = JiraService;
