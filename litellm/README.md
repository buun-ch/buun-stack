# LiteLLM

Unified LLM gateway and proxy for accessing multiple LLM providers through a single OpenAI-compatible API:

- **Multi-Provider Support**: Anthropic, OpenAI, Ollama, Mistral, Groq, Cohere, Azure, Bedrock, Vertex AI
- **OpenAI-Compatible API**: Drop-in replacement for OpenAI SDK
- **Load Balancing & Fallback**: Automatic failover between providers
- **Virtual Keys**: Generate API keys for users with usage tracking
- **Cost Tracking**: Monitor spending across providers
- **Rate Limiting**: Control usage per key/user

## Prerequisites

- Kubernetes cluster (k3s)
- External Secrets Operator (required)
- PostgreSQL cluster (CloudNativePG)
- Vault for secrets management

## Configuration Overview

LiteLLM requires two types of configuration:

1. **Environment variables** (`.env.local`): Host, namespace, chart version
2. **Model definitions** (`models.yaml`): LLM providers and models to expose

This separation allows flexible model configuration without modifying environment files.

## Installation

### Step 1: Create Model Configuration

Copy the example configuration and customize:

```bash
cp litellm/models.example.yaml litellm/models.yaml
```

Edit `litellm/models.yaml` to configure your models:

```yaml
# Anthropic Claude
- model_name: claude-sonnet
  litellm_params:
    model: anthropic/claude-3-7-sonnet-latest
    api_key: os.environ/ANTHROPIC_API_KEY

# OpenAI
- model_name: gpt-4o
  litellm_params:
    model: openai/gpt-4o
    api_key: os.environ/OPENAI_API_KEY

# Ollama (local models - no API key required)
- model_name: llama3
  litellm_params:
    model: ollama/llama3.2
    api_base: http://ollama.ollama:11434
```

### Step 2: Set API Keys

For each provider that requires an API key:

```bash
just litellm::set-api-key anthropic
just litellm::set-api-key openai
```

Or interactively select the provider:

```bash
just litellm::set-api-key
```

API keys are stored in Vault and synced to Kubernetes via External Secrets Operator.

### Step 3: Install LiteLLM

```bash
just litellm::install
```

You will be prompted for:

- **LiteLLM host (FQDN)**: e.g., `litellm.example.com`
- **Enable Prometheus monitoring**: If kube-prometheus-stack is installed

## Model Management

### Add a Model Interactively

```bash
just litellm::add-model
```

This guides you through:

1. Selecting a provider
2. Choosing a model
3. Setting a model alias

### Remove a Model

```bash
just litellm::remove-model
```

### List Configured Models

```bash
just litellm::list-models
```

### Example Output

```text
Configured models:
  - claude-sonnet: anthropic/claude-3-7-sonnet-latest
  - claude-haiku: anthropic/claude-3-5-haiku-latest
  - llama3: ollama/llama3.2
```

## API Key Management

### Set API Key for a Provider

```bash
just litellm::set-api-key anthropic
```

### Get API Key (from Vault)

```bash
just litellm::get-api-key anthropic
```

### Verify All Required Keys

```bash
just litellm::verify-api-keys
```

## Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `LITELLM_NAMESPACE` | `litellm` | Kubernetes namespace |
| `LITELLM_CHART_VERSION` | `0.1.825` | Helm chart version |
| `LITELLM_HOST` | (prompt) | External hostname (FQDN) |
| `OLLAMA_NAMESPACE` | `ollama` | Ollama namespace for local models |
| `MONITORING_ENABLED` | (prompt) | Enable Prometheus ServiceMonitor |

## Authentication

LiteLLM has two types of authentication:

1. **API Access**: Uses Master Key or Virtual Keys for programmatic access
2. **Admin UI**: Uses Keycloak SSO for browser-based access

### Enable SSO for Admin UI

After installing LiteLLM, enable Keycloak authentication for the Admin UI:

```bash
just litellm::setup-oidc
```

This will:

- Create a Keycloak client for LiteLLM
- Store the client secret in Vault
- Configure LiteLLM with OIDC environment variables
- Upgrade the deployment with SSO enabled

### Disable SSO

To disable SSO and return to unauthenticated Admin UI access:

```bash
just litellm::disable-oidc
```

