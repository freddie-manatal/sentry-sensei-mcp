# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sentry Sensei MCP is a Model Context Protocol (MCP) server that integrates with Sentry and JIRA APIs. It provides a unified interface for LLMs to interact with Sentry issues and JIRA tickets through MCP tools.

## Development Commands

### Running and Testing

```bash
# Install dependencies (use pnpm)
pnpm install

# Run in development mode (HTTP server)
pnpm dev

# Run in serverless mode (Netlify functions)
pnpm dev:serverless

# Run in stdio mode (for CLI/MCP clients)
pnpm stdio

# Run tests
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format

# Check both linting and formatting
pnpm check
```

### Documentation

```bash
# Start documentation site (Docusaurus)
pnpm docs:start

# Build documentation
pnpm docs:build

# Serve built documentation
pnpm docs:serve
```

### Release Management

This project uses semantic-release for automated versioning and publishing. Commits must follow the Conventional Commits format:

- `feat:` - New feature (triggers minor version bump)
- `fix:` - Bug fix (triggers patch version bump)
- `chore:` - Maintenance tasks
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Test changes

```bash
# Dry run release
pnpm release:dry-run

# Trigger release (automated in CI)
pnpm release
```

## Architecture

### Multi-Transport System

The server supports three different transport mechanisms:

1. **Stdio Transport** (`src/server/transports/stdio.js`)
   - Used for CLI and MCP client connections
   - Uses FastMCP library for implementation
   - Entry point: `src/index.js`

2. **HTTP Transport** (`src/server/transports/http.js`)
   - Development server with Express
   - Supports SSE streaming
   - Entry point: `server.js`
   - Runs on port 3000 (configurable via PORT env var)

3. **Serverless Transport** (`src/server/transports/serverless.js`)
   - Netlify Functions handler
   - Entry point: `netlify/functions/mcp.js`
   - Deployed to: https://sentry-sensei-mcp.netlify.app/mcp

### Core Components

**MCPServer** (`src/server/MCPServer.js`)
- Transport-agnostic MCP protocol implementation
- Handles all MCP methods: `initialize`, `tools/list`, `tools/call`
- Processes JSON-RPC 2.0 requests
- Used by HTTP and serverless transports

**FastMCPServer** (`src/server/FastMCPServer.js`)
- FastMCP-based implementation
- Converts tool definitions to FastMCP format
- Used by stdio transport only

**Handlers** (`src/handlers/`)
- `sentryHandler.js` - Sentry API operations
- `jiraHandler.js` - JIRA API operations
- `datetimeHandler.js` - Current datetime utility
- Created via `createHandlers()` in `src/shared/handlers.js`

**Services** (`src/services/`)
- `SentryService.js` - Low-level Sentry API client
- `JiraService.js` - Low-level JIRA API client
- Handle HTTP requests, authentication, rate limiting

**Credentials System** (`src/shared/credentials.js`)
- Extracts credentials from multiple sources:
  - HTTP headers (`X-Sentry-Token`, `X-Jira-Token`, etc.)
  - Environment variables (`SENTRY_TOKEN`, `JIRA_TOKEN`, etc.)
  - CLI arguments (`--token`, `--jiraAccessToken`, etc.)
- Supports header-based auth for remote MCP usage

**Tool Definitions** (`src/tools/definitions.js`)
- JSON Schema definitions for all MCP tools
- Tool names in `src/tools/constants.js`
- Available tools:
  - `get_sentry_organizations`
  - `get_sentry_projects`
  - `get_sentry_issues`
  - `get_sentry_issue_details`
  - `get_jira_issue_details`
  - `get_jira_fields`
  - `edit_jira_issue`
  - `get_current_datetime`

### Formatters and Utilities

**Formatters** (`src/utils/`)
- `SentryFormatter.js` - Formats Sentry API responses for LLM consumption
- `JiraFormatter.js` - Formats JIRA API responses
- `TokenCounter.js` - Counts tokens using tiktoken
- Both formatters include token counting and truncation to manage context limits

**Utilities**
- `Logger.js` - Centralized logging with level support
- `ErrorHandler.js` - Error handling and formatting
- `schemas.js` - Zod schemas for validation

## Testing

The test suite is in `tests/test-mcp.js`. It tests the MCP server by making stdio requests and verifying responses.

Run tests with: `pnpm test`

## Deployment

The project is deployed to Netlify at: https://sentry-sensei-mcp.netlify.app/mcp

Deployment happens automatically via GitHub Actions when commits are pushed to the main branch.

## Package Publishing

Published to GitHub Packages as `@freddie-manatal/sentry-sensei-mcp`. The semantic-release process handles version bumping, changelog generation, and npm publishing automatically.
