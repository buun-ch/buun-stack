# JupyterHub

JupyterHub provides a multi-user Jupyter notebook environment with Keycloak OIDC authentication, Vault integration for secure secrets management, and custom kernel images for data science workflows.

## Installation

Install JupyterHub with interactive configuration:

```bash
just jupyterhub::install
```

This will prompt for:

- JupyterHub host (FQDN)
- NFS PV usage (if Longhorn is installed)
- NFS server details (if NFS is enabled)
- Vault integration setup

### Prerequisites

- Keycloak must be installed and configured
- For NFS storage: Longhorn must be installed
- For Vault integration: Vault must be installed and configured
- Helm repository must be accessible

## Kernel Images

### Important Note

Building and using custom buun-stack images requires building the `buunstack` Python package first. The package wheel file will be included in the Docker image during build.

JupyterHub supports multiple kernel image profiles:

### Standard Profiles

- **minimal**: Basic Python environment
- **base**: Python with common data science packages
- **datascience**: Full data science stack (default)
- **pyspark**: PySpark for big data processing
- **pytorch**: PyTorch for machine learning
- **tensorflow**: TensorFlow for machine learning

### Buun-Stack Profiles

- **buun-stack**: Comprehensive data science environment with Vault integration
- **buun-stack-cuda**: CUDA-enabled version with GPU support

## Profile Configuration

Enable/disable profiles using environment variables:

```bash
# Enable buun-stack profile (CPU version)
export JUPYTER_PROFILE_BUUN_STACK_ENABLED=true

# Enable buun-stack CUDA profile (GPU version)
export JUPYTER_PROFILE_BUUN_STACK_CUDA_ENABLED=true

# Disable default datascience profile
export JUPYTER_PROFILE_DATASCIENCE_ENABLED=false
```

Available profile variables:

- `JUPYTER_PROFILE_MINIMAL_ENABLED`
- `JUPYTER_PROFILE_BASE_ENABLED`
- `JUPYTER_PROFILE_DATASCIENCE_ENABLED`
- `JUPYTER_PROFILE_PYSPARK_ENABLED`
- `JUPYTER_PROFILE_PYTORCH_ENABLED`
- `JUPYTER_PROFILE_TENSORFLOW_ENABLED`
- `JUPYTER_PROFILE_BUUN_STACK_ENABLED`
- `JUPYTER_PROFILE_BUUN_STACK_CUDA_ENABLED`

Only `JUPYTER_PROFILE_DATASCIENCE_ENABLED` is true by default.

## Buun-Stack Images

Buun-stack images provide comprehensive data science environments with:

- All standard data science packages (NumPy, Pandas, Scikit-learn, etc.)
- Deep learning frameworks (PyTorch, TensorFlow, Keras)
- Big data tools (PySpark, Apache Arrow)
- NLP and ML libraries (LangChain, Transformers, spaCy)
- Database connectors and tools
- **Vault integration** with `buunstack` Python package

### Building Custom Images

Build and push buun-stack images to your registry:

```bash
# Build images (includes building the buunstack Python package)
just jupyterhub::build-kernel-images

# Push to registry
just jupyterhub::push-kernel-images
```

The build process:

1. Builds the `buunstack` Python package wheel
2. Copies the wheel into the Docker build context
3. Installs the wheel in the Docker image
4. Cleans up temporary files

⚠️ **Note**: Buun-stack images are comprehensive and large (~13GB). Initial image pulls and deployments take significant time due to the extensive package set.

### Image Configuration

Configure image settings in `.env.local`:

```bash
# Image registry
IMAGE_REGISTRY=localhost:30500

# Image tag (current default)
JUPYTER_PYTHON_KERNEL_TAG=python-3.12-28
```

## Vault Integration

### Overview

Vault integration enables secure secrets management directly from Jupyter notebooks using user-specific Vault tokens. Each user receives their own isolated Vault token during notebook spawn, ensuring complete separation of secrets between users. Users can store and retrieve API keys, database credentials, and other sensitive data securely with automatic token renewal.

