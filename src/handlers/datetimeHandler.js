const { Logger } = require('../utils/index.js');

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

class DateTimeHandler {
  constructor() {
    // No constructor parameters needed for datetime handler
  }

  // Format date based on requested format
  formatDate(date, format = 'iso', timezone = null) {
    const options = timezone ? { timeZone: timezone } : {};

    switch (format) {
      case 'readable':
        return {
          formatted: date.toLocaleString('en-US', {
            ...options,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
          }),
          timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      case 'unix':
        return {
          formatted: Math.floor(date.getTime() / 1000),
          timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      case 'iso':
      default:
        return {
          formatted: timezone
            ? date.toLocaleString('sv-SE', { timeZone: timezone })
            : date.toISOString(),
          timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
    }
  }

  // Get current date/time information
  async getCurrentDateTime(args) {
    logger.info('📅 Getting current date/time information...');

    const now = new Date();
    const format = args.format || 'iso';
    const timezone = args.timezone;

    // Get formatted date
    const { formatted, timezone: resolvedTimezone } = this.formatDate(now, format, timezone);

    // Additional date information
    const dateInfo = {
      currentDateTime: formatted,
      timezone: resolvedTimezone,
      utcDateTime: now.toISOString(),
      unixTimestamp: Math.floor(now.getTime() / 1000),
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      second: now.getSeconds(),
      weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
      dayOfYear: Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)),
    };

    logger.info(`📊 Current date/time: ${formatted} (${resolvedTimezone})`);

    return {
      content: [
        {
          type: 'text',
          text: `**Current Date/Time Information:**

**Primary:** ${dateInfo.currentDateTime} (${dateInfo.timezone})
**UTC:** ${dateInfo.utcDateTime}
**Unix Timestamp:** ${dateInfo.unixTimestamp}

**Date Components:**
- Year: ${dateInfo.year}
- Month: ${dateInfo.month}
- Day: ${dateInfo.day}
- Day of Year: ${dateInfo.dayOfYear}
- Weekday: ${dateInfo.weekday}

**Time Components:**
- Hour: ${dateInfo.hour}
- Minute: ${dateInfo.minute}
- Second: ${dateInfo.second}

**Timezone:** ${dateInfo.timezone}

**Usage Notes:**
- Use this information for calculating relative dates (e.g., "last 2 days", "this week")
- For Sentry date ranges, use YYYY-MM-DDTHH:MM:SS format
- All dates are provided in ${dateInfo.timezone} timezone unless specified otherwise

**Full Details:**
${JSON.stringify(dateInfo, null, 2)}`,
        },
      ],
    };
  }
}

module.exports = DateTimeHandler;
