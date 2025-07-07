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
  static formatIssueDetails(
    issueDetails,
    tagsArray = null,
    latestEvent = null,
    checkDeepDetails = false,
  ) {
    if (!issueDetails) return null;

    const formatted = {
      id: issueDetails.id,
      shortId: issueDetails.shortId,
      title: issueDetails.title || '<no title>',
      culprit: issueDetails.culprit,
      level: issueDetails.level,
      status: issueDetails.status,
      firstSeen: issueDetails.firstSeen,
      lastSeen: issueDetails.lastSeen,
      count: issueDetails.count,
      userCount: issueDetails.userCount || 0,
      project: issueDetails.project?.name || 'Unknown',
      annotations: Array.isArray(issueDetails.annotations)
        ? issueDetails.annotations.map(a => ({ key: a.displayName, url: a.url }))
        : [],
    };

    // Add permalink and assignedTo only in deep mode or if they exist
    if (checkDeepDetails || issueDetails.assignedTo) {
      formatted.assignedTo = issueDetails.assignedTo
        ? {
            name: issueDetails.assignedTo.name,
            email: issueDetails.assignedTo.email,
          }
        : null;
    }

    if (checkDeepDetails) {
      formatted.permalink = issueDetails.permalink;
      formatted.substatus = issueDetails.substatus;
    }

    // Add essential details always
    formatted.platform = issueDetails.platform;
    formatted.type = issueDetails.type;
    formatted.isUnhandled = issueDetails.isUnhandled;

    // Add core metadata fields
    if (issueDetails.metadata) {
      const coreMetadata = {};
      ['value', 'type', 'filename', 'function'].forEach(key => {
        if (issueDetails.metadata[key]) {
          coreMetadata[key] = issueDetails.metadata[key];
        }
      });
      if (Object.keys(coreMetadata).length > 0) {
        formatted.metadata = coreMetadata;
      }
    }

    // Add additional details when checkDeepDetails is true
    if (checkDeepDetails) {
      formatted.hasSeen = issueDetails.hasSeen;
      formatted.stats = issueDetails.stats;

      // Add full metadata in deep mode
      if (issueDetails.metadata) {
        formatted.metadata = issueDetails.metadata;
      }

      // Add user data if available
      if (issueDetails.user) {
        formatted.user = {
          id: issueDetails.user.id,
          email: issueDetails.user.email,
          username: issueDetails.user.username,
          ipAddress: issueDetails.user.ipAddress,
        };
      }

      // Add release data if available
      if (issueDetails.release) {
        formatted.release = {
          version: issueDetails.release.version,
          dateCreated: issueDetails.release.dateCreated,
          dateReleased: issueDetails.release.dateReleased,
        };
      }
    }

    if (tagsArray && checkDeepDetails) {
      formatted.tagsSummary = this.extractRelevantTags(tagsArray, 5);
    }

    // Add stacktrace from latest event
    if (latestEvent) {
      const stacktraceEntry = latestEvent.entries?.find(
        e => e.type === 'exception' || e.type === 'stacktrace',
      );
      if (stacktraceEntry && stacktraceEntry.data?.values?.[0]?.stacktrace?.frames) {
        const frames = stacktraceEntry.data.values[0].stacktrace.frames;
        formatted.stacktrace = frames
          .reverse() // More readable order
          .slice(0, checkDeepDetails ? 20 : 10) // Limit frames for token efficiency
          .map(f => {
            const file = f.filename ? f.filename.split('/').pop() : '<unknown>';
            const func = f.function || '?';
            return `${file}:${f.lineno} in ${func}`;
          })
          .join('\n');

        // Add exception details in deep details mode
        if (checkDeepDetails && stacktraceEntry.data?.values?.[0]) {
          const exception = stacktraceEntry.data.values[0];
          formatted.exception = {
            type: exception.type,
            value: exception.value,
            mechanism: exception.mechanism,
          };
        }
      }
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
        `Current Date/Time: ${currentDateInfo.currentDateTime} (${currentDateInfo.timezone})\n`,
      );
    }

    lines.push(`Issue: ${issueObj.shortId || issueObj.id} - ${issueObj.title}`);
    lines.push(`Status: ${issueObj.status}`);
    lines.push(`Level: ${issueObj.level}`);
    lines.push(`First Seen: ${issueObj.firstSeen}`);
    lines.push(`Last Seen: ${issueObj.lastSeen}`);
    lines.push(`Event Count: ${issueObj.count}`);
    lines.push(`User Count: ${issueObj.userCount}`);
    lines.push(`Project: ${issueObj.project ? issueObj.project.name : 'Unknown'}`);

    if (issueObj.platform) {
      lines.push(`Platform: ${issueObj.platform}`);
    }
    if (issueObj.type) {
      lines.push(`Type: ${issueObj.type}`);
    }

    if (issueObj.metadata && Object.keys(issueObj.metadata).length > 0) {
      lines.push('\nMetadata:');
      Object.entries(issueObj.metadata).forEach(([key, value]) => {
        lines.push(`${key}: ${value}`);
      });
    }

    // Remove user and release info from standard output for token efficiency

    if (issueObj.isUnhandled !== undefined || issueObj.hasSeen !== undefined) {
      lines.push('\nAdditional Status:');
      if (issueObj.isUnhandled !== undefined) lines.push(`Unhandled: ${issueObj.isUnhandled}`);
      if (issueObj.hasSeen !== undefined) lines.push(`Seen: ${issueObj.hasSeen}`);
    }

    if (issueObj.annotations && issueObj.annotations.length > 0) {
      lines.push('\nJIRA Links:');
      issueObj.annotations.forEach(a => lines.push(`${a.key}: ${a.url}`));
    }

    if (issueObj.exception) {
      lines.push('\nException Details:');
      lines.push(`Type: ${issueObj.exception.type}`);
      lines.push(`Value: ${issueObj.exception.value}`);
      if (issueObj.exception.mechanism) {
        lines.push(`Mechanism: ${JSON.stringify(issueObj.exception.mechanism)}`);
      }
    }

    if (issueObj.stacktrace) {
      lines.push('\nStack Trace (Latest Event):');
      lines.push(issueObj.stacktrace);
    }

    if (issueObj.tagsSummary) {
      lines.push('\nEnvironment Summary:');
      Object.entries(issueObj.tagsSummary).forEach(([tagKey, values]) => {
        const summaryStr = values
          .slice(0, 3) // Limit to top 3 for token efficiency
          .map(v => `${v.name} (${v.percent !== null ? v.percent + '%' : v.count})`)
          .join(', ');
        lines.push(`${tagKey}: ${summaryStr}`);
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
  static formatProject(proj, onlyProduction = true) {
    if (!proj) return null;

    // Filter environments based on onlyProduction flag
    let environments = [];
    if (Array.isArray(proj.environments)) {
      environments = onlyProduction
        ? proj.environments.filter(env => env.toLowerCase().includes('production'))
        : proj.environments;
    }

    return {
      id: proj.id,
      slug: proj.slug,
      name: proj.name,
      platform: proj.platform,
      environments: environments,
    };
  }

  static formatProjectsList(projectsArray, onlyProduction = true) {
    if (!Array.isArray(projectsArray)) return [];
    return projectsArray.map(p => this.formatProject(p, onlyProduction));
  }
}

module.exports = SentryFormatter;