### SSO Configuration Details

| Setting | Value |
| ------- | ----- |
| Callback URL | `https://<litellm-host>/sso/callback` |
| Authorization Endpoint | `https://<keycloak-host>/realms/<realm>/protocol/openid-connect/auth` |
| Token Endpoint | `https://<keycloak-host>/realms/<realm>/protocol/openid-connect/token` |
| Userinfo Endpoint | `https://<keycloak-host>/realms/<realm>/protocol/openid-connect/userinfo` |
| Scope | `openid email profile` |

## User Management

SSO users are automatically created in LiteLLM when they first log in. By default, new users are assigned the `internal_user_viewer` role (read-only access).

### List Users

```bash
just litellm::list-users
```

### Assign Role to User

Interactively select user and role:

```bash
just litellm::assign-role
```

Or specify directly:

```bash
just litellm::assign-role buun proxy_admin
```

### User Roles

| Role | Description |
| ---- | ----------- |
| `proxy_admin` | Full admin access (manage keys, users, models, settings) |
| `proxy_admin_viewer` | Admin read-only access |
| `internal_user` | Can create and manage own API keys |
| `internal_user_viewer` | Read-only access (default for SSO users) |

**Note**: To manage API keys in the Admin UI, users need at least `internal_user` or `proxy_admin` role.

## API Usage

LiteLLM exposes an OpenAI-compatible API at `https://your-litellm-host/`.

### Get Master Key

```bash
just litellm::master-key
```

### Generate Virtual Key for a User

```bash
just litellm::generate-virtual-key buun
```

This will prompt for a model selection and generate an API key for the specified user. Select `all` to grant access to all models.

### OpenAI SDK Example

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://litellm.example.com",
    api_key="sk-..."  # Virtual key or master key
)

