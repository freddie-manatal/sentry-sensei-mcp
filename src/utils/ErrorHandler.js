const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');
const Logger = require('./Logger');

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

/**
 * Custom error classes for better error handling
 */
class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

class APIError extends Error {
  constructor(message, statusCode, service = 'API') {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.service = service;
  }
}

class AuthenticationError extends APIError {
  constructor(message, service = 'API') {
    super(message, 401, service);
    this.name = 'AuthenticationError';
  }
}

class NotFoundError extends APIError {
  constructor(message, service = 'API') {
    super(message, 404, service);
    this.name = 'NotFoundError';
  }
}

class RateLimitError extends APIError {
  constructor(message, service = 'API', retryAfter = null) {
    super(message, 429, service);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Centralized error handler for MCP responses
 */
class ErrorHandler {
  /**
   * Create standardized error response for validation errors
   */
  static createValidationErrorResponse(error, toolName) {
    logger.error(`Validation error in ${toolName}:`, error.message);

    return `❌ Invalid parameters for ${toolName}:\n\n${error.message}\n\nPlease check your input parameters and try again.`;
  }

  /**
   * Create standardized error response for API errors
   */
  static createAPIErrorResponse(error, toolName) {
    const service = error.service || 'API';
    logger.error(`${service} error in ${toolName}:`, error);

    // Handle different types of API errors
    switch (error.statusCode || error.status) {
      case 400:
        return `❌ Bad Request: Invalid parameters sent to ${service}.\n\nDetails: ${error.message}\n\nPlease check your parameters and try again.`;

      case 401:
      case 403:
        return `🔐 Authentication failed with ${service}.\n\nDetails: ${error.message}\n\nPlease check your API credentials and permissions.`;

      case 404:
        return `🔍 Resource not found in ${service}.\n\nDetails: ${error.message}\n\nPlease verify the ID/key exists and you have access to it.`;

      case 429:
        const retryMessage = error.retryAfter
          ? `\n\nTry again in ${error.retryAfter} seconds.`
          : '\n\nPlease try again later.';
        return `⏳ Rate limit exceeded for ${service}.${retryMessage}\n\nDetails: ${error.message}`;

      case 500:
      case 502:
      case 503:
        return `🚨 ${service} server error (${error.statusCode || 'Unknown'}).\n\nDetails: ${error.message}\n\nThe service may be temporarily unavailable. Please try again later.`;

      default:
        return `❌ ${service} request failed.\n\nDetails: ${error.message}\n\nPlease check your parameters and try again.`;
    }
  }

  /**
   * Create standardized error response for general errors
   */
  static createGeneralErrorResponse(error, toolName) {
    // Log error details properly
    logger.error(`Unexpected error in ${toolName}:`, {
      message: error.message,
      name: error.name,
      stack: error.stack,
      ...(error.statusCode && { statusCode: error.statusCode }),
      ...(error.status && { status: error.status }),
    });

    return `❌ An unexpected error occurred in ${toolName}.\n\nDetails: ${error.message}\n\nPlease try again or contact support if the issue persists.`;
  }

  /**
   * Handle errors with appropriate response based on error type
   */
  static handleError(error, toolName) {
    // Handle validation errors from Zod
    if (error.name === 'ZodError' || error.message.includes('validation failed')) {
      return this.createValidationErrorResponse(error, toolName);
    }

    // Handle custom API errors
    if (error instanceof APIError || error.statusCode || error.status) {
      return this.createAPIErrorResponse(error, toolName);
    }

    // Handle MCP errors
    if (error instanceof McpError) {
      logger.error(`MCP error in ${toolName}:`, error);
      throw error; // Re-throw MCP errors as they have their own handling
    }

    // Handle general errors
    return this.createGeneralErrorResponse(error, toolName);
  }

  /**
   * Convert HTTP status codes to appropriate MCP errors
   */
  static statusToMcpError(statusCode, message) {
    switch (statusCode) {
      case 400:
        return new McpError(ErrorCode.InvalidParams, message);
      case 401:
      case 403:
        return new McpError(ErrorCode.InvalidParams, `Authentication failed: ${message}`);
      case 404:
        return new McpError(ErrorCode.InvalidParams, `Resource not found: ${message}`);
      case 429:
        return new McpError(ErrorCode.InternalError, `Rate limit exceeded: ${message}`);
      case 500:
      case 502:
      case 503:
        return new McpError(ErrorCode.InternalError, `Server error: ${message}`);
      default:
        return new McpError(ErrorCode.InternalError, message);
    }
  }
}

module.exports = {
  ErrorHandler,
  ValidationError,
  APIError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
};
