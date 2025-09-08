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
- Vault integration setup (requires root token for initial setup)

### Prerequisites

- Keycloak must be installed and configured
- For NFS storage: Longhorn must be installed
- For Vault integration: Vault and External Secrets Operator must be installed
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
JUPYTER_PROFILE_BUUN_STACK_ENABLED=true

# Enable buun-stack CUDA profile (GPU version)
JUPYTER_PROFILE_BUUN_STACK_CUDA_ENABLED=true

# Disable default datascience profile
JUPYTER_PROFILE_DATASCIENCE_ENABLED=false
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

Vault integration enables secure secrets management directly from Jupyter notebooks. The system uses:

- **ExternalSecret** to fetch the admin token from Vault
- **Renewable tokens** with unlimited Max TTL to avoid 30-day system limitations
- **Token renewal script** that automatically renews tokens every 12 hours
- **User-specific tokens** created during notebook spawn with isolated access

### Architecture

```plain
┌──────────────────────────────────────────────────────────────────┐
│                         JupyterHub Hub Pod                       │
│                                                                  │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │     Hub      │  │ Token Renewer  │  │  ExternalSecret   │  │
│  │  Container   │◄─┤   Sidecar      │◄─┤   (mounted as     │  │
│  │              │  │                │  │    Secret)        │  │
│  └──────────────┘  └────────────────┘  └────────────────────┘  │
│         │                    │                     ▲            │
│         │                    │                     │            │
│         ▼                    ▼                     │            │
│  ┌──────────────────────────────────┐              │            │
│  │    /vault/secrets/vault-token    │              │            │
│  │  (Admin token for user creation) │              │            │
│  └──────────────────────────────────┘              │            │
└────────────────────────────────────────────────────┼────────────┘
                                                      │
                                          ┌───────────▼──────────┐
                                          │       Vault          │
                                          │  secret/jupyterhub/  │
                                          │     vault-token      │
                                          └──────────────────────┘
```

### Prerequisites

Vault integration requires:

