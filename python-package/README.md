# buunstack

A Python package for buun-stack that provides secure secrets management with HashiCorp Vault and automatic Keycloak OIDC token refresh for JupyterHub users.

## Features

- 🔒 **Secure Secrets Management**: Integration with HashiCorp Vault
- 🔄 **Automatic Token Refresh**: Seamless Keycloak OIDC token management
- 📱 **Simple API**: Easy-to-use interface for secrets storage and retrieval
- 🏢 **Enterprise Ready**: Built for production environments
- 🚀 **JupyterHub Integration**: Native support for JupyterHub workflows

## Quick Start

### Installation

```bash
pip install buunstack
```

### Basic Usage

```python
from buunstack import SecretStore

# Initialize with automatic token refresh (default)
secrets = SecretStore()

# Put API keys and configuration
secrets.put('api-keys', {
    'openai_key': 'sk-your-key-here',
    'github_token': 'ghp_your-token',
    'database_url': 'postgresql://user:pass@host:5432/db'
})

# Get secrets
api_keys = secrets.get('api-keys')
openai_key = api_keys['openai_key']

# List all your secrets
all_secrets = secrets.list()
```

### Configuration Options

```python
# Manual token management
secrets = SecretStore(auto_token_refresh=False)

# Custom refresh timing
secrets = SecretStore(
    auto_token_refresh=True,
    refresh_buffer_seconds=600,      # Refresh 10 minutes before expiry
    background_refresh_interval=3600 # Background refresh every hour
)

# Start background auto-refresh
refresher = secrets.start_background_refresh()
```

### Environment Variables Helper

```python
from buunstack import SecretStore, get_env_from_secrets, put_env_to_secrets

secrets = SecretStore()

# Put environment variables
project_env = {
    'PROJECT_NAME': 'ml-research',
    'MODEL_VERSION': 'v2.1',
    'DEBUG': 'false'
}
put_env_to_secrets(secrets, project_env)

# Get environment variables
loaded_vars = get_env_from_secrets(secrets)
# Now available as os.environ['PROJECT_NAME'], etc.
```

## Comparison with Other Platforms

| Platform | API | Features |
|----------|-----|----------|
| Google Colab | `userdata.get('KEY')` | Simple, strings only |
| Databricks | `dbutils.secrets.get(scope, key)` | Scoped management |
| AWS SageMaker | `boto3.client().get_secret_value()` | JSON support, IAM control |
| Azure ML | `SecretClient().get_secret()` | RBAC, HSM support |
| **buunstack** | `secrets.get('key')` | **JSON support, unlimited sessions, auto-refresh** |

## Requirements

- Python 3.8+
- JupyterHub environment with Keycloak OIDC authentication
- HashiCorp Vault backend
- Required environment variables:
    - `JUPYTERHUB_USER`
    - `VAULT_ADDR`
    - `JUPYTERHUB_OIDC_ACCESS_TOKEN`
    - `JUPYTERHUB_OIDC_REFRESH_TOKEN` (for auto-refresh)
    - `KEYCLOAK_HOST`, `KEYCLOAK_REALM` (for auto-refresh)

## Architecture

buunstack integrates with:

- **JupyterHub**: For user authentication and session management
- **Keycloak**: For OIDC token management and refresh
- **HashiCorp Vault**: For secure secrets storage
- **Kubernetes**: For container orchestration and networking

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## Security

For security issues, please email security@buunstack.dev instead of using the issue tracker.