### Prerequisites

Vault integration requires:

- Vault server installed and configured
- Keycloak OIDC authentication configured
- **Buun-stack kernel images** (standard images don't include Vault integration)

### Setup

Vault integration is configured during JupyterHub installation. You have two options:

#### Option 1: Interactive setup (recommended)

```bash
just jupyterhub::install
# Answer "yes" when prompted about Vault integration
```

#### Option 2: Pre-configured setup

```bash
export JUPYTERHUB_VAULT_INTEGRATION_ENABLED=true
just jupyterhub::install
```

**Note**: The `just jupyterhub::setup-vault-integration` command is called automatically during installation if Vault integration is enabled. This configures Vault Agent for automatic token renewal and user-specific token management.

### Usage in Notebooks

With Vault integration enabled, use the `buunstack` package in notebooks:

```python
from buunstack import SecretStore

# Initialize (uses pre-acquired user-specific token)
secrets = SecretStore()

# Store secrets
secrets.put('api-keys',
    openai='sk-...',
    github='ghp_...',
    database_url='postgresql://...')

# Retrieve secrets
api_keys = secrets.get('api-keys')
openai_key = secrets.get('api-keys', field='openai')

# List all secrets
secret_names = secrets.list()

# Delete secrets or specific fields
secrets.delete('old-api-key')  # Delete entire secret
secrets.delete('api-keys', field='github')  # Delete only github field
```

### Security Features

- **User isolation**: Each user receives a unique Vault token with access only to their own secrets
- **Automatic token renewal**: Both admin and user tokens are automatically renewed by Vault Agent
- **Vault Agent integration**: JupyterHub admin token is automatically renewed using Kubernetes authentication
- **Audit trail**: All secret access is logged in Vault
- **Individual policies**: Each user has their own Vault policy restricting access to their namespace

## Storage Options

### Default Storage

Uses Kubernetes PersistentVolumes for user home directories.

### NFS Storage

For shared storage across nodes, configure NFS:

```bash
export JUPYTERHUB_NFS_PV_ENABLED=true
export JUPYTER_NFS_IP=192.168.10.1
export JUPYTER_NFS_PATH=/volume1/drive1/jupyter
```

NFS storage requires:

- Longhorn storage system installed
- NFS server accessible from cluster nodes
- Proper NFS export permissions configured

## Configuration

### Environment Variables

Key configuration variables:

```bash
# Basic settings
JUPYTERHUB_NAMESPACE=jupyter
JUPYTERHUB_CHART_VERSION=4.2.0
JUPYTERHUB_OIDC_CLIENT_ID=jupyterhub

# Keycloak integration
KEYCLOAK_REALM=buunstack

# Storage
JUPYTERHUB_NFS_PV_ENABLED=false

# Vault integration
JUPYTERHUB_VAULT_INTEGRATION_ENABLED=false
VAULT_ADDR=http://vault.vault.svc:8200

# Image settings
JUPYTER_PYTHON_KERNEL_TAG=python-3.12-28
IMAGE_REGISTRY=localhost:30500

# Vault token TTL settings
JUPYTERHUB_VAULT_TOKEN_TTL=24h       # Admin token: 1 day (auto-renewed by Vault Agent)
JUPYTERHUB_VAULT_TOKEN_MAX_TTL=720h  # Admin token: 30 days (max renewal limit)
NOTEBOOK_VAULT_TOKEN_TTL=24h         # User token: 1 day (auto-renewed)
NOTEBOOK_VAULT_TOKEN_MAX_TTL=168h    # User token: 7 days (max renewal limit)

# Vault Agent logging
VAULT_AGENT_LOG_LEVEL=info           # Options: trace, debug, info, warn, error

# Application logging
JUPYTER_BUUNSTACK_LOG_LEVEL=warning  # Options: debug, info, warning, error
```

### Advanced Configuration

Customize JupyterHub behavior by editing `jupyterhub-values.gomplate.yaml` template before installation.

## Management

### Uninstall

```bash
just jupyterhub::uninstall
```

### Update

Upgrade to newer versions:

```bash
# Update image tag in .env.local
export JUPYTER_PYTHON_KERNEL_TAG=python-3.12-29

# Rebuild and push images
just jupyterhub::build-kernel-images
just jupyterhub::push-kernel-images

# Upgrade JupyterHub deployment
just jupyterhub::install
```

## Troubleshooting

### Image Pull Issues

Buun-stack images are large and may timeout:

```bash
# Check pod status
kubectl get pods -n jupyter

# Check image pull progress
kubectl describe pod <pod-name> -n jupyter

# Increase timeout if needed
helm upgrade jupyterhub jupyterhub/jupyterhub \
  --timeout=30m -f jupyterhub-values.yaml
```

### Vault Integration Issues

Check Vault connectivity and authentication:

```python
# In a notebook
import os
print("Vault Address:", os.getenv('VAULT_ADDR'))
print("JWT Token:", bool(os.getenv('NOTEBOOK_VAULT_JWT')))
print("Vault Token:", bool(os.getenv('NOTEBOOK_VAULT_TOKEN')))

# Test SecretStore
from buunstack import SecretStore
secrets = SecretStore()
status = secrets.get_status()
print(status)
```

### Authentication Issues

Verify Keycloak client configuration:

```bash
# Check client exists
just keycloak::get-client buunstack jupyterhub

# Check redirect URIs
just keycloak::update-client buunstack jupyterhub \
  "https://your-jupyter-host/hub/oauth_callback"
```

## Technical Implementation Details

### Helm Chart Version

JupyterHub uses the official Zero to JupyterHub (Z2JH) Helm chart:

- Chart: `jupyterhub/jupyterhub`
- Version: `4.2.0` (configurable via `JUPYTERHUB_CHART_VERSION`)
- Documentation: https://z2jh.jupyter.org/

### User-Specific Vault Token System

The `buunstack` SecretStore uses pre-created user-specific Vault tokens that are generated during notebook spawn, ensuring complete user isolation and secure access to individual secret namespaces.

#### Architecture Overview

```plain
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   JupyterHub    │    │     Notebook     │    │      Vault      │
│                 │    │                  │    │                 │
│  ┌───────────┐  │    │  ┌────────────┐  │    │  ┌───────────┐  │
│  │Pre-spawn  │  │───►│  │SecretStore │  ├───►│  │User Token │  │
│  │   Hook    │  │    │  │            │  │    │  │  + Policy │  │
│  └───────────┘  │    │  └────────────┘  │    │  └───────────┘  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

**Key Components**:

- **JupyterHub Admin Token**: Automatically renewed by Vault Agent, read from file at `/vault/secrets/vault-token`
- **User-Specific Tokens**: Created dynamically during notebook spawn, available as `NOTEBOOK_VAULT_TOKEN` environment variable  
- **User Policies**: Restrict access to `secret/data/jupyter/users/{username}/*`
- **Vault Agent**: Sidecar container that handles automatic token renewal using Kubernetes authentication

#### Token Lifecycle

1. **Pre-spawn Hook Setup**
   - JupyterHub uses admin Vault token to access Vault API
   - Creates user-specific Vault policy with restricted path access
   - Generates new user-specific Vault token with the created policy
   - Passes user token to notebook environment via `NOTEBOOK_VAULT_TOKEN`

2. **SecretStore Initialization**
   - Reads user-specific token from environment variable:
     - `NOTEBOOK_VAULT_TOKEN` (User-specific Vault token)
   - Uses token for all Vault operations within user's namespace

3. **Token Validation**
   - Before operations, checks token validity using `lookup_self`
   - Verifies token TTL and renewable status

4. **Automatic Token Renewal**
   - If token TTL is low (< 10 minutes) and renewable, renews token
   - Uses `renew_self` capability granted by user policy
   - Logs renewal success for monitoring

#### Code Flow

```python
def _ensure_authenticated(self):
    # Check if current Vault token is valid
    try:
        if self.client.is_authenticated():
            # Check if token needs renewal
            token_info = self.client.auth.token.lookup_self()
            ttl = token_info.get("data", {}).get("ttl", 0)
            renewable = token_info.get("data", {}).get("renewable", False)

            # Renew if TTL < 10 minutes and renewable
            if renewable and ttl > 0 and ttl < 600:
                self.client.auth.token.renew_self()
                logger.info("✅ Vault token renewed successfully")
            return
    except Exception:
        pass

    # Token expired and cannot be refreshed
    raise Exception("User-specific Vault token expired and cannot be refreshed. Please restart your notebook server.")
```

#### Key Design Decisions

##### 1. User-Specific Token Creation

- Each user receives a unique Vault token during notebook spawn
- Individual policies ensure complete user isolation
- Admin token used only during pre-spawn hook for token creation

##### 2. Policy-Based Access Control

- User policies restrict access to `secret/data/jupyter/users/{username}/*`
- Each user can only access their own secret namespace
- Token management capabilities (`lookup_self`, `renew_self`) included

##### 3. Singleton Pattern

- Single SecretStore instance per notebook session
- Prevents multiple simultaneous authentications
- Maintains consistent token state

##### 4. Pre-created User Tokens

- Tokens are created during notebook spawn via pre-spawn hook
- Reduces initialization overhead in notebooks
- Provides immediate access to user's secret namespace

#### Error Handling

```python
# Primary error scenarios and responses:

1. User token unavailable
   → Token stored in NOTEBOOK_VAULT_TOKEN env var
   → Prompt to restart notebook server if missing

2. Vault token expired
   → Automatic renewal using renew_self if renewable
   → Restart notebook server required if not renewable

3. Vault authentication failure
   → Log detailed error information
   → Check user policy and token configuration

4. Network connectivity issues
   → Built-in retry in hvac client
   → Provide actionable error messages
```

#### Configuration

Environment variables passed to notebooks:

```yaml
# JupyterHub pre_spawn_hook sets:
spawner.environment:
  # Core services
  POSTGRES_HOST: 'postgres-cluster-rw.postgres'
  POSTGRES_PORT: '5432'
  JUPYTERHUB_API_URL: 'http://hub:8081/hub/api'
  BUUNSTACK_LOG_LEVEL: 'info'  # or 'debug' for detailed logging

  # Vault integration
  NOTEBOOK_VAULT_TOKEN: '<User-specific Vault token>'
  VAULT_ADDR: 'http://vault.vault.svc:8200'
```

#### Monitoring and Debugging

Enable detailed logging for troubleshooting:

```python
# In notebook
import os
os.environ['BUUNSTACK_LOG_LEVEL'] = 'DEBUG'

# Restart kernel and check logs
from buunstack import SecretStore
secrets = SecretStore()

# Check authentication status
status = secrets.get_status()
print("Username:", status['username'])
print("Vault Address:", status['vault_addr'])
print("Authentication Method:", status['authentication_method'])
print("Vault Authenticated:", status['vault_authenticated'])
```

#### Performance Characteristics

- **Token renewal overhead**: ~10-50ms for renew_self call
- **Memory usage**: Minimal (single token stored as string)
- **Network traffic**: Only during token renewal (when TTL < 10 minutes)
- **Vault impact**: Standard token operations (lookup_self, renew_self)

## Performance Considerations

- **Image Size**: Buun-stack images are ~13GB, plan storage accordingly
- **Pull Time**: Initial pulls take 5-15 minutes depending on network
- **Resource Usage**: Data science workloads require adequate CPU/memory
- **Storage**: NFS provides better performance for shared datasets
- **Token Renewal**: User token renewal adds minimal overhead

For production deployments, consider:

- Pre-pulling images to all nodes
- Using faster storage backends
- Configuring resource limits per user
- Setting up monitoring and alerts
- Monitoring Vault token expiration and renewal patterns

## Vault Agent Integration

### Overview

JupyterHub now uses Vault Agent for automatic token renewal, eliminating the need for manual token management. Vault Agent runs as a sidecar container in the JupyterHub hub pod and automatically renews the admin token using Kubernetes authentication.

### Architecture

```plain
┌─────────────────────────────────────────────────────────────┐
│                    JupyterHub Hub Pod                       │
│                                                             │
│  ┌─────────────────┐              ┌─────────────────────┐  │
│  │   Hub Container │              │ Vault Agent Sidecar │  │
│  │                 │              │                     │  │
│  │ Reads token     │◄─────────────┤ Writes token        │  │
│  │ from file       │              │ to shared volume    │  │
│  │                 │              │                     │  │
│  └─────────────────┘              └─────────────────────┘  │
│           │                                 │               │
│           │                                 │               │
│           │                                 │               │
│  ┌─────────▼─────────┐              ┌─────────▼─────────┐  │
│  │ /vault/secrets/   │              │ Kubernetes Auth   │  │
│  │   vault-token     │              │   with Vault      │  │
│  └───────────────────┘              └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Key Features

- **Automatic Renewal**: Admin token is automatically renewed every TTL/2 interval
- **Kubernetes Authentication**: Uses Kubernetes ServiceAccount for secure token acquisition
- **File-based Token Sharing**: Vault Agent writes tokens to shared volume, Hub reads from file
- **Zero Downtime**: Token renewal happens in background without service interruption
- **Configurable Logging**: Vault Agent log level can be configured via `VAULT_AGENT_LOG_LEVEL`

### Monitoring Token Renewal

Check Vault Agent status and token renewal:

```bash
# Monitor Vault Agent logs
kubectl logs -n jupyter -l app.kubernetes.io/component=hub -c vault-agent -f

# Use monitoring script
cd jupyterhub
./monitor-vault-token.sh

# Check token details
kubectl exec -n jupyter <hub-pod> -c hub -- curl -s -H "X-Vault-Token: $(cat /vault/secrets/vault-token)" $VAULT_ADDR/v1/auth/token/lookup-self
```

### Testing Token Renewal

For testing purposes, you can use shorter TTL values to observe rapid token renewal:

```bash
# Test with 1-minute TTL (renews every 30 seconds)
JUPYTERHUB_VAULT_TOKEN_TTL=1m VAULT_AGENT_LOG_LEVEL=debug just jupyterhub::install

# Monitor renewal activity
kubectl logs -n jupyter -l app.kubernetes.io/component=hub -c vault-agent -f | grep "renewed auth token"
```

### Configuration Files

The Vault Agent integration uses several configuration files:

- `vault-agent-config.gomplate.hcl`: Vault Agent configuration template
- `token-monitor.tpl`: Template for logging token information
- `monitor-vault-token.sh`: Monitoring script for token status

## Known Limitations

1. **Token Max TTL**: Even with Vault Agent auto-renewal, tokens cannot be renewed beyond `JUPYTERHUB_VAULT_TOKEN_MAX_TTL` (default: 720h/30 days). After this period, JupyterHub must be redeployed to acquire a new token from Vault. With the default 30-day limit, this requires monthly maintenance.

2. **Cull Settings**: Server idle timeout is set to 2 hours by default. Adjust `cull.timeout` and `cull.every` in the Helm values for different requirements.

3. **NFS Storage**: When using NFS storage, ensure proper permissions are set on the NFS server. The default `JUPYTER_FSGID` is 100.

4. **Vault Agent Resource Usage**: The Vault Agent sidecar uses minimal resources (50m CPU, 64Mi memory) but adds slight overhead to the hub pod.
