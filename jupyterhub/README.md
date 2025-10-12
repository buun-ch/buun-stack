# JupyterHub

Multi-user platform for interactive computing:

- Collaborative Jupyter notebook environment
- Integrated with Keycloak for OIDC authentication
- Persistent storage for user workspaces
- Support for multiple kernels and environments
- Vault integration for secure secrets management

See [JupyterHub Documentation](../docs/jupyterhub.md) for detailed setup and configuration.

## Installation

```bash
just jupyterhub::install
```

## Access

Access JupyterHub at `https://jupyter.yourdomain.com` and authenticate via Keycloak.

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
