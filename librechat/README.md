# LibreChat

Web-based chat interface for interacting with LLMs:

- **Multi-Model Support**: Connect to Ollama, OpenAI, Anthropic, and custom endpoints
- **MCP Integration**: Model Context Protocol for web search and external tools
- **Keycloak Authentication**: OAuth2/OIDC integration for user management
- **Conversation History**: MongoDB-backed chat history with search via Meilisearch
- **Persistent Storage**: User-uploaded images stored persistently

## Prerequisites

- [Keycloak](../keycloak/README.md) for OIDC authentication
- [Vault](../vault/README.md) for secrets management
- [Ollama](../ollama/README.md) for local LLM inference (optional)

## Installation

```bash
just librechat::install
```

During installation, you will be prompted for:

- **LibreChat host**: FQDN for LibreChat (e.g., `chat.example.com`)
- **Keycloak host**: FQDN for Keycloak (e.g., `auth.example.com`)
- **Tavily MCP**: Enable web search via Tavily API (requires API key)

### Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `LIBRECHAT_NAMESPACE` | `librechat` | Kubernetes namespace |
| `LIBRECHAT_CHART_VERSION` | `1.9.3` | Helm chart version |
| `LIBRECHAT_HOST` | (prompt) | LibreChat FQDN |
| `LIBRECHAT_OIDC_CLIENT_ID` | `librechat` | Keycloak client ID |
| `KEYCLOAK_HOST` | (prompt) | Keycloak FQDN |
| `KEYCLOAK_REALM` | `buunstack` | Keycloak realm |
| `OLLAMA_HOST` | `ollama.ollama.svc.cluster.local` | Ollama service host |
| `TAVILY_MCP_ENABLED` | (prompt) | Enable Tavily MCP (`true`/`false`) |

### Example with Environment Variables

```bash
LIBRECHAT_HOST=chat.example.com \
  KEYCLOAK_HOST=auth.example.com \
  TAVILY_MCP_ENABLED=true \
  just librechat::install
```

## Ollama Integration

LibreChat automatically connects to Ollama using the internal Kubernetes service
URL. The default models configured are:

- `qwen3:8b`
- `deepseek-r1:8b`

LibreChat fetches the available model list from Ollama, so any models you pull
will be available.

## MCP (Model Context Protocol)

LibreChat supports MCP servers for extending model capabilities with external tools.

### Tavily Web Search

When `TAVILY_MCP_ENABLED=true`, LibreChat can search the web using Tavily API:

1. Get a Tavily API key from [tavily.com](https://tavily.com/)
2. During installation, enter the API key when prompted (stored in Vault)
3. In the chat interface, select "tavily" from the MCP Servers dropdown
4. The model can now search the web to answer questions

### Adding Custom MCP Servers

Edit `librechat-config.gomplate.yaml` to add additional MCP servers:

```yaml
mcpServers:
  tavily:
    command: npx
    args:
      - "-y"
      - "tavily-mcp@latest"
    env:
      TAVILY_API_KEY: "${TAVILY_API_KEY}"
  filesystem:
    command: npx
    args:
      - "-y"
      - "@anthropic/mcp-server-filesystem"
      - "/app/data"
```

## Adding API Providers

Edit `librechat-config.gomplate.yaml` to add OpenAI, Anthropic, or other providers:

```yaml
endpoints:
  openAI:
    apiKey: "${OPENAI_API_KEY}"
    models:
      default:
        - gpt-4o
        - gpt-4o-mini
      fetch: true

  anthropic:
    apiKey: "${ANTHROPIC_API_KEY}"
    models:
      default:
        - claude-sonnet-4-20250514
        - claude-3-5-haiku-20241022
```

Store the API keys in Kubernetes secrets and reference them in `values.gomplate.yaml`.

## Operations

### Check Status

```bash
just librechat::status
```

### View Logs

```bash
just librechat::logs
```

### Restart

```bash
just librechat::restart
```

## Upgrade

```bash
just librechat::upgrade
```

## Uninstall

```bash
just librechat::uninstall
```

This removes the Helm release, namespace, and Keycloak client. Vault secrets
are preserved.

To delete Vault secrets:

```bash
just vault::delete librechat/credentials
```

## Architecture

LibreChat deployment includes:

- **LibreChat**: Main application (Node.js)
- **MongoDB**: Conversation and user data storage
- **Meilisearch**: Full-text search for conversations

All components run with Pod Security Standards set to `restricted`.

## Troubleshooting

### OIDC Login Fails

**Symptom**: Redirect loop or error after Keycloak login

**Check**:

1. Verify `DOMAIN_CLIENT` and `DOMAIN_SERVER` match your LibreChat URL
2. Check Keycloak client redirect URI matches `https://<host>/oauth/openid/callback`

```bash
just keycloak::get-client buunstack librechat
```

### Ollama Models Not Showing

**Symptom**: No models available in the model selector

**Check**:

1. Verify Ollama is running: `just ollama::status`
2. Check Ollama has models: `just ollama::list`
3. Check LibreChat logs for connection errors: `just librechat::logs`

### MCP Not Working

**Symptom**: MCP server not available in dropdown

**Check**:

1. Verify Tavily secret exists:

   ```bash
   kubectl get secret tavily-api-key -n librechat
   ```

2. Check for MCP errors in logs:

   ```bash
   just librechat::logs | grep -i mcp
   ```

3. Verify `librechat-config` ConfigMap has MCP configuration:

   ```bash
   kubectl get configmap librechat-config -n librechat -o yaml
   ```

## References

- [LibreChat Website](https://www.librechat.ai/)
- [LibreChat Documentation](https://www.librechat.ai/docs)
- [LibreChat GitHub](https://github.com/danny-avila/LibreChat)
- [LibreChat Helm Chart](https://github.com/danny-avila/librechat-helm)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Tavily API](https://tavily.com/)
