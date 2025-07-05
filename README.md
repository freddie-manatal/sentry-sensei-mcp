# Sentry Sensei MCP

A Model Context Protocol (MCP) server for integrating with Sentry and JIRA APIs.

## Features

- **Sentry Integration**: Fetch organizations, projects, and issues
- **JIRA Integration**: Get detailed ticket information
- **Remote MCP Support**: Works with `mcp-remote` for Claude Desktop
- **Header-based Authentication**: Pass credentials via HTTP headers
- **CLI Interface**: Command-line interface for easy usage
- **Semantic Release**: Automated versioning and publishing

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

## Usage in LLM

Once configured, you can ask your LLM (e.g., Claude) to perform a wide range of Sentry and JIRA operations using natural language. Here are some example queries and what they do:

### Sentry Organization & Project Queries

- **List all Sentry organizations I have access to**

  > "Get my Sentry organizations"
  >
- **List all projects in a specific organization**

  > "List all projects in my Sentry organization 'my-org-slug'"
  >
- **Show all projects I can access**

  > "Show me all Sentry projects I have access to"
  >

### Sentry Issue Queries (with Filtering)

- **Show recent issues for a project**

  > "Show me recent issues from project 'my-project'"
  >
- **Get issues for multiple projects in a specific environment**

  > "Get Sentry issues for projects 'frontend', 'backend' in the 'production' environment"
  >
- **Get issues from the last 7 days**

  > "Show Sentry issues from the last 7 days for project 'api-server'"
  >
- **Filter issues by error type or message**

  > "Show Sentry issues with error message containing 'TypeError' in project 'webapp'"
  > "List Sentry issues excluding error type 'NullPointerException' for project 'backend'"
  >
- **Limit the number of results and sort order**

  > "Get the 10 most recent Sentry issues for project 'mobile-app', sorted by date"
  >
- **Get issues for a specific date range**

  > "Show Sentry issues for project 'api-server' from 2025-06-01 to 2025-06-30"
  >
- **Get issues for multiple environments**

  > "List Sentry issues for project 'webapp' in environments 'production' and 'staging'"
  >
- **Show issues with linked JIRA tickets**

  > "Show Sentry issues from project 'backend' that have linked JIRA tickets"
  >

### JIRA Ticket Details

- **Get details for a specific JIRA ticket**

  > "Get details for JIRA ticket PROJ-123"
  >
- **See recent comments and status for a JIRA ticket**

  > "Show me the latest comments and status for JIRA ticket BUG-4567"
  >
- **Get full summary, assignee, and attachments for a JIRA ticket**

  > "Show full details for JIRA ticket TASK-789, including assignee and attachments"
  >

### Advanced/Combined Examples

- **Investigate a spike in errors**

  > "Show Sentry issues with error message 'DatabaseError' in the last 3 days for project 'api-server'"
  >
- **Cross-reference Sentry and JIRA**

  > "List Sentry issues for project 'frontend' with linked JIRA tickets, and show details for ticket FE-101 if found"
  >
- **Get issues for a specific user**

  > "Show Sentry issues assigned to user 'alice@example.com' in project 'backend'"
  >

---

**Tip:** You can combine filters (project, environment, date range, error type, etc.) for powerful queries. For more details on available parameters, see the [Available Tools](#available-tools) section above.

## CLI Usage

You can use Sentry Sensei MCP directly from the command line in several ways:

### Global Installation

```bash
# Install globally
npm install -g @freddie-manatal/sentry-sensei-mcp

# Use the CLI
sentry-sensei --help
sentry-sensei-mcp --help
```

### Using npx

```bash
npx @freddie-manatal/sentry-sensei-mcp --help
```

### CLI Options

```bash
sentry-sensei [options]

Options:
  --token <token>              Sentry API token
  --sentryHost <host>          Sentry host domain (default: sentry.io)
  --organization <org>         Default organization slug
  --jiraAccessToken <token>    JIRA API token
  --atlassianDomain <domain>   JIRA domain (default: jira.com)
  --jiraUserEmail <email>      JIRA user email
  --version, -v                Show version number
  --help, -h                   Show this help message
```

### Environment Variables

You can also configure the CLI using environment variables:

```bash
export SENTRY_TOKEN="your-token"
export SENTRY_HOST="your-org.sentry.io"
export SENTRY_ORGANIZATION="your-org"
export JIRA_ACCESS_TOKEN="your-token"
export ATLASSIAN_DOMAIN="your-domain.atlassian.net"
export JIRA_USER_EMAIL="your-email@company.com"

# Then run without arguments
sentry-sensei
```

## Development

### Semantic Release

This project uses [semantic-release](https://semantic-release.gitbook.io/semantic-release/) for automated versioning and publishing. The release process is triggered automatically on the main branch when commits follow the [Conventional Commits](https://www.conventionalcommits.org/) format.

### Commit Message Format

Follow the Conventional Commits specification for commit messages:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

Examples:
```bash
feat(cli): add support for environment variables
fix(api): handle null response from Sentry API
docs(readme): update installation instructions
```

### Release Process

1. Commits to main branch are analyzed by semantic-release
2. Version is determined based on commit messages
3. Changelog is automatically generated
4. New version is published to npm
5. Release is created on GitHub with changelog
6. Git tags are created for the release

### Manual Release

For manual releases (if needed):

```bash
# Dry run to see what would be released
npm run release:dry-run

# Trigger a release
npm run release
```

## License

MIT
