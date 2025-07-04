---
sidebar_position: 1
---
# Sentry Sensei MCP

A Model Context Protocol (MCP) server for integrating with Sentry and JIRA APIs.

## Features

- **Sentry Integration**: Fetch organizations, projects, and issues
- **JIRA Integration**: Get detailed ticket information
- **Remote MCP Support**: Works with `mcp-remote` for Claude Desktop
- **Header-based Authentication**: Pass credentials via HTTP headers

## Quick Setup (Remote MCP)

### 1. Configure Claude Desktop or Cursor

Add this to your Claude Desktop or Cursor config (`~/.cursor/mcp.json` or `~/Library/Application Support/Claude/config.json`):

```json
{
  "mcpServers": {
    "sentry-sensei-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://sentry-sensei-mcp.netlify.app/mcp",
        "--header",
        "X-Sentry-Host:${SENTRY_HOST}",
        "--header",
        "X-Sentry-Organization:${SENTRY_ORG}",
        "--header",
        "X-Sentry-Token:${SENTRY_TOKEN}",
        "--header",
        "X-Atlassian-Domain:${ATLASSIAN_DOMAIN}",
        "--header",
        "X-Jira-Token:${JIRA_TOKEN}",
        "--header",
        "X-Jira-Email:${JIRA_EMAIL}"
      ],
      "env": {
        "SENTRY_HOST": "https://your-org.sentry.io",
        "SENTRY_ORG": "your-org-slug",
        "SENTRY_TOKEN": "your-sentry-token",
        "ATLASSIAN_DOMAIN": "your-company.atlassian.net",
        "JIRA_TOKEN": "your-jira-api-token",
        "JIRA_EMAIL": "your-email@company.com"
      }
    }
  }
}
```

### 2. Get Your Credentials

**Sentry:**

- Host: Your Sentry instance URL (e.g., `https://your-org.sentry.io`)
- Organization: Your organization slug
- Token: Create an auth token at Settings > Auth Tokens

**JIRA:**

- Domain: Your Atlassian domain (e.g., `your-company.atlassian.net`)
- Token: Create an API token at Account Settings > Security > API tokens
- Email: Your Atlassian account email

## Local Development

### Setup

```bash
npm install
npm run dev
```

### Local Development Configuration

For local development, use this configuration in your MCP config:

```json
{
  "mcpServers": {
    "sentry-sensei-mcp-dev": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:3000//mcp",
        "--header",
        "X-Sentry-Host:${SENTRY_HOST}",
        "--header",
        "X-Sentry-Organization:${SENTRY_ORG}",
        "--header",
        "X-Sentry-Token:${SENTRY_TOKEN}",
        "--header",
        "X-Atlassian-Domain:${ATLASSIAN_DOMAIN}",
        "--header",
        "X-Jira-Token:${JIRA_TOKEN}",
        "--header",
        "X-Jira-Email:${JIRA_EMAIL}"
      ],
      "env": {
        "SENTRY_HOST": "https://your-org.sentry.io",
        "SENTRY_ORG": "your-org-slug",
        "SENTRY_TOKEN": "your-sentry-token",
        "ATLASSIAN_DOMAIN": "your-company.atlassian.net",
        "JIRA_TOKEN": "your-jira-api-token",
        "JIRA_EMAIL": "your-email@company.com"
      }
    }
  }
}
```

### Run Locally

```bash
npm run dev
```

The server will be available at `http://localhost:3000/mcp`

## Available Tools

- **get_sentry_organizations** - List your Sentry organizations
- **get_sentry_projects** - List projects for an organization
- **get_sentry_issues** - Get issues with filtering options
- **get_sentry_issue_details**- Get issues details
- **get_jira_ticket_details** - Get detailed JIRA ticket information

## Usage Examples

### Sentry Organization & Project Queries

- "Get my Sentry organizations"
- "List all projects in my Sentry organization 'my-org-slug'"
- "Show me all Sentry projects I have access to"

### Sentry Issue Queries

- "Show me recent issues from project 'my-project'"
- "Get Sentry issues for projects 'frontend', 'backend' in the 'production' environment"
- "Show Sentry issues from the last 7 days for project 'api-server'"
- "Show Sentry issues with error message containing 'TypeError' in project 'webapp'"

### JIRA Ticket Details

- "Get details for JIRA ticket PROJ-123"
- "Show me the latest comments and status for JIRA ticket BUG-4567"
- "Show full details for JIRA ticket TASK-789, including assignee and attachments"

## Architecture

Sentry Sensei MCP provides a bridge between your AI assistant and your development tools:

```
AI Assistant (Claude) ↔ MCP Server ↔ Sentry API
                                  ↔ JIRA API
```

The server exposes tools that allow your AI assistant to:

- Query Sentry for error data and project information
- Fetch JIRA ticket details and status
- Cross-reference issues between platforms

## Need Help?

If you encounter issues, check the [troubleshooting guide](./usage/troubleshooting) for common problems and solutions.
