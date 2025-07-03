import fs from 'fs';
import path from 'path';
import os from 'os';

// Logger class for structured logging
class Logger {
  constructor(level = 'INFO') {
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
    };
    this.level = this.levels[level.toUpperCase()] || this.levels.INFO;

    // Detect if we're running as MCP server (stdio transport)
    this.isMCP =
      process.argv.includes('--mcp') ||
      process.env.MCP_MODE === 'true' ||
      process.stdin.isTTY === false; // MCP uses stdio pipes

    // Use colors only if not in MCP mode and stdout is a TTY
    this.useColors = !this.isMCP && process.stdout.isTTY;

    this.colors = {
      DEBUG: this.useColors ? '\x1b[36m' : '', // Cyan
      INFO: this.useColors ? '\x1b[32m' : '', // Green
      WARN: this.useColors ? '\x1b[33m' : '', // Yellow
      ERROR: this.useColors ? '\x1b[31m' : '', // Red
      RESET: this.useColors ? '\x1b[0m' : '', // Reset
    };

    // In MCP mode, we'll write to a log file instead of stdout/stderr
    if (this.isMCP) {
      this.setupLogFile();
    }
  }

  setupLogFile() {
    try {
      const logDir = path.join(os.homedir(), '.sentry-mcp-logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const logFileName = `sentry-mcp-${new Date().toISOString().slice(0, 10)}.log`;
      this.logFilePath = path.join(logDir, logFileName);

      // Test write access
      fs.writeFileSync(this.logFilePath, `# Sentry MCP Log - ${new Date().toISOString()}\n`, {
        flag: 'a',
      });
    } catch {
      // Fallback: disable logging in MCP mode if we can't write to file
      this.logFilePath = null;
    }
  }

  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const color = this.colors[level] || '';
    const reset = this.colors.RESET;
    const prefix = `${color}[${timestamp}] ${level}${reset}`;

    if (args.length > 0) {
      return `${prefix} ${message} ${args
        .map(arg => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
        .join(' ')}`;
    }
    return `${prefix} ${message}`;
  }

  log(level, message, ...args) {
    if (this.levels[level] >= this.level) {
      const formattedMessage = this.formatMessage(level, message, ...args);

      if (this.isMCP) {
        // In MCP mode, write to log file instead of stdout/stderr
        if (this.logFilePath) {
          try {
            fs.writeFileSync(this.logFilePath, `${formattedMessage}\n`, {
              flag: 'a',
            });
          } catch {
            // Silently fail - we can't log the logging error in MCP mode
          }
        }
      } else {
        // Normal mode: use stderr for ERROR and WARN levels, stdout for others
        if (level === 'ERROR' || level === 'WARN') {
          console.error(formattedMessage);
        } else {
          console.log(formattedMessage);
        }
      }
    }
  }

  debug(message, ...args) {
    this.log('DEBUG', message, ...args);
  }

  info(message, ...args) {
    this.log('INFO', message, ...args);
  }

  warn(message, ...args) {
    this.log('WARN', message, ...args);
  }

  error(message, ...args) {
    this.log('ERROR', message, ...args);
  }

  // Utility method to get log file path
  getLogFilePath() {
    return this.logFilePath;
  }

  // Utility method to check if we're in MCP mode
  isMCPMode() {
    return this.isMCP;
  }
}

export default Logger;
