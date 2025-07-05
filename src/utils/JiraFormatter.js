class JiraFormatter {
  /**
   * Format raw JIRA API response into structured data
   */
  static formatJiraResponse(data, atlassianDomain, deepDetails) {
    const fields = data.fields || {};

    const summary = fields.summary || 'No summary available';
    const description = (
      this.extractTextFromDocument(fields.description) || 'No description available'
    ).slice(0, 1000); // truncate to 1000 chars
    const status = fields.status?.name || 'Unknown';
    const priority = fields.priority?.name || 'Unknown';
    const issueType = fields.issuetype?.name || 'Unknown';
    const assignee = fields.assignee?.displayName || 'Unassigned';
    const reporter = fields.reporter?.displayName || 'Unknown';
    const created = fields.created ? new Date(fields.created).toLocaleDateString() : 'Unknown';
    const updated = fields.updated ? new Date(fields.updated).toLocaleDateString() : 'Unknown';
    const timeSpent = fields.timespent ? this.formatTimeSpent(fields.timespent) : 'None';

    // Only last 3 comments, each truncated to 300 chars unless deepDetails is true
    const recentComments = deepDetails
      ? this.getRecentComments(fields.comment, 10)
      : (this.getRecentComments(fields.comment, 3) || []).map(c => ({
          ...c,
          body: c.body ? c.body.slice(0, 300) : 'No comment body',
        }));

    return {
      key: data.key,
      summary,
      description,
      status,
      priority,
      issueType,
      assignee,
      reporter,
      created,
      updated,
      timeSpent,
      recentComments,
      url: `https://${atlassianDomain}/browse/${data.key}`,
    };
  }

  /**
   * Format structured JIRA data into readable text for MCP response
   */
  static formatJiraTicketResponse(data) {
    let response = `JIRA Ticket Details: ${data.key}\n\n`;

    response += `Summary: ${data.summary}\n`;
    response += `Status: ${data.status}\n`;
    response += `Priority: ${data.priority}\n`;
    response += `Type: ${data.issueType}\n`;
    response += `Assignee: ${data.assignee}\n`;
    response += `Reporter: ${data.reporter}\n`;
    response += `Created: ${data.created}\n`;
    response += `Updated: ${data.updated}\n`;
    response += `Time Spent: ${data.timeSpent}\n`;
    response += `URL: ${data.url}\n\n`;

    response += `Description:\n${data.description}\n\n`;

    if (data.recentComments && data.recentComments.length > 0) {
      response += `Recent (${data.recentComments.length}) Comments:\n`;
      data.recentComments.forEach((comment, index) => {
        response += `\n${index + 1}. ${comment.author} (${comment.created} at ${comment.createdTime})\n`;
        response += `   ${comment.body}\n`;
      });
    } else {
      response += 'No recent comments found.\n';
    }

    return response;
  }

  /**
   * Extract text content from JIRA document format
   */
  static extractTextFromDocument(doc) {
    if (!doc || !doc.content) return '';

    let text = '';
    for (const item of doc.content) {
      if (item.type === 'paragraph' && item.content) {
        for (const contentItem of item.content) {
          if (contentItem.type === 'text' && contentItem.text) {
            text += `${contentItem.text} `;
          }
        }
        text += '\n';
      }
    }
    return text.trim();
  }

  /**
   * Format time spent in seconds to readable format
   */
  static formatTimeSpent(seconds) {
    if (!seconds) return '0';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Get recent comments from JIRA issue
   */
  static getRecentComments(comment, limit = 5) {
    if (!comment || !comment.comments || comment.comments.length === 0) {
      return [];
    }

    const comments = comment.comments.slice(-limit);

    return comments
      .map(c => {
        const author = c.author?.displayName || 'Unknown';
        const created = c.created ? new Date(c.created).toLocaleDateString() : 'Unknown';
        const createdTime = c.created ? new Date(c.created).toLocaleTimeString() : 'Unknown';
        const body = this.extractTextFromDocument(c.body) || 'No content';

        return {
          author,
          created,
          createdTime,
          body: body.length > 500 ? `${body.substring(0, 500)}...` : body,
          fullBody: body,
        };
      })
      .reverse();
  }
}

module.exports = JiraFormatter;
