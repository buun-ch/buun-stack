# buunstack

A Python package for buun-stack that provides secure secrets management with HashiCorp Vault using pre-acquired Vault tokens from JupyterHub for seamless authentication.

## Features

- 🔒 **Secure Secrets Management**: Integration with HashiCorp Vault
- 🚀 **Pre-acquired Authentication**: Uses Vault tokens created at notebook spawn
- 📱 **Simple API**: Easy-to-use interface for secrets storage and retrieval
- 🔄 **Automatic Token Renewal**: Built-in token refresh for long-running sessions
- 🏢 **Enterprise Ready**: Built for production environments

## Quick Start

### Installation

```bash
pip install buunstack
```

### Basic Usage

```python
from buunstack import SecretStore

# Initialize with pre-acquired Vault token (automatic)
secrets = SecretStore()

# Put API keys and configuration
secrets.put('api-keys',
    openai_key='sk-your-key-here',
    github_token='ghp_your-token',
    database_url='postgresql://user:pass@host:5432/db'
)

# Get secrets
api_keys = secrets.get('api-keys')
openai_key = api_keys['openai_key']

# Get specific field directly
openai_key = secrets.get('api-keys', field='openai_key')

# List all your secrets
all_secrets = secrets.list()

# List fields in a specific secret
fields = secrets.list_fields('api-keys')
print(f'Available fields: {fields}')  # ['openai_key', 'github_token', 'database_url']
```

### Configuration Options

```python
# Disable JupyterHub token synchronization
secrets = SecretStore(sync_with_jupyterhub=False)

# Custom token validity buffer
secrets = SecretStore(
    sync_with_jupyterhub=True,
    refresh_buffer_seconds=600  # Sync tokens 10 minutes before expiry
)

# Check synchronization status
status = secrets.get_status()
print(f"JupyterHub sync enabled: {status['sync_with_jupyterhub']}")
print(f"API configured: {status.get('jupyterhub_api_configured', False)}")
```

### Advanced Operations

```python
# Delete a specific field from a secret
secrets.delete('api-keys', field='github_token')

# Delete an entire secret
secrets.delete('old-config')

# Check if a field exists before accessing
if 'openai_key' in secrets.list_fields('api-keys'):
    key = secrets.get('api-keys', field='openai_key')
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
