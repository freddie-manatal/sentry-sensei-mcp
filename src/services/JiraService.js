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
        throw new Error(
          `JIRA API Error (Global Fields): ${response.status} ${response.statusText} - ${errorText}`,
        );
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
    console.info('JIRA Service: Starting getJiraTicketDetails for:', ticketKey);
    // URL: GET /rest/api/3/issue/{ticketKey}
    const url = `${this.apiBase}/issue/${ticketKey}`;
    console.info('JIRA Service: API URL constructed:', url);

    try {
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      console.info('JIRA Service: About to make fetch request...');
      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      console.info('JIRA Service: Fetch request completed, status:', response.status);

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`JIRA API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const json = await response.json();
      console.info('JIRA ticket details raw response:', {
        key: json.key,
        hasFields: !!json.fields,
        fieldsCount: json.fields ? Object.keys(json.fields).length : 0,
        hasComments: !!json.fields?.comment?.comments?.length,
        commentsCount: json.fields?.comment?.comments?.length || 0,
      });

      // Try to get field mappings, but don't fail if unavailable
      let fieldMappings = {};
      try {
        fieldMappings = await this.getFieldMappings();
      } catch (mappingError) {
        // Log warning but continue without field mappings
        console.warn(
          'Could not load field mappings, proceeding without them:',
          mappingError.message,
        );
      }

      const formattedResult = JiraFormatter.formatJiraResponse(
        json,
        this.atlassianDomain,
        deepDetails,
        fieldMappings,
      );

      console.info('JIRA formatted response structure:', {
        key: formattedResult.key,
        summaryLength: formattedResult.summary?.length || 0,
        descriptionLength: formattedResult.description?.length || 0,
        commentsCount: formattedResult.recentComments?.length || 0,
        customFieldsCount: formattedResult.customFields?.length || 0,
      });

      return formattedResult;
    } catch (error) {
      console.error('JIRA Service: Error occurred:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n')[0], // Just first line of stack
      });

      if (error.name === 'AbortError') {
        throw new Error(`JIRA API request timed out after 15 seconds for ticket: ${ticketKey}`);
      }
      throw new Error(`Failed to fetch JIRA ticket details: ${error.message}`);
    }
  }

  /**
   * Get JIRA issue fields including essential and custom fields
   * Shows user current values and available options for each field
   *
   * @param {string} ticketKey - JIRA issue key
   * @param {boolean} showOnlyEditable - Show only editable fields
   * @param {boolean} includeCustomFields - Include custom fields
   * @returns {Promise<Object>} Field information with current values
   */
  async getJiraIssueFieldsForTicket(
    ticketKey,
    showOnlyEditable = true,
    includeCustomFields = true,
    specificFields = null,
  ) {
    try {
      // Get issue details to show current values
      const issueUrl = `${this.apiBase}/issue/${ticketKey}`;
      const editMetaUrl = `${this.apiBase}/issue/${ticketKey}/editmeta`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      // Fetch both issue data and edit metadata
      const [issueResponse, editMetaResponse] = await Promise.all([
        fetch(issueUrl, { headers: this.getHeaders(), signal: controller.signal }),
        fetch(editMetaUrl, { headers: this.getHeaders(), signal: controller.signal }),
      ]);

      clearTimeout(timeoutId);

      if (!issueResponse.ok || !editMetaResponse.ok) {
        const issueError = issueResponse.ok ? null : await issueResponse.text();
        const editMetaError = editMetaResponse.ok ? null : await editMetaResponse.text();
        throw new Error(`JIRA API Error (Issue Fields): ${issueError || editMetaError}`);
      }

      const issueData = await issueResponse.json();
      const editMetaData = await editMetaResponse.json();
      const fieldMappings = await this.getFieldMappings();

      console.info('JIRA fields raw response:', {
        ticketKey: issueData.key,
        editableFieldsCount: editMetaData.fields ? Object.keys(editMetaData.fields).length : 0,
        issueFieldsCount: issueData.fields ? Object.keys(issueData.fields).length : 0,
        fieldMappingsCount: Object.keys(fieldMappings).length,
      });

      const fieldsResult = this.formatFieldsResponse(
        issueData,
        editMetaData,
        fieldMappings,
        showOnlyEditable,
        includeCustomFields,
        specificFields,
      );

      console.info('JIRA fields formatted response:', {
        ticketKey: fieldsResult.ticketKey,
        essentialFieldsCount: fieldsResult.essentialFields?.length || 0,
        customFieldsCount: fieldsResult.customFields?.length || 0,
        totalFieldsCount: fieldsResult.fieldCount?.total || 0,
      });

      return fieldsResult;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`JIRA API request timed out for ticket: ${ticketKey}`);
      }
      throw new Error(`Failed to get JIRA issue fields: ${error.message}`);
    }
  }

  /**
   * Format fields response to show essential fields first, then custom fields
   * Provides current values and available options for each field
   */
  formatFieldsResponse(
    issueData,
    editMetaData,
    fieldMappings,
    showOnlyEditable,
    includeCustomFields,
    specificFields = null,
  ) {
    const fields = editMetaData.fields || {};
    const currentValues = issueData.fields || {};

    // Essential fields that users commonly update
    const essentialFields = [
      'summary',
      'description',
      'assignee',
      'priority',
      'status',
      'labels',
      'components',
      'fixVersions',
      'duedate',
      'reporter',
    ];

    const result = {
      ticketKey: issueData.key,
      ticketSummary: currentValues.summary || 'N/A',
      essentialFields: [],
      customFields: [],
      fieldCount: {
        total: Object.keys(fields).length,
        essential: 0,
        custom: 0,
      },
    };

    // Filter fields based on specificFields parameter
    const fieldsToProcess =
      specificFields && specificFields.length > 0 ? specificFields : Object.keys(fields);

    // Process essential fields first
    essentialFields.forEach(fieldKey => {
      if (fieldsToProcess.includes(fieldKey)) {
        const field = fields[fieldKey];
        if (field && (!showOnlyEditable || field.hasDefaultValue !== false)) {
          const fieldInfo = this.formatSingleField(
            fieldKey,
            field,
            currentValues[fieldKey],
            fieldMappings,
          );
          if (fieldInfo) {
            result.essentialFields.push(fieldInfo);
            result.fieldCount.essential++;
          }
        }
      }
    });

    // Process custom fields
    if (includeCustomFields) {
      fieldsToProcess.forEach(fieldKey => {
        if (!essentialFields.includes(fieldKey) && fields[fieldKey]) {
          const field = fields[fieldKey];
          if (!showOnlyEditable || field.hasDefaultValue !== false) {
            const fieldInfo = this.formatSingleField(
              fieldKey,
              field,
              currentValues[fieldKey],
              fieldMappings,
            );
            if (fieldInfo) {
              result.customFields.push(fieldInfo);
              result.fieldCount.custom++;
            }
          }
        }
      });
    }

    return result;
  }

  /**
   * Format individual field information
   */
  formatSingleField(fieldKey, fieldMeta, currentValue, fieldMappings) {
    const mapping = fieldMappings[fieldKey];
    const fieldName = mapping?.name || fieldMeta.name || fieldKey;
    const isCustom = mapping?.custom || false;

    const fieldInfo = {
      key: fieldKey,
      name: fieldName,
      required: fieldMeta.required || false,
      editable: true,
      type: fieldMeta.schema?.type || 'string',
      isCustom: isCustom,
      currentValue: this.formatCurrentValue(currentValue, fieldMeta.schema?.type),
      allowedValues: this.extractAllowedValues(fieldMeta),
    };

    return fieldInfo;
  }

  /**
   * Format current field value for display
   */
  formatCurrentValue(value, fieldType) {
    if (!value) return null;

    switch (fieldType) {
      case 'user':
        return value.displayName || value.name || value.key;
      case 'priority':
      case 'status':
      case 'issuetype':
        return value.name || value.value;
      case 'array':
        return Array.isArray(value) ? value.map(v => v.name || v.value || v).join(', ') : value;
      case 'option':
        return value.value || value.name || value;
      case 'date':
        return value;
      default:
        return value;
    }
  }

  /**
   * Extract allowed values for fields with options
   */
  extractAllowedValues(fieldMeta) {
    if (!fieldMeta.allowedValues) return null;

    return fieldMeta.allowedValues.map(option => ({
      id: option.id,
      name: option.name || option.value,
      description: option.description || null,
    }));
  }

  /**
   * Update JIRA issue with field validation
   * Only updates fields that exist and are valid
   */
  async editJiraTicket(ticketKey, updateFields) {
    try {
      // First get field metadata to validate
      const fieldsInfo = await this.getJiraIssueFieldsForTicket(ticketKey, true, true);
      const validFields = {};
      const skippedFields = [];

      // Validate and format each field before updating
      Object.keys(updateFields).forEach(fieldKey => {
        const essentialField = fieldsInfo.essentialFields.find(
          f => f.key === fieldKey || f.name === fieldKey,
        );
        const customField = fieldsInfo.customFields.find(
          f => f.key === fieldKey || f.name === fieldKey,
        );
        const fieldInfo = essentialField || customField;

        if (fieldInfo) {
          validFields[fieldKey] = this.formatFieldValue(updateFields[fieldKey], fieldInfo);
        } else {
          skippedFields.push(fieldKey);
        }
      });

      if (Object.keys(validFields).length === 0) {
        throw new Error(
          `No valid fields found to update. Available fields: ${fieldsInfo.essentialFields.map(f => f.name).join(', ')}`,
        );
      }

      // Update the issue
      const updateUrl = `${this.apiBase}/issue/${ticketKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(updateUrl, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({ fields: validFields }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`JIRA API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return {
        success: true,
        ticketKey: ticketKey,
        updatedFields: Object.keys(validFields),
        skippedFields: skippedFields,
        message: `Successfully updated ${Object.keys(validFields).length} field(s). ${skippedFields.length > 0 ? `Skipped ${skippedFields.length} invalid field(s): ${skippedFields.join(', ')}` : ''}`,
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`JIRA API request timed out for ticket: ${ticketKey}`);
      }
      throw new Error(`Failed to update JIRA ticket: ${error.message}`);
    }
  }

  /**
   * Format field value based on field type for JIRA API
   */
  formatFieldValue(value, fieldInfo) {
    if (!value) return value;

    // Check if this is an ADF field by examining the field schema or type
    const requiresADF = this.isADFField(fieldInfo);

    if (requiresADF && typeof value === 'string') {
      // Convert plain text to ADF format
      return this.convertTextToADF(value);
    }

    // Handle other field types
    switch (fieldInfo.type) {
      case 'user':
        return typeof value === 'string' ? { name: value } : value;
      case 'array':
        return Array.isArray(value) ? value : [value];
      case 'option':
        return typeof value === 'string' ? { value: value } : value;
      case 'priority':
      case 'status':
      case 'issuetype':
        return typeof value === 'string' ? { name: value } : value;
      default:
        return value;
    }
  }

  /**
   * Check if a field requires ADF format
   */
  isADFField(fieldInfo) {
    // Common ADF fields
    const adfFields = ['description', 'summary', 'comment'];

    // Check if it's a known ADF field
    if (adfFields.includes(fieldInfo.key)) {
      return true;
    }

    // Check if it's a custom field that might require ADF
    // (customfield_10217 appears to be "Additional Test Scope" which requires ADF)
    const adfCustomFields = [
      'customfield_10217', // Additional Test Scope
      'customfield_10236', // Acceptance Criteria
      'customfield_10437', // Action Plan
      'customfield_10438', // Deliverables
    ];

    return adfCustomFields.includes(fieldInfo.key);
  }

  /**
   * Convert plain text to Atlassian Document Format (ADF)
   */
  convertTextToADF(text) {
    // Handle bullet lists
    if (text.includes('\n-') || text.includes('\n•')) {
      return this.convertTextWithBulletsToADF(text);
    }

    // Handle plain text with line breaks
    const paragraphs = text.split('\n').filter(line => line.trim());

    return {
      type: 'doc',
      version: 1,
      content: paragraphs.map(paragraph => ({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: paragraph.trim(),
          },
        ],
      })),
    };
  }

  /**
   * Convert text with bullet points to ADF format
   */
  convertTextWithBulletsToADF(text) {
    const lines = text.split('\n');
    const content = [];
    let currentList = null;

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine) continue;

      // Check if this is a bullet point
      if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•')) {
        const bulletText = trimmedLine.substring(1).trim();

        if (!currentList) {
          currentList = {
            type: 'bulletList',
            content: [],
          };
          content.push(currentList);
        }

        currentList.content.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: bulletText,
                },
              ],
            },
          ],
        });
      } else {
        // Regular paragraph
        if (currentList) {
          currentList = null;
        }

        content.push({
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: trimmedLine,
            },
          ],
        });
      }
    }

    return {
      type: 'doc',
      version: 1,
      content: content,
    };
  }
}

module.exports = JiraService;
