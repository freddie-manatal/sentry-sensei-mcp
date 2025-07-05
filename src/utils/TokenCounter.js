const { get_encoding } = require('tiktoken');
const openaiModelToEncoding = require('tiktoken/model_to_encoding.json');
const { countTokens } = require('@anthropic-ai/tokenizer');
const Logger = require('./Logger');

const logger = new Logger(process.env.LOG_LEVEL || 'INFO');

class TokenCounter {
  /**
   * Create a new TokenCounter instance
   * @param {string} model - The model name to use for token counting (e.g., 'gpt-4', 'gpt-3.5-turbo')
   * @param {string} [encoding] - Optional specific encoding to use, overrides model-based encoding
   */
  constructor(model = 'default', encoding = null) {
    this.model = model;
    
    // Default to cl100k_base if no encoding specified
    let encodingNameToUse = encoding || 'cl100k_base';

    try {
      // For OpenAI models, try to get their specific encoding
      if (openaiModelToEncoding[model]) {
        encodingNameToUse = openaiModelToEncoding[model];
        logger.debug(`Using OpenAI model encoding: ${encodingNameToUse} for model ${model}`);
      }

      this.encoding = get_encoding(encodingNameToUse);
      this.encodingName = encodingNameToUse;
      logger.debug(`Successfully initialized encoding: ${encodingNameToUse}`);
    } catch (err) {
      logger.warn(
        `Failed to load encoding "${encodingNameToUse}" for model ${model}: ${err.message}. Falling back to cl100k_base.`,
      );
      this.encoding = get_encoding('cl100k_base');
      this.encodingName = 'cl100k_base';
    }
  }

  /**
   * Count tokens in a string or object
   * @param {string|object} content - Content to count tokens for
   * @returns {number} Token count
   */
  getTokenCount(content) {
    if (content == null) {
      logger.warn('Received null/undefined content for token counting, returning 0');
      return 0;
    }

    const isOpenaiModel = !!openaiModelToEncoding[this.model];

    try {
      if (isOpenaiModel) {
        const encoded = this.encoding.encode(
          typeof content === 'string' ? content : JSON.stringify(content),
        );
        return encoded.length;
      } else {
        return countTokens(typeof content === 'object' ? JSON.stringify(content) : content);
      }
    } catch (err) {
      logger.error(`Error counting tokens: ${err.message}`);
      return 0;
    }
  }

  /**
   * Add token count information to a response
   * @param {object} response - MCP response object
   * @param {object|string} input - Original input that generated this response
   * @returns {object} Response with token counts added
   */
  addTokenCounts(response, input) {
    if (!response || !input) {
      logger.warn('Received null/undefined response or input for token counting', {
        hasResponse: !!response,
        hasInput: !!input,
      });
      return response || {};
    }

    try {
      const inputTokens = this.getTokenCount(input);
      let outputTokens = 0;

      if (Array.isArray(response.content)) {
        for (const item of response.content) {
          if (item?.text) {
            outputTokens += this.getTokenCount(item.text);
          }
        }
      }

      response.tokenInfo = {
        model: this.model,
        encoding: this.encodingName,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      };

      logger.info(
        `Token counts | model: ${this.model} | input: ${inputTokens} | output: ${outputTokens} | total: ${inputTokens + outputTokens}`,
      );

      return response;
    } catch (error) {
      logger.error(`Error in addTokenCounts: ${error.message}`);
      return response;
    }
  }

  /**
   * Get the current encoding name
   * @returns {string} The name of the current encoding
   */
  getEncodingName() {
    return this.encodingName;
  }

  /**
   * Get the current model name
   * @returns {string} The name of the current model
   */
  getModelName() {
    return this.model;
  }
}

module.exports = TokenCounter;