- Vault server installed and configured
- External Secrets Operator installed
- ClusterSecretStore configured for Vault
- **Buun-stack kernel images** (standard images don't include Vault integration)

### Setup

Vault integration is configured during JupyterHub installation:

```bash
just jupyterhub::install
# Answer "yes" when prompted about Vault integration
# Provide Vault root token when prompted
```

The setup process:

1. Creates `jupyterhub-admin` policy with necessary permissions including `sudo` for orphan token creation
2. Creates renewable admin token with 24h TTL and unlimited Max TTL
3. Stores token in Vault at `secret/jupyterhub/vault-token`
4. Creates ExternalSecret to fetch token from Vault
5. Deploys token renewal sidecar for automatic renewal

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

- **User isolation**: Each user receives an orphan token with access only to their namespace
- **Automatic renewal**: Token renewal script renews admin token every 12 hours
- **ExternalSecret integration**: Admin token fetched securely from Vault
- **Orphan tokens**: User tokens are orphan tokens, not limited by parent policy restrictions
- **Audit trail**: All secret access is logged in Vault

### Token Management

#### Admin Token

The admin token is managed through:

1. **Creation**: `just jupyterhub::create-jupyterhub-vault-token` creates renewable token
2. **Storage**: Stored in Vault at `secret/jupyterhub/vault-token`
3. **Retrieval**: ExternalSecret fetches and mounts as Kubernetes Secret
4. **Renewal**: `vault-token-renewer.sh` script renews every 12 hours

#### User Tokens

User tokens are created dynamically:

1. **Pre-spawn hook** reads admin token from `/vault/secrets/vault-token`
2. **Creates user policy** `jupyter-user-{username}` with restricted access
3. **Creates orphan token** with user policy (requires `sudo` permission)
4. **Sets environment variable** `NOTEBOOK_VAULT_TOKEN` in notebook container

## Storage Options

### Default Storage

Uses Kubernetes PersistentVolumes for user home directories.

### NFS Storage

For shared storage across nodes, configure NFS:

```bash
JUPYTERHUB_NFS_PV_ENABLED=true
JUPYTER_NFS_IP=192.168.10.1
JUPYTER_NFS_PATH=/volume1/drive1/jupyter
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
VAULT_ADDR=https://vault.example.com

# Image settings
JUPYTER_PYTHON_KERNEL_TAG=python-3.12-28
IMAGE_REGISTRY=localhost:30500

# Vault token TTL settings
JUPYTERHUB_VAULT_TOKEN_TTL=24h       # Admin token: renewed every 12h
NOTEBOOK_VAULT_TOKEN_TTL=24h         # User token: 1 day
NOTEBOOK_VAULT_TOKEN_MAX_TTL=168h    # User token: 7 days max

# Logging
JUPYTER_BUUNSTACK_LOG_LEVEL=warning  # Options: debug, info, warning, error
```

### Advanced Configuration

Customize JupyterHub behavior by editing `jupyterhub-values.gomplate.yaml` template before installation.

## Management

### Uninstall

```bash
just jupyterhub::uninstall
```

This removes:

- JupyterHub deployment
- User pods
- PVCs
- ExternalSecret

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

### Manual Token Refresh

If needed, manually refresh the admin token:

```bash
# Create new renewable token
just jupyterhub::create-jupyterhub-vault-token

# Restart JupyterHub to pick up new token
kubectl rollout restart deployment/hub -n jupyter
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
helm upgrade jupyterhub jupyterhub/jupyterhub --timeout=30m -f jupyterhub-values.yaml
```

### Vault Integration Issues

Check token and authentication:

```bash
# Check ExternalSecret status
kubectl get externalsecret -n jupyter jupyterhub-vault-token

# Check if Secret was created
kubectl get secret -n jupyter jupyterhub-vault-token

# Check token renewal logs
kubectl logs -n jupyter -l app.kubernetes.io/component=hub -c vault-agent

# In a notebook, verify environment
%env NOTEBOOK_VAULT_TOKEN
```

Common issues:

1. **"child policies must be subset of parent"**: Admin policy needs `sudo` permission for orphan tokens
2. **Token not found**: Check ExternalSecret and ClusterSecretStore configuration
3. **Permission denied**: Verify `jupyterhub-admin` policy has all required permissions

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

### Token System Architecture

The system uses a three-tier token approach:

1. **Renewable Admin Token**:
   - Created with `explicit-max-ttl=0` (unlimited Max TTL)
   - Renewed automatically every 12 hours
   - Stored in Vault and fetched via ExternalSecret

2. **Orphan User Tokens**:
   - Created with `create_orphan()` API call
   - Not limited by parent token policies
   - Individual TTL and Max TTL settings

3. **Token Renewal Script**:
   - Runs as sidecar container
   - Reads token from ExternalSecret mount
   - Handles renewal and re-retrieval on failure

### Key Files

- `jupyterhub-admin-policy.hcl`: Vault policy with admin permissions
- `user_policy.hcl`: Template for user-specific policies
- `vault-token-renewer.sh`: Token renewal script
- `jupyterhub-vault-token-external-secret.gomplate.yaml`: ExternalSecret configuration

## Performance Considerations

- **Image Size**: Buun-stack images are ~13GB, plan storage accordingly
- **Pull Time**: Initial pulls take 5-15 minutes depending on network
- **Resource Usage**: Data science workloads require adequate CPU/memory
- **Token Renewal**: Minimal overhead (renewal every 12 hours)

For production deployments, consider:

- Pre-pulling images to all nodes
- Using faster storage backends
- Configuring resource limits per user
- Setting up monitoring and alerts

## Known Limitations

1. **Annual Token Recreation**: While tokens have unlimited Max TTL, best practice suggests recreating them annually

2. **Cull Settings**: Server idle timeout is set to 2 hours by default. Adjust `cull.timeout` and `cull.every` in the Helm values for different requirements

3. **NFS Storage**: When using NFS storage, ensure proper permissions are set on the NFS server. The default `JUPYTER_FSGID` is 100

4. **ExternalSecret Dependency**: Requires External Secrets Operator to be installed and configured
