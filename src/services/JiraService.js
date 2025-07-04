const JiraFormatter = require('../utils/JiraFormatter');

class JiraService {
  constructor(atlassianDomain, jiraAccessToken, jiraUserEmail) {
    this.jiraAccessToken = jiraAccessToken;
    this.jiraUserEmail = jiraUserEmail;
    this.atlassianDomain = atlassianDomain;
    this.apiBase = `https://${atlassianDomain}/rest/api/3`;
  }

  getHeaders() {
    const credentials = `${this.jiraUserEmail}:${this.jiraAccessToken}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');

    return {
      Authorization: `Basic ${encodedCredentials}`,
      'Content-Type': 'application/json',
    };
  }

  async getJiraTicketDetails(ticketKey) {
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
      return JiraFormatter.formatJiraResponse(json, this.atlassianDomain);
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`JIRA API request timed out after 15 seconds for ticket: ${ticketKey}`);
      }
      throw new Error(`Failed to fetch JIRA ticket details: ${error.message}`);
    }
  }
}

module.exports = JiraService;