response = client.chat.completions.create(
    model="claude-sonnet",  # Use your model alias
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### curl Example

```bash
curl https://litellm.example.com/v1/chat/completions \
  -H "Authorization: Bearer sk-..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Team Management

Teams allow you to group users and configure team-specific settings such as Langfuse projects for observability.

### Create a Team

```bash
just litellm::create-team
```

Or with a name directly:

```bash
just litellm::create-team name="project-alpha"
```

### List Teams

```bash
just litellm::list-teams
```

### Get Team Info

```bash
just litellm::get-team team_id=<team-id>
```

### Delete a Team

```bash
just litellm::delete-team team_id=<team-id>
```

### Generate Virtual Key for a Team

```bash
just litellm::generate-team-key
```

This will prompt for team selection and username. The generated key inherits the team's settings (including Langfuse project configuration).

## Langfuse Integration

[Langfuse](https://langfuse.com/) provides LLM observability with tracing, monitoring, and analytics. LiteLLM can send traces to Langfuse for every API call.

### Enable Langfuse Integration

During installation (`just litellm::install`) or upgrade (`just litellm::upgrade`), you will be prompted to enable Langfuse integration. Alternatively:

```bash
just litellm::setup-langfuse
```

You will need Langfuse API keys (Public Key and Secret Key) from the Langfuse UI: **Settings > API Keys**.

### Set Langfuse API Keys

```bash
just litellm::set-langfuse-keys
```

### Disable Langfuse Integration

```bash
just litellm::disable-langfuse
```

### Per-Team Langfuse Projects

Each team can have its own Langfuse project for isolated observability. This is useful when different projects or departments need separate trace data.

#### Setup Flow

1. Create a team:

   ```bash
   just litellm::create-team name="project-alpha"
   ```

2. Create a Langfuse project for the team and get API keys from Langfuse UI

3. Configure the team's Langfuse project:

   ```bash
   just litellm::set-team-langfuse-project
   ```

   This will prompt for team selection and Langfuse API keys.

4. Generate a key for the team:

   ```bash
   just litellm::generate-team-key
   ```

5. Use the team key for API calls - traces will be sent to the team's Langfuse project

#### Architecture

```plain
LiteLLM Proxy
  |
  +-- Default Langfuse Project (for keys without team)
  |
  +-- Team A --> Langfuse Project A
  |
  +-- Team B --> Langfuse Project B
```

### Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `LITELLM_LANGFUSE_INTEGRATION_ENABLED` | (prompt) | Enable Langfuse integration |
| `LANGFUSE_HOST` | (prompt) | Langfuse instance hostname |

## Supported Providers

| Provider | Model Prefix | API Key Required |
| -------- | ------------ | ---------------- |
| Anthropic | `anthropic/` | Yes |
| OpenAI | `openai/` | Yes |
| Ollama | `ollama/` | No (uses `api_base`) |
| Mistral | `mistral/` | Yes |
| Groq | `groq/` | Yes |
| Cohere | `cohere/` | Yes |
| Azure OpenAI | `azure/` | Yes |
| AWS Bedrock | `bedrock/` | Yes |
| Google Vertex AI | `vertexai/` | Yes |

## Architecture

```plain
External Users/Applications
      |
Cloudflare Tunnel (HTTPS)
      |
Traefik Ingress (HTTPS)
      |
LiteLLM Proxy (HTTP inside cluster)
  |-- PostgreSQL (usage tracking, virtual keys)
  |-- Redis (caching, rate limiting)
  |-- External Secrets (API keys from Vault)
      |
      +-- Anthropic API
      +-- OpenAI API
      +-- Ollama (local)
      +-- Other providers...
```

## Upgrade

After modifying `models.yaml` or updating API keys:

```bash
just litellm::upgrade
```

## Uninstall

```bash
just litellm::uninstall
```

This removes:

- Helm release and all Kubernetes resources
- Namespace
- External Secrets

**Note**: The following resources are NOT deleted:

- PostgreSQL database (use `just postgres::delete-db litellm`)
- API keys in Vault

### Full Cleanup

To remove everything including database and Vault secrets:

```bash
just litellm::cleanup
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n litellm
```

Expected pods:

- `litellm-*` - LiteLLM proxy
- `litellm-redis-master-0` - Redis instance

### View Logs

```bash
kubectl logs -n litellm deployment/litellm --tail=100
```

### API Key Not Working

Verify the ExternalSecret is synced:

```bash
kubectl get externalsecret -n litellm
kubectl get secret apikey -n litellm -o yaml
```

### Model Not Found

Ensure the model is configured in `models.yaml` and the deployment is updated:

```bash
just litellm::list-models
just litellm::upgrade
```

### Provider API Errors

Check if the API key is set correctly:

```bash
just litellm::get-api-key anthropic
```

If empty, set the API key:

```bash
just litellm::set-api-key anthropic
```

### Database Connection Issues

Check PostgreSQL connectivity:

```bash
kubectl exec -n litellm deployment/litellm -- \
  psql -h postgres-cluster-rw.postgres -U litellm -d litellm -c "SELECT 1"
```

## Configuration Files

| File | Description |
| ---- | ----------- |
| `models.yaml` | Model definitions (user-created, gitignored) |
| `models.example.yaml` | Example model configuration |
| `litellm-values.gomplate.yaml` | Helm values template |
| `apikey-external-secret.gomplate.yaml` | ExternalSecret for API keys |
| `keycloak-auth-external-secret.gomplate.yaml` | ExternalSecret for Keycloak OIDC |
| `langfuse-auth-external-secret.gomplate.yaml` | ExternalSecret for Langfuse API keys |

## Security Considerations

- **Pod Security Standards**: Namespace configured with **baseline** enforcement
  (LiteLLM's Prisma requires write access to `/.cache`, which prevents `restricted` level)
- **Secrets Management**: API keys stored in Vault, synced via External Secrets Operator
- **Virtual Keys**: Generate scoped API keys for users instead of sharing master key
- **TLS/HTTPS**: All external traffic encrypted via Traefik Ingress
- **Database Credentials**: Unique PostgreSQL user with minimal privileges

## References

- [LiteLLM Documentation](https://docs.litellm.ai/)
- [LiteLLM GitHub](https://github.com/BerriAI/litellm)
- [LiteLLM Helm Chart](https://github.com/BerriAI/litellm/tree/main/deploy/charts/litellm-helm)
- [Supported Models](https://docs.litellm.ai/docs/providers)
- [Virtual Keys](https://docs.litellm.ai/docs/proxy/virtual_keys)
- [Langfuse Integration](https://docs.litellm.ai/docs/proxy/logging#langfuse)
- [Team-based Logging](https://docs.litellm.ai/docs/proxy/team_logging)
