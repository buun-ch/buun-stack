# JupyterHub

JupyterHub provides a multi-user Jupyter notebook environment with Keycloak OIDC authentication, Vault integration for secure secrets management, and custom kernel images for data science workflows.

## Table of Contents

- [Installation](#installation)
- [Prerequisites](#prerequisites)
- [Access](#access)
- [MCP Server Integration](#mcp-server-integration)
- [Programmatic API Access](#programmatic-api-access)
- [Kernel Images](#kernel-images)
- [Profile Configuration](#profile-configuration)
- [GPU Support](#gpu-support)
- [Buun-Stack Images](#buun-stack-images)
- [buunstack Package & SecretStore](#buunstack-package--secretstore)
- [Vault Integration](#vault-integration)
- [Token Renewal Implementation](#token-renewal-implementation)
- [Storage Options](#storage-options)
- [Configuration](#configuration)
- [Custom Container Images](#custom-container-images)
- [Management](#management)
- [Troubleshooting](#troubleshooting)
- [Technical Implementation Details](#technical-implementation-details)
- [Performance Considerations](#performance-considerations)
- [Known Limitations](#known-limitations)

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

## Prerequisites

- Keycloak must be installed and configured
- For NFS storage: Longhorn must be installed
- For Vault integration: Vault and External Secrets Operator must be installed
- Helm repository must be accessible

## Access

Access JupyterHub at your configured host (e.g., `https://jupyter.example.com`) and authenticate via Keycloak.

## MCP Server Integration

JupyterHub includes [jupyter-mcp-server](https://jupyter-mcp-server.datalayer.tech/) as a Jupyter Server Extension, enabling MCP (Model Context Protocol) clients to interact with Jupyter notebooks programmatically.

### Overview

The MCP server provides a standardized interface for AI assistants and other MCP clients to:

- List and manage files on the Jupyter server
- Create, read, and edit notebook cells
- Execute code in notebook kernels
- Manage kernel sessions

### Enabling MCP Server

MCP server support is controlled by the `JUPYTER_MCP_SERVER_ENABLED` environment variable. During installation, you will be prompted:

```bash
just jupyterhub::install
# "Enable jupyter-mcp-server for Claude Code integration? (y/N)"
```

Or set the environment variable before installation:

```bash
JUPYTER_MCP_SERVER_ENABLED=true just jupyterhub::install
```

### Kernel Image Requirements

The MCP server requires jupyter-mcp-server to be installed and enabled in the kernel image.

**Buun-Stack profiles** (`buun-stack`, `buun-stack-cuda`) include jupyter-mcp-server pre-installed and enabled. No additional setup is required.

**Other profiles** (minimal, base, datascience, pyspark, pytorch, tensorflow) do not include jupyter-mcp-server. To use MCP with these images, install the required packages in your notebook:

```bash
pip install 'jupyter-mcp-server==0.21.0' 'jupyter-mcp-tools>=0.1.4'
pip uninstall -y pycrdt datalayer_pycrdt
pip install 'datalayer_pycrdt==0.12.17'
jupyter server extension enable jupyter_mcp_server
```

After installation, restart your Jupyter server for the extension to take effect.

### MCP Endpoint

When enabled, each user's Jupyter server exposes an MCP endpoint at:

```text
https://<JUPYTERHUB_HOST>/user/<username>/mcp
```

### Authentication

MCP clients must authenticate using a JupyterHub API token. Obtain a token using:

```bash
# Get token for a user (creates user if not exists)
just jupyterhub::get-token <username>
```

The token should be passed in the `Authorization` header:

```text
Authorization: token <JUPYTERHUB_TOKEN>
```

### Client Configuration

#### Generic MCP Client Configuration

For any MCP client that supports HTTP transport:

```bash
just jupyterhub::setup-mcp-server <username>
```

This displays the MCP server URL, authentication details, and available tools.

#### Claude Code Configuration

For Claude Code specifically:

```bash
just jupyterhub::setup-claude-mcp-server <username>
```

This provides a ready-to-use `.mcp.json` configuration:

```json
{
  "mcpServers": {
    "jupyter-<username>": {
      "type": "http",
      "url": "https://<JUPYTERHUB_HOST>/user/<username>/mcp",
      "headers": {
        "Authorization": "token ${JUPYTERHUB_TOKEN}"
      }
    }
  }
}
```

Set the environment variable:

```bash
export JUPYTERHUB_TOKEN=<your-token>
```

### Checking MCP Status

Verify MCP server status for a user:

```bash
just jupyterhub::mcp-status <username>
```

This checks:

- User pod is running
- jupyter-mcp-server extension is enabled
- MCP endpoint is responding

### Technical Details

- **Transport**: HTTP (streamable-http)
- **Extension**: jupyter-mcp-server (installed in kernel images)
- **Environment Variable**: `JUPYTERHUB_ALLOW_TOKEN_IN_URL=1` enables WebSocket token authentication

## Programmatic API Access

buun-stack configures JupyterHub to allow programmatic API access, enabling token generation and user management without requiring users to log in first. This is achieved by registering a **Service** in JupyterHub.

### What is a JupyterHub Service?

In JupyterHub, a **Service** is a registered entity (external program or script) that can access the JupyterHub API using a pre-configured token. While regular users obtain tokens by logging in, services use tokens registered in the JupyterHub configuration.

```python
# Register a service with its API token
c.JupyterHub.services = [
    {
        'name': 'admin-service',
        'api_token': '<token>',
    }
]

# Grant permissions to the service
c.JupyterHub.load_roles = [
    {
        'name': 'admin-service-role',
        'scopes': ['admin:users', 'tokens', 'admin:servers'],
        'services': ['admin-service'],
    }
]
```

When an API request includes `Authorization: token <token>`, JupyterHub identifies the token owner (in this case, `admin-service`) and applies the corresponding permissions.

### How It Works

```text
┌─────────────────────────────────────────────────────────────────┐
│  just jupyterhub::get-token <username>                          │
│                                                                 │
│  1. Retrieve service token from Kubernetes Secret               │
│  2. Call JupyterHub API with the token                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  JupyterHub API                                                 │
│                                                                 │
│  1. Receive: Authorization: token <service-token>               │
│  2. Identify: This token belongs to "admin-service"             │
│  3. Check permissions: admin-service has admin:users, tokens    │
│  4. Execute: Create user token and return it                    │
└─────────────────────────────────────────────────────────────────┘
```

### Service Configuration

The service is automatically configured during JupyterHub installation:

1. **Token Generation**: A random token is generated using `just utils::random-password`
2. **Secret Storage**: Token is stored in Vault (if External Secrets Operator is available) or as a Kubernetes Secret
3. **Service Registration**: JupyterHub is configured with the service and appropriate RBAC roles

### RBAC Permissions

The registered service has the following scopes:

- `admin:users` - Create, read, update, delete users
- `tokens` - Create and manage API tokens
- `admin:servers` - Start and stop user servers

### Usage

#### Get Token for a User

```bash
# Creates user if not exists, returns API token
just jupyterhub::get-token <username>
```

This command:

1. Checks if the user exists in JupyterHub
2. Creates the user if not found
3. Generates an API token with appropriate scopes
4. Returns the token for use with MCP or other API clients

#### Manual Token Management

The service token is stored in:

- **Vault path**: `secret/jupyterhub/admin-service` (key: `token`)
- **Kubernetes Secret**: `jupyterhub-admin-service-token` in the JupyterHub namespace

To recreate the service token:

```bash
just jupyterhub::create-admin-service-token-secret
```

### Security Considerations

- The service token has elevated privileges; protect it accordingly
- Tokens are stored encrypted in Vault when External Secrets Operator is available
- User tokens generated via the service have limited scopes (`access:servers!user=<username>`, `self`)

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

## GPU Support

JupyterHub supports GPU-accelerated notebooks using NVIDIA GPUs. GPU support is automatically enabled during installation if the nvidia-device-plugin is detected.

### GPU Prerequisites

GPU support requires the following components to be installed:

#### NVIDIA Device Plugin

Install the NVIDIA device plugin for Kubernetes:

```bash
just nvidia-device-plugin::install
```

This plugin:

- Exposes NVIDIA GPUs to Kubernetes as schedulable resources
- Manages GPU allocation to pods
- Ensures proper GPU driver access within containers

#### RuntimeClass Configuration

The nvidia-device-plugin installation automatically creates the `nvidia` RuntimeClass, which:

- Configures containerd to use the NVIDIA container runtime
- Enables GPU access for containers using `runtimeClassName: nvidia`

### Enabling GPU Support

During JupyterHub installation, you will be prompted:

```bash
just jupyterhub::install
# When nvidia-device-plugin is installed, you'll see:
# "Enable GPU support for JupyterHub notebooks? (y/N)"
```

Alternatively, set the environment variable before installation:

```bash
JUPYTERHUB_GPU_ENABLED=true
JUPYTERHUB_GPU_LIMIT=1  # Number of GPUs per user (default: 1)
```

### GPU-Enabled Profiles

When GPU support is enabled:

1. **All notebook profiles** get GPU access via `runtimeClassName: nvidia`
2. **CUDA-specific profile** (buun-stack-cuda) additionally includes:
   - CUDA 12.x toolkit
   - PyTorch with CUDA support
   - GPU-optimized libraries

### Usage

#### Selecting a GPU Profile

When spawning a notebook, select a profile with GPU capabilities:

- **Buun-stack with CUDA**: Recommended for GPU workloads (requires custom image)
- **PyTorch**: Standard PyTorch notebook
- **TensorFlow**: Standard TensorFlow notebook

#### Verifying GPU Access

In your notebook, verify GPU availability:

```python
import torch

# Check if CUDA is available
print(f"CUDA available: {torch.cuda.is_available()}")

# Get GPU device count
print(f"GPU count: {torch.cuda.device_count()}")

# Get GPU device name
if torch.cuda.is_available():
    print(f"GPU name: {torch.cuda.get_device_name(0)}")

    # Test GPU operation
    torch.cuda.synchronize()
    print("GPU is working correctly!")
```

#### GPU Configuration

Default GPU configuration:

- **GPU limit per user**: 1 GPU (configurable via `JUPYTERHUB_GPU_LIMIT`)
- **Memory requests**: 1Gi (defined in singleuser settings)
- **RuntimeClass**: `nvidia` (automatically applied when GPU enabled)

### Building GPU-Enabled Custom Images

If using the buun-stack-cuda profile, build and push the CUDA-enabled image:

```bash
# Enable CUDA profile
export JUPYTER_PROFILE_BUUN_STACK_CUDA_ENABLED=true

# Build CUDA-enabled image (includes PyTorch with CUDA 12.x)
just jupyterhub::build-kernel-images

# Push to registry
just jupyterhub::push-kernel-images
```

The CUDA image:

- Based on `quay.io/jupyter/pytorch-notebook:x86_64-cuda12-python-3.12.10`
- Includes PyTorch with CUDA 12.4 support (`cu124`)
- Contains all standard buun-stack packages
- Supports GPU-accelerated deep learning

### Troubleshooting GPU Issues

#### Pod Not Scheduling

If GPU-enabled pods fail to schedule:

```bash
# Check if nvidia-device-plugin is running
kubectl get pods -n nvidia-device-plugin

# Verify GPU resources are advertised
kubectl describe nodes | grep nvidia.com/gpu

# Check RuntimeClass exists
kubectl get runtimeclass nvidia
```

#### CUDA Not Available

If `torch.cuda.is_available()` returns `False`:

1. Verify the image has CUDA support:

   ```bash
   # In notebook
   !nvcc --version  # Should show CUDA compiler version
   ```

2. Check Pod uses nvidia RuntimeClass:

   ```bash
   kubectl get pod <pod-name> -n datastack -o yaml | grep runtimeClassName
   ```

3. Rebuild image if using custom buun-stack-cuda image

#### GPU Memory Issues

Monitor GPU usage:

```python
import torch

# Check GPU memory
if torch.cuda.is_available():
    print(f"Allocated: {torch.cuda.memory_allocated(0) / 1024**3:.2f} GB")
    print(f"Reserved: {torch.cuda.memory_reserved(0) / 1024**3:.2f} GB")

    # Clear cache if needed
    torch.cuda.empty_cache()
```

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

## buunstack Package & SecretStore

JupyterHub includes the **buunstack** Python package, which provides seamless integration with HashiCorp Vault for secure secrets management in your notebooks.

### Key Features

- 🔒 **Secure Secrets Management**: Store and retrieve secrets securely using HashiCorp Vault
- 🚀 **Pre-acquired Authentication**: Uses Vault tokens created automatically at notebook spawn
- 📱 **Simple API**: Easy-to-use interface similar to Google Colab's `userdata.get()`
- 🔄 **Automatic Token Renewal**: Built-in token refresh for long-running sessions

### Quick Example

```python
from buunstack import SecretStore

# Initialize with pre-acquired Vault token (automatic)
secrets = SecretStore()

# Store secrets
secrets.put('api-keys',
    openai_key='sk-your-key-here',
    github_token='ghp_your-token',
    database_url='postgresql://user:pass@host:5432/db'
)

# Retrieve secrets
api_keys = secrets.get('api-keys')
openai_key = api_keys['openai_key']

# Or get a specific field directly
openai_key = secrets.get('api-keys', field='openai_key')
```

### Learn More

For detailed documentation, usage examples, and API reference, see:

[📖 buunstack Package Documentation](../python-package/README.md)

## Vault Integration

### Overview

Vault integration enables secure secrets management directly from Jupyter notebooks. The system uses:

- **ExternalSecret** to fetch the admin token from Vault
- **Renewable tokens** with unlimited Max TTL to avoid 30-day system limitations
- **Token renewal script** that automatically renews tokens at TTL/2 intervals (minimum 30 seconds)
- **User-specific tokens** created during notebook spawn with isolated access

### Architecture

```plain
┌────────────────────────────────────────────────────────────────┐
│                         JupyterHub Hub Pod                     │
│                                                                │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │     Hub      │  │ Token Renewer  │  │  ExternalSecret    │  │
│  │  Container   │◄─┤   Sidecar      │◄─┤   (mounted as      │  │
│  │              │  │                │  │    Secret)         │  │
│  └──────────────┘  └────────────────┘  └────────────────────┘  │
│         │                    │                     ▲           │
│         │                    │                     │           │
│         ▼                    ▼                     │           │
│  ┌──────────────────────────────────┐              │           │
│  │    /vault/secrets/vault-token    │              │           │
│  │  (Admin token for user creation) │              │           │
│  └──────────────────────────────────┘              │           │
└────────────────────────────────────────────────────┼───────────┘
                                                     │
                                         ┌───────────▼──────────┐
                                         │       Vault          │
                                         │  secret/jupyterhub/  │
                                         │     vault-token      │
                                         └──────────────────────┘
```

### Vault Integration Prerequisites

Vault integration requires:

- Vault server installed and configured
- External Secrets Operator installed
- ClusterSecretStore configured for Vault
- Buun-stack kernel images (standard images don't include Vault integration)

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
- **Automatic renewal**: Token renewal script renews admin token at TTL/2 intervals (minimum 30 seconds)
- **ExternalSecret integration**: Admin token fetched securely from Vault
- **Orphan tokens**: User tokens are orphan tokens, not limited by parent policy restrictions
- **Audit trail**: All secret access is logged in Vault

### Token Management

#### Admin Token

The admin token is managed through:

1. **Creation**: `just jupyterhub::create-jupyterhub-vault-token` creates renewable token
2. **Storage**: Stored in Vault at `secret/jupyterhub/vault-token`
3. **Retrieval**: ExternalSecret fetches and mounts as Kubernetes Secret
4. **Renewal**: `vault-token-renewer.sh` script renews at TTL/2 intervals

#### User Tokens

User tokens are created dynamically:

1. **Pre-spawn hook** reads admin token from `/vault/secrets/vault-token`
2. **Creates user policy** `jupyter-user-{username}` with restricted access
3. **Creates orphan token** with user policy (requires `sudo` permission)
4. **Sets environment variable** `NOTEBOOK_VAULT_TOKEN` in notebook container

## Token Renewal Implementation

### Admin Token Renewal

The admin token renewal is handled by a sidecar container (`vault-token-renewer`) running alongside the JupyterHub hub:

**Implementation Details:**

1. **Renewal Script**: `/vault/config/vault-token-renewer.sh`
   - Runs in the `vault-token-renewer` sidecar container
   - Uses Vault 1.17.5 image with HashiCorp Vault CLI

2. **Environment-Based TTL Configuration**:

   ```bash
   # Reads TTL from environment variable (set in .env.local)
   TTL_RAW="${JUPYTERHUB_VAULT_TOKEN_TTL}"  # e.g., "5m", "24h"

   # Converts to seconds and calculates renewal interval
   RENEWAL_INTERVAL=$((TTL_SECONDS / 2))  # TTL/2 with minimum 30s
   ```

3. **Token Source**: ExternalSecret → Kubernetes Secret → mounted file

   ```bash
   # Token retrieved from ExternalSecret-managed mount
   ADMIN_TOKEN=$(cat /vault/admin-token/token)
   ```

4. **Renewal Loop**:

   ```bash
   while true; do
       vault token renew >/dev/null 2>&1
       sleep $RENEWAL_INTERVAL
   done
   ```

5. **Error Handling**: If renewal fails, re-retrieves token from ExternalSecret mount

**Key Files:**

- `vault-token-renewer.sh`: Main renewal script
- `jupyterhub-vault-token-external-secret.gomplate.yaml`: ExternalSecret configuration
- `vault-token-renewer-config` ConfigMap: Contains the renewal script

### User Token Renewal

User token renewal is handled within the notebook environment by the `buunstack` Python package:

**Implementation Details:**

1. **Token Source**: Environment variable set by pre-spawn hook

   ```python
   # In pre_spawn_hook.gomplate.py
   spawner.environment["NOTEBOOK_VAULT_TOKEN"] = user_vault_token
   ```

2. **Automatic Renewal**: Built into `SecretStore` class operations

   ```python
   # In buunstack/secrets.py
   def _ensure_authenticated(self):
       token_info = self.client.auth.token.lookup_self()
       ttl = token_info.get("data", {}).get("ttl", 0)
       renewable = token_info.get("data", {}).get("renewable", False)

       # Renew if TTL < 10 minutes and renewable
       if renewable and ttl > 0 and ttl < 600:
           self.client.auth.token.renew_self()
   ```

3. **Renewal Trigger**: Every `SecretStore` operation (get, put, delete, list)
   - Checks token validity before operation
   - Automatically renews if TTL < 10 minutes
   - Transparent to user code

4. **Token Configuration** (set during creation):
   - **TTL**: `NOTEBOOK_VAULT_TOKEN_TTL` (default: 24h = 1 day)
   - **Max TTL**: `NOTEBOOK_VAULT_TOKEN_MAX_TTL` (default: 168h = 7 days)
   - **Policy**: User-specific `jupyter-user-{username}`
   - **Type**: Orphan token (independent of parent token lifecycle)

5. **Expiry Handling**: When token reaches Max TTL:
   - Cannot be renewed further
   - User must restart notebook server (triggers new token creation)
   - Prevented by `JUPYTERHUB_CULL_MAX_AGE` setting (6 days < 7 day Max TTL)

**Key Files:**

- `pre_spawn_hook.gomplate.py`: User token creation logic
- `buunstack/secrets.py`: Token renewal implementation
- `user_policy.hcl`: User token permissions template

### Token Lifecycle Summary

```plain
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Admin Token   │    │   User Token     │    │  Pod Lifecycle  │
│                 │    │                  │    │                 │
│ Created: Manual │    │ Created: Spawn   │    │ Max Age: 7 days │
│ TTL: 5m-24h     │    │ TTL: 1 day       │    │ Auto-restart    │
│ Max TTL: ∞      │    │ Max TTL: 7 days  │    │ at Max TTL      │
│ Renewal: Auto   │    │ Renewal: Auto    │    │                 │
│ Interval: TTL/2 │    │ Trigger: Usage   │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
   vault-token-renewer      buunstack.py            cull.maxAge
   sidecar                  SecretStore            pod restart
```

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
JUPYTERHUB_VAULT_TOKEN_TTL=24h       # Admin token: renewed at TTL/2 intervals
NOTEBOOK_VAULT_TOKEN_TTL=24h         # User token: 1 day (renewed on usage)
NOTEBOOK_VAULT_TOKEN_MAX_TTL=168h    # User token: 7 days max

# Server pod lifecycle settings
JUPYTERHUB_CULL_MAX_AGE=604800       # Max pod age in seconds (7 days = 604800s)
                                     # Should be <= NOTEBOOK_VAULT_TOKEN_MAX_TTL

# Logging
JUPYTER_BUUNSTACK_LOG_LEVEL=warning  # Options: debug, info, warning, error
```

### Advanced Configuration

Customize JupyterHub behavior by editing `jupyterhub-values.gomplate.yaml` template before installation.

## Custom Container Images

JupyterHub uses custom container images with pre-installed data science tools and integrations:

### datastack-notebook (CPU)

Standard notebook image based on `jupyter/pytorch-notebook`:

- **PyTorch**: Deep learning framework
- **PySpark**: Apache Spark integration for big data processing
- **ClickHouse Client**: Direct database access
- **Python 3.12**: Latest Python runtime

[📖 See Image Documentation](./images/datastack-notebook/README.md)

### datastack-cuda-notebook (GPU)

GPU-enabled notebook image based on `jupyter/pytorch-notebook:cuda12`:

- **CUDA 12**: GPU acceleration support
- **PyTorch with GPU**: Hardware-accelerated deep learning
- **PySpark**: Apache Spark integration
- **ClickHouse Client**: Direct database access
- **Python 3.12**: Latest Python runtime

[📖 See Image Documentation](./images/datastack-cuda-notebook/README.md)

Both images are based on the official [Jupyter Docker Stacks](https://github.com/jupyter/docker-stacks) and include all standard data science libraries (NumPy, pandas, scikit-learn, matplotlib, etc.).

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
kubectl logs -n jupyter -l app.kubernetes.io/component=hub -c vault-token-renewer

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
   - Renewed automatically at TTL/2 intervals (minimum 30 seconds)
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
- **Token Renewal**: Minimal overhead (renewal at TTL/2 intervals)

For production deployments, consider:

- Pre-pulling images to all nodes
- Using faster storage backends
- Configuring resource limits per user
- Setting up monitoring and alerts

## Known Limitations

1. **Annual Token Recreation**: While tokens have unlimited Max TTL, best practice suggests recreating them annually
2. **Token Expiry and Pod Lifecycle**: User tokens have a TTL of 1 day (`NOTEBOOK_VAULT_TOKEN_TTL=24h`) and maximum TTL of 7 days (`NOTEBOOK_VAULT_TOKEN_MAX_TTL=168h`). Daily usage extends the token for another day, allowing up to 7 days of continuous use. Server pods are automatically restarted after 7 days (`JUPYTERHUB_CULL_MAX_AGE=604800s`) to refresh tokens.
3. **Cull Settings**: Server idle timeout is set to 2 hours by default. Adjust `cull.timeout` and `cull.every` in the Helm values for different requirements
4. **NFS Storage**: When using NFS storage, ensure proper permissions are set on the NFS server. The default `JUPYTER_FSGID` is 100
5. **ExternalSecret Dependency**: Requires External Secrets Operator to be installed and configured
