class JiraFormatter {
  /**
   * Format raw JIRA API response into structured data
   */
  static formatJiraResponse(data, atlassianDomain) {
    const fields = data.fields || {};

    const summary = fields.summary || 'No summary available';
    const description =
      this.extractTextFromDocument(fields.description) || 'No description available';
    const status = fields.status?.name || 'Unknown';
    const statusCategory = fields.status?.statusCategory?.name || 'Unknown';
    const priority = fields.priority?.name || 'Unknown';
    const issueType = fields.issuetype?.name || 'Unknown';
    const assignee = fields.assignee?.displayName || 'Unassigned';
    const reporter = fields.reporter?.displayName || 'Unknown';
    const created = fields.created ? new Date(fields.created).toLocaleDateString() : 'Unknown';
    const updated = fields.updated ? new Date(fields.updated).toLocaleDateString() : 'Unknown';

    const fixVersions = fields.fixVersions?.map(v => v.name).join(', ') || 'None';

    const components = fields.components?.map(c => c.name).join(', ') || 'None';

    const timeSpent = fields.timespent ? this.formatTimeSpent(fields.timespent) : 'None';
    const timeEstimate = fields.timeestimate ? this.formatTimeSpent(fields.timeestimate) : 'None';

    const commentCount = fields.comment?.total || 0;

    const attachmentCount = fields.attachment?.length || 0;

    const recentComments = this.getRecentComments(fields.comment, 5);

    return {
      key: data.key,
      summary,
      description,
      status,
      statusCategory,
      priority,
      issueType,
      assignee,
      reporter,
      created,
      updated,
      fixVersions,
      components,
      timeSpent,
      timeEstimate,
      commentCount,
      attachmentCount,
      recentComments,
      url: `https://${atlassianDomain}/browse/${data.key}`,

      rawData: data,
    };
  }

  /**
   * Format structured JIRA data into readable text for MCP response
   */
  static formatJiraTicketResponse(data) {
    let response = `🎫 **JIRA Ticket Details: ${data.key}**\n\n`;

    response += `**Summary:** ${data.summary}\n`;
    response += `**Status:** ${data.status} (${data.statusCategory})\n`;
    response += `**Priority:** ${data.priority}\n`;
    response += `**Type:** ${data.issueType}\n`;
    response += `**Assignee:** ${data.assignee}\n`;
    response += `**Reporter:** ${data.reporter}\n`;
    response += `**Created:** ${data.created}\n`;
    response += `**Updated:** ${data.updated}\n`;

    if (data.fixVersions && data.fixVersions !== 'None') {
      response += `**Fix Versions:** ${data.fixVersions}\n`;
    }

    if (data.components && data.components !== 'None') {
      response += `**Components:** ${data.components}\n`;
    }

    if (data.timeSpent && data.timeSpent !== 'None') {
      response += `**Time Spent:** ${data.timeSpent}\n`;
    }

    if (data.timeEstimate && data.timeEstimate !== 'None') {
      response += `**Time Estimate:** ${data.timeEstimate}\n`;
    }

    response += `**Comments:** ${data.commentCount}\n`;
    response += `**Attachments:** ${data.attachmentCount}\n`;

    response += `**URL:** ${data.url}\n\n`;

    response += `**Description:**\n${data.description}\n\n`;

    if (data.recentComments && data.recentComments.length > 0) {
      response += `**Recent Comments (Last ${data.recentComments.length}):**\n`;
      data.recentComments.forEach((comment, index) => {
        response += `\n${index + 1}. **${comment.author}** (${comment.created} at ${comment.createdTime})\n`;
        response += `   ${comment.body}\n`;
      });
    } else {
      response += '**No recent comments found.**\n';
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
