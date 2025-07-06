const { MCPServer } = require('../MCPServer.js');
const { Logger } = require('../../utils/index.js');
const { TokenStorage } = require('../../shared/tokenStorage.js');

/**
 * Serverless transport implementation for MCP server
 * Compatible with Netlify Functions, Vercel, AWS Lambda, etc.
 */
class ServerlessTransport {
  constructor(options = {}) {
    this.logger = new Logger(process.env.LOG_LEVEL || 'INFO');
    this.mcpServer = new MCPServer(options);
    this.tokenStorage = new TokenStorage();
    this.hasInitializedAuth = false;
  }

  /**
   * Handle serverless function request
   * @param {Object} event - Serverless event object
   * @param {Object} context - Serverless context object
   * @returns {Object} Serverless response object
   */
  async handleRequest(event, _context) {
    try {
      // Log request details
      this.logger.info(`Serverless function invoked: ${event.httpMethod} ${event.path}`);
      this.logger.debug('Event:', JSON.stringify(event, null, 2));

      // Handle different HTTP methods
      switch (event.httpMethod) {
        case 'GET':
          return await this.handleGetRequest(event);
        case 'POST':
          return await this.handlePostRequest(event);
        case 'OPTIONS':
          return this.handleOptionsRequest();
        default:
          return this.createResponse(405, {
            error: 'Method not allowed',
          });
      }
    } catch (error) {
      this.logger.error('Serverless function error:', error);
      return this.createResponse(500, {
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * Handle GET requests
   */
  async handleGetRequest(event) {
    const path = event.path || event.rawPath;

    // Health check endpoint
    if (path === '/health') {
      return this.createResponse(200, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        server: this.mcpServer.serverInfo.name,
        version: this.mcpServer.serverInfo.version,
        environment: 'serverless',
      });
    }

    // Authentication status endpoint
    if (path === '/auth/status' || path.endsWith('/auth/status')) {
      return await this.handleAuthStatus(event);
    }

    // SSE endpoint for OAuth authentication
    if (path === '/v1/sse' || path.endsWith('/v1/sse')) {
      return await this.handleSSE(event);
    }

    // Authorization endpoint (like Atlassian's pattern)
    if (path === '/v1/authorize' || path.endsWith('/v1/authorize')) {
      return await this.handleAuthorize(event);
    }

    // Callback endpoint from Sentry
    if (path === '/v1/callback' || path.endsWith('/v1/callback')) {
      return await this.handleCallback(event);
    }

    // Default response for GET requests
    return this.createResponse(200, {
      message: 'Sentry Sensei MCP Server',
      version: this.mcpServer.serverInfo.version,
      endpoints: {
        mcp: 'POST /.netlify/functions/mcp',
        health: 'GET /.netlify/functions/mcp/health',
        auth: {
          status: 'GET /.netlify/functions/mcp/auth/status',
        },
        sse: 'GET /.netlify/functions/mcp/v1/sse',
      },
    });
  }

  /**
   * Handle POST requests (MCP protocol)
   */
  async handlePostRequest(event) {
    const path = event.path || event.rawPath;

    // Handle Sentry OAuth callback POST requests
    if (path === '/auth/sentry/callback' || path.endsWith('/auth/sentry/callback')) {
      return await this.handleSentryCallback(event);
    }

    // Handle Sentry OAuth callback for SSE session
    if (path === '/auth/sentry/oauth/callback' || path.endsWith('/auth/sentry/oauth/callback')) {
      return await this.handleSentryOAuthCallback(event);
    }

    let body;

    try {
      // Parse request body
      if (event.body) {
        body = event.isBase64Encoded
          ? JSON.parse(Buffer.from(event.body, 'base64').toString())
          : JSON.parse(event.body);
      } else {
        body = {};
      }
    } catch (error) {
      this.logger.error('Failed to parse request body:', error);
      return this.createResponse(400, {
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error - Invalid JSON',
        },
        id: null,
      });
    }

    // Create request object for credential extraction
    const req = {
      headers: event.headers || {},
      query: event.queryStringParameters || {},
      body: body,
    };

    // Check if this is the first tools/list request without auth - trigger OAuth initialization
    if (body.method === 'tools/list' && !this.hasInitializedAuth) {
      this.hasInitializedAuth = true;
      // Initialize OAuth sessions in background (non-blocking)
      this.mcpServer.initializeAuthSessions().catch(error => {
        this.logger.error('Failed to initialize auth sessions:', error);
      });
    }

    // Process MCP request
    const result = await this.mcpServer.processRequest(req, body);

    // Handle notification responses (no body)
    if (result.body === null) {
      return this.createResponse(result.status, null);
    }

    return this.createResponse(result.status, result.body);
  }

  /**
   * Handle OPTIONS requests (CORS preflight)
   */
  handleOptionsRequest() {
    return {
      statusCode: 200,
      headers: this.getCorsHeaders(),
      body: '',
    };
  }

  /**
   * Create standardized response object
   */
  createResponse(statusCode, body) {
    const response = {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...this.getCorsHeaders(),
      },
    };

    if (body !== null) {
      response.body = typeof body === 'string' ? body : JSON.stringify(body);
    } else {
      response.body = '';
    }

    return response;
  }

  /**
   * Get CORS headers
   */
  getCorsHeaders() {
    return {
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
    };
  }

  /**
   * Handle Sentry OAuth connect - redirects to Sentry integration page
   */
  async handleSentryConnect(event) {
    try {
      const queryParams = event.queryStringParameters || {};
      const sentryHost = queryParams.host || 'sentry.io';
      const orgSlug = queryParams.org;

      if (!orgSlug) {
        return this.createResponse(400, {
          error: 'Missing required parameter: org',
          message: 'Please provide your Sentry organization slug as ?org=your-org-slug',
        });
      }

      // Generate state for security
      const state = this.generateRandomString(32);

      // Store state temporarily (in production, use proper session storage)
      // For now, we'll include it in the redirect URL
      const redirectUrl = `https://${sentryHost}/settings/${orgSlug}/integrations/`;

      // Return HTML that redirects to Sentry and shows instructions
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Connect to Sentry</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .instructions { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .code { background: #333; color: #fff; padding: 10px; border-radius: 4px; font-family: monospace; }
            .button { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 10px 0; }
          </style>
        </head>
        <body>
          <h1>Connect Sentry to MCP Server</h1>
          <div class="instructions">
            <h3>Step 1: Create Internal Integration</h3>
            <p>Click the button below to open your Sentry organization's integrations page:</p>
            <a href="${redirectUrl}" target="_blank" class="button">Open Sentry Integrations</a>
            
            <h3>Step 2: Create New Integration</h3>
            <ol>
              <li>Click "Create New Integration"</li>
              <li>Choose "Internal Integration"</li>
              <li>Name it "Sentry Sensei MCP"</li>
              <li>Add these permissions:
                <ul>
                  <li><strong>Project:</strong> Read</li>
                  <li><strong>Issue & Event:</strong> Read</li>
                  <li><strong>Organization:</strong> Read</li>
                </ul>
              </li>
              <li>Click "Save Changes"</li>
            </ol>
            
            <h3>Step 3: Copy Your Token</h3>
            <p>After creating the integration, copy the generated token and paste it below:</p>
            <form id="tokenForm">
              <input type="text" id="token" placeholder="Paste your Sentry token here" style="width: 100%; padding: 8px; margin: 10px 0;">
              <button type="submit" class="button">Save Token</button>
            </form>
          </div>
          
          <script>
            document.getElementById('tokenForm').addEventListener('submit', async (e) => {
              e.preventDefault();
              const token = document.getElementById('token').value;
              if (!token) {
                alert('Please paste your Sentry token');
                return;
              }
              
              try {
                const response = await fetch('/auth/sentry/callback', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    token: token,
                    host: '${sentryHost}',
                    org: '${orgSlug}',
                    state: '${state}'
                  })
                });
                
                if (response.ok) {
                  alert('Sentry connected successfully! You can now close this window.');
                  window.close();
                } else {
                  const error = await response.json();
                  alert('Error: ' + error.message);
                }
              } catch (error) {
                alert('Error connecting to Sentry: ' + error.message);
              }
            });
          </script>
        </body>
        </html>
      `;

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html',
          ...this.getCorsHeaders(),
        },
        body: html,
      };
    } catch (error) {
      this.logger.error('Sentry connect error:', error);
      return this.createResponse(500, {
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  /**
   * Handle Sentry OAuth callback - processes the token
   */
  async handleSentryCallback(event) {
    try {
      let body;

      if (event.httpMethod === 'POST') {
        body = event.body ? JSON.parse(event.body) : {};
      } else {
        body = event.queryStringParameters || {};
      }

      const { token, host, org } = body;

      if (!token || !host || !org) {
        return this.createResponse(400, {
          error: 'Missing required parameters',
          message: 'token, host, and org are required',
        });
      }

      // Validate token by making a test API call
      const testResponse = await fetch(`https://${host}/api/0/organizations/${org}/projects/`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!testResponse.ok) {
        return this.createResponse(400, {
          error: 'Invalid token',
          message: 'The provided token is invalid or expired',
        });
      }

      // Store the token securely
      await this.tokenStorage.storeSentryToken(token, host, org);

      this.logger.info(`Sentry authentication successful for org: ${org}`);

      return this.createResponse(200, {
        success: true,
        message: 'Sentry connected successfully',
        org: org,
        host: host,
      });
    } catch (error) {
      this.logger.error('Sentry callback error:', error);
      return this.createResponse(500, {
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  /**
   * Handle authentication status check
   */
  async handleAuthStatus() {
    try {
      const sentryAuth = await this.tokenStorage.getSentryToken();
      const atlassianAuth = await this.tokenStorage.getAtlassianOAuthToken();

      return this.createResponse(200, {
        sentry: {
          connected: !!sentryAuth,
          org: sentryAuth?.org || null,
          host: sentryAuth?.host || null,
          authType: sentryAuth?.authType || null,
        },
        atlassian: {
          connected: !!atlassianAuth,
          org: atlassianAuth?.org || null,
          cloudId: atlassianAuth?.cloudId || null,
          resourceId: atlassianAuth?.resourceId || null,
          authType: atlassianAuth?.authType || null,
        },
        // Legacy JIRA field for compatibility
        jira: {
          connected: !!atlassianAuth,
          domain: atlassianAuth?.cloudId || null,
        },
      });
    } catch (error) {
      this.logger.error('Auth status error:', error);
      return this.createResponse(500, {
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  /**
   * Generate a random string for state parameter
   */
  generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate PKCE code verifier
   */
  generateCodeVerifier() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    for (let i = 0; i < 128; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate PKCE code challenge
   */
  async generateCodeChallenge(verifier) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
  }

  /**
   * Handle authorization endpoint (like Atlassian's /v1/authorize)
   */
  async handleAuthorize(event) {
    try {
      const queryParams = event.queryStringParameters || {};
      const {
        response_type,
        client_id,
        code_challenge,
        code_challenge_method,
        redirect_uri,
        state,
        service,
      } = queryParams;

      // Validate parameters
      if (response_type !== 'code') {
        return this.createResponse(400, {
          error: 'invalid_request',
          error_description: 'Only response_type=code is supported',
        });
      }

      // Get session info
      global.sseConnections = global.sseConnections || {};
      const session = global.sseConnections[state];
      if (!session) {
        return this.createResponse(400, {
          error: 'invalid_request',
          error_description: 'Invalid state parameter',
        });
      }

      // Store callback info for later
      session.redirectUri = redirect_uri;
      session.codeChallenge = code_challenge;
      session.codeChallengeMethod = code_challenge_method;

      let oauthUrl;

      if (service === 'sentry') {
        // Build Sentry OAuth URL
        oauthUrl =
          `https://sentry.io/oauth/authorize/?` +
          `response_type=code&` +
          `client_id=${encodeURIComponent(client_id)}&` +
          `redirect_uri=${encodeURIComponent(`${this.getBaseUrl(event)}/v1/callback`)}&` +
          `state=${encodeURIComponent(state)}&` +
          `scope=org:read,project:read,event:read,team:read`;
      } else if (service === 'atlassian') {
        // Build Atlassian OAuth URL with proper scopes
        const scopes = [
          'offline_access',
          'read:jira-work',
          'read:jira-user',
          'write:jira-work',
          'read:confluence-content',
          'read:confluence-space',
          'read:confluence-user',
          'write:confluence-content',
          'read:me',
        ].join(' ');

        oauthUrl =
          `https://auth.atlassian.com/authorize?` +
          `audience=api.atlassian.com&` +
          `client_id=${encodeURIComponent(client_id)}&` +
          `scope=${encodeURIComponent(scopes)}&` +
          `redirect_uri=${encodeURIComponent(`${this.getBaseUrl(event)}/v1/callback`)}&` +
          `state=${encodeURIComponent(state)}&` +
          `response_type=code&` +
          `prompt=consent`;
      } else {
        return this.createResponse(400, {
          error: 'invalid_request',
          error_description: 'Invalid service parameter',
        });
      }

      // Redirect to OAuth provider
      return {
        statusCode: 302,
        headers: {
          Location: oauthUrl,
          ...this.getCorsHeaders(),
        },
        body: '',
      };
    } catch (error) {
      this.logger.error('Authorize endpoint error:', error);
      return this.createResponse(500, {
        error: 'server_error',
        error_description: error.message,
      });
    }
  }

  /**
   * Handle callback from Sentry OAuth
   */
  async handleCallback(event) {
    try {
      const queryParams = event.queryStringParameters || {};
      const { code, state, error, error_description } = queryParams;

      // Handle OAuth errors
      if (error) {
        this.logger.error('OAuth error:', error, error_description);
        return this.redirectToLocalhost(
          null,
          `error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(error_description || '')}`,
        );
      }

      if (!code || !state) {
        return this.redirectToLocalhost(
          null,
          'error=invalid_request&error_description=Missing authorization code or state',
        );
      }

      // Determine service from state parameter
      const service = state.startsWith('sentry_') ? 'sentry' : 
                     state.startsWith('atlassian_') ? 'atlassian' : null;
      
      if (!service) {
        return this.createOAuthCallbackResponse(false, 'Invalid state parameter - unknown service');
      }

      // Exchange code for access token based on service
      let tokenResult;
      if (service === 'sentry') {
        tokenResult = await this.exchangeCodeForToken(code);
      } else if (service === 'atlassian') {
        tokenResult = await this.exchangeAtlassianCodeForToken(code);
      }

      if (!tokenResult.success) {
        return this.createOAuthCallbackResponse(false, `Token exchange failed: ${tokenResult.error}`);
      }

      // Store tokens securely based on service
      if (service === 'sentry') {
        // Auto-detect org from token result or use first available
        const orgToStore = tokenResult.org || 'default';
        await this.tokenStorage.storeSentryOAuthToken(
          tokenResult.token,
          tokenResult.refreshToken,
          tokenResult.expiresAt,
          orgToStore,
          'sentry.io',
        );
      } else if (service === 'atlassian') {
        // Use the first accessible resource or default
        const orgToStore = tokenResult.cloudId || 'default';
        await this.tokenStorage.storeAtlassianOAuthToken(
          tokenResult.token,
          tokenResult.refreshToken,
          tokenResult.expiresAt,
          tokenResult.resourceId,
          tokenResult.cloudId,
          orgToStore,
        );
      }

      this.logger.info(`OAuth authentication successful for session: ${state}`);

      // Show success page instead of redirecting to localhost
      return this.createOAuthCallbackResponse(true, 'Authentication successful! You can now close this window and continue using MCP tools in your IDE.');
    } catch (error) {
      this.logger.error('Callback error:', error);
      return this.createOAuthCallbackResponse(false, `Authentication failed: ${error.message}`);
    }
  }

  /**
   * Redirect to localhost callback (like Atlassian)
   */
  redirectToLocalhost(state, params) {
    const redirectUrl = `${this.mcpServer.getServerBaseUrl()}/oauth/callback?${params}${state ? `&state=${state}` : ''}`;

    return {
      statusCode: 302,
      headers: {
        Location: redirectUrl,
        ...this.getCorsHeaders(),
      },
      body: '',
    };
  }

  /**
   * Handle SSE endpoint for OAuth authentication
   */
  async handleSSE(event) {
    try {
      const queryParams = event.queryStringParameters || {};
      const { service = 'sentry', org } = queryParams;

      // Generate unique session ID for this SSE connection
      const sessionId = this.generateRandomString(16);

      // Store SSE connection (in production, use proper session storage)
      global.sseConnections = global.sseConnections || {};

      this.logger.info(`New SSE connection: ${sessionId} for service: ${service}`);

      // Create OAuth URL based on service
      let authUrl;
      if (service === 'sentry') {
        // Use Sentry public integration OAuth 2.0 flow
        const clientId = process.env.SENTRY_CLIENT_ID;
        if (!clientId) {
          return this.createResponse(500, {
            error: 'Configuration error',
            message: 'SENTRY_CLIENT_ID environment variable is required',
          });
        }

        // Generate PKCE parameters
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);
        const state = sessionId;

        // Store PKCE verifier for callback
        global.sseConnections[sessionId].codeVerifier = codeVerifier;
        global.sseConnections[sessionId].org = org || 'auto-detect';
        global.sseConnections[sessionId].service = 'sentry';

        // Use our own authorize endpoint that redirects to Sentry
        authUrl =
          `${this.getBaseUrl(event)}/v1/authorize?` +
          `response_type=code&` +
          `client_id=${encodeURIComponent(clientId)}&` +
          `code_challenge=${encodeURIComponent(codeChallenge)}&` +
          `code_challenge_method=S256&` +
          `redirect_uri=${encodeURIComponent('http://localhost:5598/oauth/callback')}&` +
          `state=${encodeURIComponent(state)}&` +
          `service=sentry`;
      } else if (service === 'atlassian') {
        // Use Atlassian OAuth 2.0 flow
        const clientId = process.env.ATLASSIAN_CLIENT_ID;
        if (!clientId) {
          return this.createResponse(500, {
            error: 'Configuration error',
            message: 'ATLASSIAN_CLIENT_ID environment variable is required',
          });
        }

        // Generate PKCE parameters
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = await this.generateCodeChallenge(codeVerifier);
        const state = sessionId;

        // Store PKCE verifier for callback
        global.sseConnections[sessionId].codeVerifier = codeVerifier;
        global.sseConnections[sessionId].org = org || 'auto-detect';
        global.sseConnections[sessionId].service = 'atlassian';

        // Use our own authorize endpoint that redirects to Atlassian
        authUrl =
          `${this.getBaseUrl(event)}/v1/authorize?` +
          `response_type=code&` +
          `client_id=${encodeURIComponent(clientId)}&` +
          `code_challenge=${encodeURIComponent(codeChallenge)}&` +
          `code_challenge_method=S256&` +
          `redirect_uri=${encodeURIComponent('http://localhost:5598/oauth/callback')}&` +
          `state=${encodeURIComponent(state)}&` +
          `service=atlassian`;
      } else {
        return this.createResponse(400, {
          error: 'Unsupported service',
          message: 'Supported services: sentry, atlassian',
        });
      }

      // Store session for OAuth callback
      global.sseConnections[sessionId] = {
        service: service,
        org: org || 'default',
        timestamp: new Date().toISOString(),
        state: 'pending_auth',
      };

      // Create SSE response with OAuth redirect
      const sseData = this.createSSEMessage('auth-required', {
        authUrl: authUrl,
        service: service,
        org: org,
        message: 'Redirecting to Sentry for OAuth authentication...',
      });

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control',
        },
        body: sseData,
      };
    } catch (error) {
      this.logger.error('SSE endpoint error:', error);
      return this.createResponse(500, {
        error: 'Internal server error',
        message: error.message,
      });
    }
  }

  /**
   * Create SSE message format
   */
  createSSEMessage(event, data) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  /**
   * Get base URL for OAuth redirects
   */
  getBaseUrl(event) {
    // For Netlify functions
    if (event.headers.host && event.headers.host.includes('netlify')) {
      return `https://${event.headers.host}/.netlify/functions/mcp`;
    }

    // For other deployments
    const protocol = event.headers['x-forwarded-proto'] || 'https';
    const host = event.headers.host || event.headers['x-forwarded-host'];
    return `${protocol}://${host}`;
  }

  /**
   * Handle Sentry OAuth callback for SSE authentication
   */
  async handleSentryOAuthCallback(event) {
    try {
      const queryParams = event.queryStringParameters || {};
      const { code, state, error, error_description } = queryParams;

      // Handle OAuth errors
      if (error) {
        this.logger.error('OAuth error:', error, error_description);
        return this.createOAuthCallbackResponse(
          false,
          `OAuth error: ${error_description || error}`,
        );
      }

      if (!code || !state) {
        return this.createOAuthCallbackResponse(false, 'Missing authorization code or state');
      }

      // Parse state to get session and org
      const [sessionId, org] = state.split(':');
      if (!sessionId) {
        return this.createOAuthCallbackResponse(false, 'Invalid state parameter');
      }

      // Check if session exists
      global.sseConnections = global.sseConnections || {};
      const session = global.sseConnections[sessionId];
      if (!session) {
        return this.createOAuthCallbackResponse(false, 'Invalid or expired session');
      }

      // Exchange code for access token
      const tokenResult = await this.exchangeCodeForToken(code);
      if (!tokenResult.success) {
        return this.createOAuthCallbackResponse(false, tokenResult.error);
      }

      // Store tokens securely
      await this.tokenStorage.storeSentryOAuthToken(
        tokenResult.token,
        tokenResult.refreshToken,
        tokenResult.expiresAt,
        org,
        'sentry.io',
      );

      // Update session state
      session.state = 'authenticated';
      session.authenticatedAt = new Date().toISOString();

      // Send SSE event to client (if connection still active)
      this.sendSSEEvent(sessionId, 'auth-success', {
        service: 'sentry',
        org: org,
        message: 'Authentication successful',
      });

      this.logger.info(`OAuth authentication successful for session: ${sessionId}`);
      return this.createOAuthCallbackResponse(
        true,
        'Authentication successful! You can close this window.',
      );
    } catch (error) {
      this.logger.error('OAuth callback error:', error);
      return this.createOAuthCallbackResponse(false, `Internal error: ${error.message}`);
    }
  }

  /**
   * Exchange authorization code for access token (Sentry)
   */
  async exchangeCodeForToken(code) {
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
          grant_type: 'authorization_code',
          code: code,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
      }

      const tokenData = await response.json();

      // Get user's organizations to auto-detect primary org
      let primaryOrg = 'default';
      try {
        const orgsResponse = await fetch('https://sentry.io/api/0/organizations/', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (orgsResponse.ok) {
          const orgs = await orgsResponse.json();
          if (orgs.length > 0) {
            primaryOrg = orgs[0].slug; // Use first organization
          }
        }
      } catch (error) {
        this.logger.warn('Failed to fetch Sentry organizations:', error);
      }

      return {
        success: true,
        token: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_at || Date.now() + tokenData.expires_in * 1000,
        org: primaryOrg,
      };
    } catch (error) {
      this.logger.error('Token exchange error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Exchange authorization code for access token (Atlassian)
   */
  async exchangeAtlassianCodeForToken(code) {
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
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          redirect_uri: `${this.getBaseUrl()}/v1/callback`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Atlassian token exchange failed: ${response.status} ${errorText}`);
      }

      const tokenData = await response.json();

      // Get accessible resources (cloud instances)
      const resourcesResponse = await fetch(
        'https://api.atlassian.com/oauth/token/accessible-resources',
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/json',
          },
        },
      );

      let resources = [];
      if (resourcesResponse.ok) {
        resources = await resourcesResponse.json();
      }

      return {
        success: true,
        token: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
        resourceId: resources.length > 0 ? resources[0].id : null,
        cloudId: resources.length > 0 ? resources[0].id : null,
        resources: resources,
      };
    } catch (error) {
      this.logger.error('Atlassian token exchange error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create OAuth callback response page
   */
  createOAuthCallbackResponse(success, message) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth ${success ? 'Success' : 'Error'}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            max-width: 500px; 
            margin: 50px auto; 
            padding: 20px;
            text-align: center;
          }
          .container {
            background: ${success ? '#e8f5e8' : '#ffebee'};
            color: ${success ? '#2e7d32' : '#c62828'};
            padding: 30px;
            border-radius: 8px;
            border: 2px solid ${success ? '#4caf50' : '#f44336'};
          }
          .icon { font-size: 48px; margin-bottom: 20px; }
          .message { font-size: 18px; margin-bottom: 20px; }
          .close-note { font-size: 14px; opacity: 0.8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">${success ? '✅' : '❌'}</div>
          <div class="message">${message}</div>
          <div class="close-note">
            ${success ? 'This window will close automatically.' : 'Please close this window and try again.'}
          </div>
        </div>
        ${success ? '<script>setTimeout(() => window.close(), 2000);</script>' : ''}
      </body>
      </html>
    `;

    return {
      statusCode: success ? 200 : 400,
      headers: {
        'Content-Type': 'text/html',
        ...this.getCorsHeaders(),
      },
      body: html,
    };
  }

  /**
   * Send SSE event to client (placeholder for actual SSE implementation)
   */
  sendSSEEvent(sessionId, event, data) {
    // In a real implementation, this would send events to active SSE connections
    // For serverless, we'd need a different approach like WebSockets or polling
    this.logger.info(`SSE Event [${sessionId}] ${event}:`, data);
  }

  /**
   * Handle Sentry OAuth for browser authentication with auto-close
   */
  async handleSentryOAuth(event) {
    try {
      const queryParams = event.queryStringParameters || {};
      const { session, org, host = 'sentry.io' } = queryParams;

      if (!session || !org) {
        return this.createResponse(400, {
          error: 'Missing required parameters',
          message: 'session and org parameters are required',
        });
      }

      // Store session info
      global.sseConnections = global.sseConnections || {};
      global.sseConnections[session] = {
        service: 'sentry',
        org: org,
        host: host,
        timestamp: new Date().toISOString(),
      };

      const redirectUrl = `https://${host}/settings/${org}/integrations/`;

      // Create OAuth page with auto-close functionality
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Sentry OAuth - MCP Authentication</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              max-width: 600px; 
              margin: 20px auto; 
              padding: 20px;
              background: #f8f9fa;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              color: #363d44;
              margin-bottom: 10px;
            }
            .instructions {
              background: #e3f2fd;
              padding: 20px;
              border-radius: 6px;
              margin: 20px 0;
              border-left: 4px solid #2196f3;
            }
            .button {
              background: #2196f3;
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 6px;
              display: inline-block;
              margin: 10px 0;
              border: none;
              cursor: pointer;
              font-size: 16px;
            }
            .button:hover { background: #1976d2; }
            .form-group {
              margin: 15px 0;
            }
            .form-group input {
              width: 100%;
              padding: 10px;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-size: 14px;
            }
            .success { 
              background: #e8f5e8; 
              color: #2e7d32; 
              padding: 15px; 
              border-radius: 6px; 
              margin: 15px 0;
            }
            .error { 
              background: #ffebee; 
              color: #c62828; 
              padding: 15px; 
              border-radius: 6px; 
              margin: 15px 0;
            }
            .step {
              margin: 15px 0;
              padding: 15px;
              background: #f5f5f5;
              border-radius: 6px;
            }
            .step-number {
              background: #2196f3;
              color: white;
              width: 24px;
              height: 24px;
              border-radius: 50%;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              font-size: 14px;
              margin-right: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">🔐 Sentry MCP Authentication</div>
              <p>Connecting to <strong>${org}</strong> on <strong>${host}</strong></p>
            </div>

            <div class="instructions">
              <h3>Quick Setup Instructions</h3>
              
              <div class="step">
                <span class="step-number">1</span>
                <strong>Open Sentry Integrations</strong>
                <br>
                <a href="${redirectUrl}" target="_blank" class="button">Open Sentry Integrations Page</a>
              </div>

              <div class="step">
                <span class="step-number">2</span>
                <strong>Create Internal Integration</strong>
                <ul>
                  <li>Click "Create New Integration"</li>
                  <li>Choose "Internal Integration"</li>
                  <li>Name: "MCP Sentry Sensei"</li>
                  <li>Permissions: Project:Read, Issue & Event:Read, Organization:Read</li>
                </ul>
              </div>

              <div class="step">
                <span class="step-number">3</span>
                <strong>Copy Token</strong>
                <br>
                <div class="form-group">
                  <input type="text" id="token" placeholder="Paste your Sentry token here..." autocomplete="off">
                </div>
                <button onclick="authenticate()" class="button">Complete Authentication</button>
              </div>
            </div>

            <div id="status"></div>
          </div>

          <script>
            let isAuthenticated = false;

            async function authenticate() {
              if (isAuthenticated) return;
              
              const token = document.getElementById('token').value.trim();
              const statusDiv = document.getElementById('status');
              
              if (!token) {
                statusDiv.innerHTML = '<div class="error">Please paste your Sentry token</div>';
                return;
              }

              statusDiv.innerHTML = '<div>🔄 Validating token...</div>';

              try {
                const response = await fetch(window.location.pathname.replace('/oauth', '/oauth/callback'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    token: token,
                    host: '${host}',
                    org: '${org}',
                    session: '${session}'
                  })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                  isAuthenticated = true;
                  statusDiv.innerHTML = '<div class="success">✅ Authentication successful! Closing window...</div>';
                  
                  // Close window after short delay
                  setTimeout(() => {
                    window.close();
                    // Fallback if window.close() doesn't work
                    if (!window.closed) {
                      statusDiv.innerHTML += '<div>Please close this window manually.</div>';
                    }
                  }, 2000);
                } else {
                  statusDiv.innerHTML = '<div class="error">❌ ' + (result.message || 'Authentication failed') + '</div>';
                }
              } catch (error) {
                statusDiv.innerHTML = '<div class="error">❌ Network error: ' + error.message + '</div>';
              }
            }

            // Auto-focus token input
            document.getElementById('token').focus();
            
            // Handle Enter key
            document.getElementById('token').addEventListener('keypress', function(e) {
              if (e.key === 'Enter') {
                authenticate();
              }
            });
          </script>
        </body>
        </html>
      `;

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html',
          ...this.getCorsHeaders(),
        },
        body: html,
      };
    } catch (error) {
      this.logger.error('Sentry OAuth error:', error);
      return this.createResponse(500, {
        error: 'Internal server error',
        message: error.message,
      });
    }
  }
}

/**
 * Netlify Functions handler
 */
const netlifyHandler = async (event, context) => {
  const transport = new ServerlessTransport();
  return await transport.handleRequest(event, context);
};

/**
 * Vercel handler
 */
const vercelHandler = async (req, res) => {
  const transport = new ServerlessTransport();

  // Convert Vercel request to Netlify-style event
  const event = {
    httpMethod: req.method,
    path: req.url,
    headers: req.headers,
    queryStringParameters: req.query,
    body: req.body ? JSON.stringify(req.body) : null,
    isBase64Encoded: false,
  };

  const result = await transport.handleRequest(event, {});

  res.status(result.statusCode);
  Object.entries(result.headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.end(result.body);
};

/**
 * AWS Lambda handler
 */
const lambdaHandler = async (event, context) => {
  const transport = new ServerlessTransport();
  return await transport.handleRequest(event, context);
};

module.exports = {
  ServerlessTransport,
  netlifyHandler,
  vercelHandler,
  lambdaHandler,
  // Default export for Netlify
  handler: netlifyHandler,
};
