# Claude Code Integration (MCP)

Claude Code can query Trino directly using the [mcp-trino](https://github.com/tuannvm/mcp-trino) MCP server.

## Installation

### 1. Install mcp-trino

```bash
brew install tuannvm/mcp/mcp-trino
```

### 2. Add to Claude Code Global Configuration

```bash
claude mcp add --scope user mcp-trino mcp-trino
```

This creates a global MCP server configuration at `~/.claude.json`. The `env: {}` configuration means environment variables will be inherited from the parent process.

## Basic Configuration

### 1. Create `.env.claude`

Create `.env.claude` with Trino connection settings:

```bash
# Trino Connection (Password Authentication)
TRINO_HOST=trino.buun.dev
TRINO_PORT=443
TRINO_SCHEME=https
TRINO_SSL=true
TRINO_SSL_INSECURE=true
TRINO_USER=admin
TRINO_PASSWORD="your-password-here"  # Direct password
TRINO_CATALOG=iceberg
TRINO_SCHEMA=default

# Performance: Limit schemas to improve query performance
TRINO_ALLOWED_CATALOGS=iceberg,tpch,postgresql
TRINO_ALLOWED_SCHEMAS=iceberg.ecommerce_marts,iceberg.analytics,tpch.sf1

# Query Configuration
TRINO_ALLOW_WRITE_QUERIES=false
TRINO_QUERY_TIMEOUT=30s

# MCP Transport (STDIO mode)
MCP_TRANSPORT=stdio

# OAuth (disabled for Trino connection - using password auth instead)
OAUTH_ENABLED=false
```

Get the admin password:

```bash
just trino::admin-password
```

### 2. Start Claude Code

Load environment variables and start Claude Code:

```bash
source .env.claude && claude
```

## 1Password Integration

For better security, store credentials in 1Password and inject them at runtime.

### 1. Create `~/.env.claude`

Create `~/.env.claude` in your home directory with 1Password references:

```bash
# Trino Connection (Password Authentication)
TRINO_HOST=trino.buun.dev
TRINO_PORT=443
TRINO_SCHEME=https
TRINO_SSL=true
TRINO_SSL_INSECURE=true
TRINO_USER=admin
TRINO_PASSWORD="op://Personal/trino/password"  # 1Password reference
TRINO_CATALOG=iceberg
TRINO_SCHEMA=default

# Performance: Limit schemas to improve query performance
TRINO_ALLOWED_CATALOGS=iceberg,tpch,postgresql
TRINO_ALLOWED_SCHEMAS=iceberg.ecommerce_marts,iceberg.analytics,tpch.sf1

# Query Configuration
TRINO_ALLOW_WRITE_QUERIES=false
TRINO_QUERY_TIMEOUT=30s

# MCP Transport (STDIO mode)
MCP_TRANSPORT=stdio

# OAuth (disabled for Trino connection - using password auth instead)
OAUTH_ENABLED=false
```

### 2. Create Shell Script

Create a shell script to inject secrets and start Claude Code (e.g., `~/bin/claude-op`):

```bash
#!/usr/bin/env bash
set -euo pipefail
set -a
eval "$(op inject -i ~/.env.claude)"
set +a
claude
```

Make it executable:

```bash
chmod +x ~/bin/claude-op
```

### 3. Start Claude Code

```bash
claude-op
```

This command:

1. Injects secrets from 1Password using `op inject`
2. Exports environment variables to the shell
3. Starts Claude Code with environment variables inherited by mcp-trino

## Usage

Once configured, Claude Code can interact with Trino using natural language:

**Examples:**

```plain
Show me all tables in the ecommerce_marts schema
```

```plain
What's the schema of the dim_products table?
```

```plain
Query the top 10 products by revenue
```

## Available MCP Tools

The mcp-trino server provides the following tools:

- **`list_catalogs`**: List all available Trino catalogs
- **`list_schemas`**: List schemas in a catalog
- **`list_tables`**: List tables in a schema
- **`get_table_schema`**: Get column definitions and types for a table
- **`execute_query`**: Execute SELECT queries
- **`explain_query`**: Show query execution plan

## Configuration Options

### Performance Tuning

**`TRINO_ALLOWED_CATALOGS`** and **`TRINO_ALLOWED_SCHEMAS`**:

- Limits which catalogs and schemas are accessible
- Improves performance by reducing metadata queries
- Reduces attack surface

**`TRINO_QUERY_TIMEOUT`**:

- Maximum time allowed for query execution
- Prevents long-running queries from consuming resources

### Security Settings

**`TRINO_ALLOW_WRITE_QUERIES`**:

- Set to `false` to prevent INSERT, UPDATE, DELETE, CREATE, DROP statements
- Recommended for read-only data exploration

**`TRINO_SSL_INSECURE`**:

- Set to `true` to allow self-signed certificates
- Required for development environments with self-signed certs
- Should be `false` in production with valid certificates

## Troubleshooting

### MCP Server Not Connecting

Check the MCP server status:

```bash
claude mcp list
```

You should see:

```plain
mcp-trino: mcp-trino - ✓ Connected
```

If it shows `✗ Failed to connect`, check:

1. **Environment variables are set**: Verify `.env.claude` exists and contains all required variables
2. **Trino is accessible**: Test with `curl -k https://${TRINO_HOST}`
3. **1Password CLI is authenticated** (if using 1Password): Run `op whoami` to check

### Authentication Fails

If queries fail with authentication errors:

1. **Verify password**: Get the correct password with `just trino::admin-password`
2. **Check environment variable**: Ensure `TRINO_PASSWORD` is set correctly
3. **Test manually**:

   ```bash
   source .env.claude
   echo $TRINO_PASSWORD  # Verify password is loaded
   ```

For 1Password users:

```bash
source <(op inject -i ~/.env.claude)
echo $TRINO_PASSWORD  # Verify password injection worked
```

## Architecture

### Basic Configuration

```plain
User
  ↓
source .env.claude && claude
  ↓ (loads environment variables)
Claude Code (inherits env vars)
  ↓ (STDIO transport)
mcp-trino (reads env vars)
  ↓ (HTTPS with password auth)
Trino Server
```

### Advanced: 1Password Integration

```plain
User
  ↓
claude-op (shell script)
  ↓ (op inject from ~/.env.claude)
Claude Code (inherits env vars)
  ↓ (STDIO transport)
mcp-trino (reads env vars)
  ↓ (HTTPS with password auth)
Trino Server
```

**Key Points:**

- mcp-trino runs as a child process of Claude Code
- Environment variables flow from shell → Claude Code → mcp-trino
- No configuration file needed for mcp-trino; all settings via environment variables
- 1Password injection happens once at startup (Advanced), not per-query

## References

- [mcp-trino GitHub Repository](https://github.com/tuannvm/mcp-trino)
- [Claude Code MCP Documentation](https://docs.claude.com/en/docs/claude-code/mcp)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [1Password CLI Documentation](https://developer.1password.com/docs/cli/)
