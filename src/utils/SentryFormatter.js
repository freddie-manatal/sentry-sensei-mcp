class SentryFormatter {
  /**
   * Summarize a tag object returned by Sentry API.
   * Keeps only the top N values, adds percentage of total.
   */
  static summarizeTag(tagObj, topN = 3) {
    if (!tagObj || !Array.isArray(tagObj.topValues)) return [];
    const total = tagObj.totalValues || 0;
    return tagObj.topValues.slice(0, topN).map(v => ({
      name: v.value,
      count: v.count,
      percent: total ? Math.round((v.count / total) * 1000) / 10 : null, // one decimal place
      firstSeen: v.firstSeen,
      lastSeen: v.lastSeen,
    }));
  }

  /**
   * Extract relevant tag summaries (browser, os, device, release)
   */
  static extractRelevantTags(tagsArray, topN = 3) {
    if (!Array.isArray(tagsArray)) return null;

    const relevant = {};

    const keyMap = {
      'browser.name': 'browser',
      browser: 'browser',
      'os.name': 'os',
      os: 'os',
      device: 'device',
      'device.family': 'device',
      release: 'release',
      environment: 'environment',
    };

    tagsArray.forEach(tagObj => {
      const mappedKey = keyMap[tagObj.key];
      if (mappedKey) {
        relevant[mappedKey] = this.summarizeTag(tagObj, topN);
      }
    });

    return Object.keys(relevant).length > 0 ? relevant : null;
  }

  /**
   * Format Sentry issue details into a compact, LLM-friendly structure.
   */
  static formatIssueDetails(issueDetails, tagsArray = null) {
    if (!issueDetails) return null;

    const formatted = {
      id: issueDetails.id,
      shortId: issueDetails.shortId,
      title: issueDetails.title || '<no title>',
      culprit: issueDetails.culprit,
      permalink: issueDetails.permalink,
      level: issueDetails.level,
      status: issueDetails.status,
      substatus: issueDetails.substatus,
      firstSeen: issueDetails.firstSeen,
      lastSeen: issueDetails.lastSeen,
      count: issueDetails.count,
      userCount: issueDetails.userCount || 0,
      assignedTo: issueDetails.assignedTo
        ? {
            name: issueDetails.assignedTo.name,
            email: issueDetails.assignedTo.email,
          }
        : null,
      project: issueDetails.project
        ? {
            name: issueDetails.project.name,
            slug: issueDetails.project.slug,
          }
        : null,
      annotations: Array.isArray(issueDetails.annotations)
        ? issueDetails.annotations.map(a => ({ key: a.displayName, url: a.url }))
        : [],
    };

    if (tagsArray) {
      formatted.tagsSummary = this.extractRelevantTags(tagsArray);
    }

    return formatted;
  }

  /**
   * Format an array of Sentry issue objects using formatIssueDetails.
   * @param {Array} issuesArray Raw issues array from Sentry API
   * @param {Object|null} tagsMap Optional map of issueId -> tags array
   */
  static formatIssuesList(issuesArray, tagsMap = null) {
    if (!Array.isArray(issuesArray)) return [];
    return issuesArray.map(issue =>
      this.formatIssueDetails(issue, tagsMap && tagsMap[issue.id] ? tagsMap[issue.id] : null),
    );
  }

  /**
   * Convert a formatted issue object into a markdown string for chat/UI.
   */
  static issueToMarkdown(issueObj, currentDateInfo) {
    if (!issueObj) return '';

    const lines = [];
    if (currentDateInfo) {
      lines.push(
        `**Current Date/Time:** ${currentDateInfo.currentDateTime} (${currentDateInfo.timezone})\n`,
      );
    }

    lines.push(`**Issue:** ${issueObj.shortId || issueObj.id} - ${issueObj.title}`);
    lines.push(`**Status:** ${issueObj.status}`);
    lines.push(`**Level:** ${issueObj.level}`);
    lines.push(`**First Seen:** ${issueObj.firstSeen}`);
    lines.push(`**Last Seen:** ${issueObj.lastSeen}`);
    lines.push(`**Event Count:** ${issueObj.count}`);
    lines.push(`**User Count:** ${issueObj.userCount}`);
    lines.push(`**Project:** ${issueObj.project ? issueObj.project.name : 'Unknown'}`);

    // JIRA links
    if (issueObj.annotations && issueObj.annotations.length > 0) {
      lines.push('\n**JIRA Links:**');
      issueObj.annotations.forEach(a => lines.push(`→ ${a.key}: ${a.url}`));
    }

    // Tags summary
    if (issueObj.tagsSummary) {
      lines.push('\n**Environment Summary:**');
      Object.entries(issueObj.tagsSummary).forEach(([tagKey, values]) => {
        const summaryStr = values
          .map(v => `${v.name} (${v.percent !== null ? v.percent + '%' : v.count})`)
          .join(', ');
        lines.push(`- ${tagKey}: ${summaryStr}`);
      });
    }

    return lines.join('\n');
  }

  // ---------- Organization helpers ----------
  static formatOrganization(org) {
    if (!org) return null;
    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
    };
  }

  static formatOrganizationsList(orgArray) {
    if (!Array.isArray(orgArray)) return [];
    return orgArray.map(o => this.formatOrganization(o));
  }

  // ---------- Project helpers ----------
  static formatProject(proj) {
    if (!proj) return null;
    return {
      id: proj.id,
      slug: proj.slug,
      name: proj.name,
      platform: proj.platform,
    };
  }

  static formatProjectsList(projectsArray) {
    if (!Array.isArray(projectsArray)) return [];
    return projectsArray.map(p => this.formatProject(p));
  }
}

module.exports = SentryFormatter;
