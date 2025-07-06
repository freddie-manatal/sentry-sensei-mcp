const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { Logger } = require('../utils/index.js');

class TokenStorage {
  constructor() {
    this.logger = new Logger(process.env.LOG_LEVEL || 'INFO');
    this.tokenDir = path.join(process.cwd(), '.mcp-tokens');
    this.encryptionKey = this.getEncryptionKey();
  }

  /**
   * Get or create encryption key
   */
  getEncryptionKey() {
    // In production, use a proper key management system
    const keyEnv = process.env.MCP_ENCRYPTION_KEY;
    if (keyEnv) {
      return Buffer.from(keyEnv, 'hex');
    }
    
    // Generate a random key for local development
    // WARNING: This is not secure for production use
    return crypto.randomBytes(32);
  }

  /**
   * Encrypt token data
   */
  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt token data
   */
  decrypt(encryptedText) {
    const textParts = encryptedText.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encrypted = textParts.join(':');
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Ensure token directory exists
   */
  async ensureTokenDir() {
    try {
      await fs.access(this.tokenDir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(this.tokenDir, { recursive: true });
        this.logger.info('Created token storage directory');
      } else {
        throw error;
      }
    }
  }

  /**
   * Store Sentry token (legacy internal integration)
   */
  async storeSentryToken(token, host, org) {
    try {
      await this.ensureTokenDir();
      
      const tokenData = {
        token: token,
        host: host,
        org: org,
        timestamp: new Date().toISOString(),
        type: 'sentry',
        authType: 'internal'
      };

      const encryptedData = this.encrypt(JSON.stringify(tokenData));
      const tokenFile = path.join(this.tokenDir, `sentry-${org}.json`);
      
      await fs.writeFile(tokenFile, encryptedData, 'utf8');
      this.logger.info(`Stored Sentry token for org: ${org}`);
      
      return true;
    } catch (error) {
      this.logger.error('Failed to store Sentry token:', error);
      return false;
    }
  }

  /**
   * Store Sentry OAuth token with refresh capability
   */
  async storeSentryOAuthToken(accessToken, refreshToken, expiresAt, org, host = 'sentry.io') {
    try {
      await this.ensureTokenDir();
      
      const tokenData = {
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiresAt: expiresAt,
        host: host,
        org: org,
        timestamp: new Date().toISOString(),
        type: 'sentry',
        authType: 'oauth'
      };

      const encryptedData = this.encrypt(JSON.stringify(tokenData));
      const tokenFile = path.join(this.tokenDir, `sentry-oauth-${org}.json`);
      
      await fs.writeFile(tokenFile, encryptedData, 'utf8');
      this.logger.info(`Stored Sentry OAuth token for org: ${org}`);
      
      return true;
    } catch (error) {
      this.logger.error('Failed to store Sentry OAuth token:', error);
      return false;
    }
  }

  /**
   * Store Atlassian OAuth token with refresh capability
   */
  async storeAtlassianOAuthToken(accessToken, refreshToken, expiresAt, resourceId, cloudId, org = 'default') {
    try {
      await this.ensureTokenDir();
      
      const tokenData = {
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiresAt: expiresAt,
        resourceId: resourceId,
        cloudId: cloudId,
        org: org,
        timestamp: new Date().toISOString(),
        type: 'atlassian',
        authType: 'oauth'
      };

      const encryptedData = this.encrypt(JSON.stringify(tokenData));
      const tokenFile = path.join(this.tokenDir, `atlassian-oauth-${org}.json`);
      
      await fs.writeFile(tokenFile, encryptedData, 'utf8');
      this.logger.info(`Stored Atlassian OAuth token for org: ${org}`);
      
      return true;
    } catch (error) {
      this.logger.error('Failed to store Atlassian OAuth token:', error);
      return false;
    }
  }

  /**
   * Get Sentry token (tries OAuth first, then internal integration)
   */
  async getSentryToken(org = null) {
    try {
      await this.ensureTokenDir();
      
      if (org) {
        // Try OAuth token first
        const oauthToken = await this.getSentryOAuthToken(org);
        if (oauthToken) {
          return oauthToken;
        }
        
        // Fallback to internal integration token
        const tokenFile = path.join(this.tokenDir, `sentry-${org}.json`);
        try {
          const encryptedData = await fs.readFile(tokenFile, 'utf8');
          const tokenData = JSON.parse(this.decrypt(encryptedData));
          return tokenData;
        } catch (error) {
          if (error.code === 'ENOENT') {
            return null;
          }
          throw error;
        }
      } else {
        // Get any available Sentry token (OAuth preferred)
        const files = await fs.readdir(this.tokenDir);
        const oauthFiles = files.filter(file => file.startsWith('sentry-oauth-') && file.endsWith('.json'));
        const internalFiles = files.filter(file => file.startsWith('sentry-') && !file.startsWith('sentry-oauth-') && file.endsWith('.json'));
        
        // Prefer OAuth tokens
        const prioritizedFiles = [...oauthFiles, ...internalFiles];
        
        if (prioritizedFiles.length === 0) {
          return null;
        }
        
        // Return the first available token
        const tokenFile = path.join(this.tokenDir, prioritizedFiles[0]);
        const encryptedData = await fs.readFile(tokenFile, 'utf8');
        const tokenData = JSON.parse(this.decrypt(encryptedData));
        
        // If it's an OAuth token, check if it needs refresh
        if (tokenData.authType === 'oauth') {
          return await this.getValidOAuthToken(tokenData);
        }
        
        return tokenData;
      }
    } catch (error) {
      this.logger.error('Failed to get Sentry token:', error);
      return null;
    }
  }

  /**
   * Get Sentry OAuth token for specific org
   */
  async getSentryOAuthToken(org) {
    try {
      const tokenFile = path.join(this.tokenDir, `sentry-oauth-${org}.json`);
      const encryptedData = await fs.readFile(tokenFile, 'utf8');
      const tokenData = JSON.parse(this.decrypt(encryptedData));
      
      // Check if token needs refresh and return valid token
      return await this.getValidOAuthToken(tokenData);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      this.logger.error('Failed to get OAuth token:', error);
      return null;
    }
  }

  /**
   * Get valid OAuth token (refresh if needed)
   */
  async getValidOAuthToken(tokenData) {
    // Check if token is expired or expires soon (within 5 minutes)
    const now = Date.now();
    const expiresAt = new Date(tokenData.expiresAt).getTime();
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    
    if (now + bufferTime >= expiresAt) {
      this.logger.info('OAuth token expired or expiring soon, refreshing...');
      
      // Refresh the token
      const refreshResult = await this.refreshOAuthToken(tokenData);
      if (refreshResult.success) {
        // Update stored token with new values
        await this.storeSentryOAuthToken(
          refreshResult.accessToken,
          refreshResult.refreshToken,
          refreshResult.expiresAt,
          tokenData.org,
          tokenData.host
        );
        
        // Return updated token data
        return {
          ...tokenData,
          accessToken: refreshResult.accessToken,
          refreshToken: refreshResult.refreshToken,
          expiresAt: refreshResult.expiresAt,
          // For compatibility with existing code
          token: refreshResult.accessToken,
        };
      } else {
        this.logger.error('Failed to refresh OAuth token:', refreshResult.error);
        return null;
      }
    }
    
    // Token is still valid, return with compatibility field
    return {
      ...tokenData,
      token: tokenData.accessToken, // For compatibility with existing code
    };
  }

  /**
   * Get Atlassian OAuth token for specific org
   */
  async getAtlassianOAuthToken(org = 'default') {
    try {
      const tokenFile = path.join(this.tokenDir, `atlassian-oauth-${org}.json`);
      const encryptedData = await fs.readFile(tokenFile, 'utf8');
      const tokenData = JSON.parse(this.decrypt(encryptedData));
      
      // Check if token needs refresh and return valid token
      return await this.getValidOAuthToken(tokenData);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      this.logger.error('Failed to get Atlassian OAuth token:', error);
      return null;
    }
  }

  /**
   * Refresh OAuth token using refresh token
   */
  async refreshOAuthToken(tokenData) {
    if (tokenData.type === 'sentry') {
      return await this.refreshSentryOAuthToken(tokenData);
    } else if (tokenData.type === 'atlassian') {
      return await this.refreshAtlassianOAuthToken(tokenData);
    } else {
      return {
        success: false,
        error: 'Unknown token type for refresh',
      };
    }
  }

  /**
   * Refresh Sentry OAuth token
   */
  async refreshSentryOAuthToken(tokenData) {
    try {
      const clientId = process.env.SENTRY_CLIENT_ID;
      const clientSecret = process.env.SENTRY_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        throw new Error('Missing Sentry OAuth configuration');
      }

      const response = await fetch('https://sentry.io/api/0/oauth/token/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: tokenData.refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
      }

      const newTokenData = await response.json();
      
      return {
        success: true,
        accessToken: newTokenData.access_token,
        refreshToken: newTokenData.refresh_token,
        expiresAt: newTokenData.expires_at || (Date.now() + (newTokenData.expires_in * 1000)),
      };
    } catch (error) {
      this.logger.error('Sentry token refresh error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Refresh Atlassian OAuth token
   */
  async refreshAtlassianOAuthToken(tokenData) {
    try {
      const clientId = process.env.ATLASSIAN_CLIENT_ID;
      const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        throw new Error('Missing Atlassian OAuth configuration');
      }

      const response = await fetch('https://auth.atlassian.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokenData.refreshToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Atlassian token refresh failed: ${response.status} ${errorText}`);
      }

      const newTokenData = await response.json();
      
      return {
        success: true,
        accessToken: newTokenData.access_token,
        refreshToken: newTokenData.refresh_token,
        expiresAt: Date.now() + (newTokenData.expires_in * 1000),
      };
    } catch (error) {
      this.logger.error('Atlassian token refresh error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List all stored tokens
   */
  async listTokens() {
    try {
      await this.ensureTokenDir();
      const files = await fs.readdir(this.tokenDir);
      const tokens = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const tokenFile = path.join(this.tokenDir, file);
            const encryptedData = await fs.readFile(tokenFile, 'utf8');
            const tokenData = JSON.parse(this.decrypt(encryptedData));
            
            // Return metadata without the actual token
            tokens.push({
              type: tokenData.type,
              org: tokenData.org,
              host: tokenData.host,
              timestamp: tokenData.timestamp,
              file: file
            });
          } catch (error) {
            this.logger.warn(`Failed to read token file ${file}:`, error);
          }
        }
      }
      
      return tokens;
    } catch (error) {
      this.logger.error('Failed to list tokens:', error);
      return [];
    }
  }

  /**
   * Remove Sentry token
   */
  async removeSentryToken(org) {
    try {
      const tokenFile = path.join(this.tokenDir, `sentry-${org}.json`);
      await fs.unlink(tokenFile);
      this.logger.info(`Removed Sentry token for org: ${org}`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.warn(`Sentry token for org ${org} not found`);
        return false;
      }
      this.logger.error('Failed to remove Sentry token:', error);
      return false;
    }
  }
}

module.exports = { TokenStorage };