class JiraFormatter {
  static INCLUDED_CUSTOM_FIELDS = [
    'Acceptance Criteria',
    'Action Plan',
    'Deliverables',
    'Epic Link',
    'Start Date',
    'Due Date',
    'Story Points',
    'Epic Link',
    'Team',
    'Flagged',
    'Time to investigate',
    'Time to bugs/issues fixed',
    'Time To Resolution SLA (Negotiated)',
    'Time to Investigate SLA (Actual)',
    'Time to Data Migration Implementation',
    'Test Case',
    'Additional Test Scope',
    'Labels',
    'Sprint',
    'Step to Reproduce',
    'Expected Results',
    'Actual Results',
    'Sprint',
    'Squad',
    'Design',
    'Atlassian project status',
  ];

  /**
   * Format raw JIRA API response into structured data
   */
  static formatJiraResponse(data, atlassianDomain, deepDetails, fieldMappings = {}) {
    const fields = data.fields || {};

    const summary = fields.summary || 'No summary available';
    const description = (
      this.extractTextFromDocument(fields.description) || 'No description available'
    ).slice(0, deepDetails ? 1000 : 500); // 500 chars in standard mode, 1000 in deep mode
    const status = fields.status?.name || 'Unknown';
    const priority = fields.priority?.name || 'Unknown';
    const issueType = fields.issuetype?.name || 'Unknown';
    const assignee = fields.assignee?.displayName || 'Unassigned';
    const reporter = fields.reporter?.displayName || 'Unknown';
    const created = fields.created ? new Date(fields.created).toLocaleDateString() : 'Unknown';
    const updated = fields.updated ? new Date(fields.updated).toLocaleDateString() : 'Unknown';
    const timeSpent = fields.timespent ? this.formatTimeSpent(fields.timespent) : 'None';

    // Token-optimized comments: 2 in standard mode, 5 in deep mode
    const recentComments = deepDetails
      ? this.getRecentComments(fields.comment, 5)
      : (this.getRecentComments(fields.comment, 2) || []).map(c => ({
          ...c,
          body: c.body ? c.body.slice(0, 200) : 'No comment body', // Reduced from 300 to 200
        }));

    const customFields = this.extractCustomFields(fields, fieldMappings);
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
      customFields,
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
    // Reduce fields in standard mode - reporter, time tracking often not critical
    if (data.assignee !== 'Unassigned') response += `Reporter: ${data.reporter}\n`;
    response += `Created: ${data.created}\n`;
    response += `Updated: ${data.updated}\n`;
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

    if (data.customFields && data.customFields.length > 0) {
      response += '\nCustom Fields:\n';
      data.customFields.forEach(field => {
        response += `${field.name}: ${field.value}\n`;
      });
    }

    return response;
  }

  /**
   * Extract text content from JIRA document format
   */
  static extractTextFromDocument(doc) {
    if (!doc || !doc.content) return '';

    let text = '';

    const processContent = content => {
      for (const item of content) {
        if (item.type === 'paragraph' && item.content) {
          for (const contentItem of item.content) {
            if (contentItem.type === 'text' && contentItem.text) {
              text += `${contentItem.text} `;
            }
          }
          text += '\n';
        } else if (item.type === 'bulletList' && item.content) {
          for (const listItem of item.content) {
            if (listItem.type === 'listItem' && listItem.content) {
              text += '• ';
              processContent(listItem.content);
            }
          }
        } else if (item.type === 'orderedList' && item.content) {
          item.content.forEach((listItem, index) => {
            if (listItem.type === 'listItem' && listItem.content) {
              text += `${index + 1}. `;
              processContent(listItem.content);
            }
          });
        }
      }
    };

    processContent(doc.content);
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

  static extractCustomFields(fields, fieldMappings) {
    const customFields = [];

    Object.keys(fields).forEach(fieldId => {
      if (fieldId.startsWith('customfield_')) {
        const fieldInfo = fieldMappings[fieldId];

        if (fieldInfo && fieldInfo.custom) {
          // Only include fields that are in the whitelist
          if (!this.INCLUDED_CUSTOM_FIELDS.includes(fieldInfo.name)) {
            return;
          }

          const value = this.formatCustomFieldValue(fields[fieldId], fieldInfo);
          if (value) {
            customFields.push({
              id: fieldId,
              name: fieldInfo.name,
              value: value,
            });
          }
        }
      }
    });

    return customFields;
  }

  static formatCustomFieldValue(fieldValue, _fieldInfo) {
    if (!fieldValue) return null;

    if (fieldValue.type === 'doc' && fieldValue.content) {
      return this.extractTextFromDocument(fieldValue);
    }

    if (typeof fieldValue === 'string') {
      return fieldValue;
    }

    if (typeof fieldValue === 'object' && fieldValue.value) {
      return fieldValue.value;
    }

    if (typeof fieldValue === 'object' && fieldValue.displayName) {
      return fieldValue.displayName;
    }

    if (Array.isArray(fieldValue)) {
      return fieldValue
        .map(item => {
          if (typeof item === 'object') {
            // Handle sprint objects with id, name, state, etc.
            if (item.name && item.state) {
              return `${item.name} (${item.state})`;
            }
            // Handle objects with value property
            if (item.value) {
              return item.value;
            }
            // Handle objects with displayName property
            if (item.displayName) {
              return item.displayName;
            }
            // Handle objects with name property
            if (item.name) {
              return item.name;
            }
          }
          return item;
        })
        .join(', ');
    }

    return JSON.stringify(fieldValue);
  }
}

module.exports = JiraFormatter;
