# buun-stack

A Kubernetes development stack for self-hosted environments, designed to run on a Linux machine in your home or office that you can access from anywhere via the internet.

📺 [Watch the setup tutorial on YouTube](https://youtu.be/Ezv4dEjLeKo) | 📝 [Read the detailed guide on Dev.to](https://dev.to/buun-ch/building-a-remote-accessible-kubernetes-home-lab-with-k3s-5g05)

## Features

- **Kubernetes Distribution**: k3s lightweight Kubernetes
- **Storage**: Longhorn distributed block storage
- **Identity & Access**: Keycloak for OIDC authentication
- **Secrets Management**: HashiCorp Vault with External Secrets Operator
- **Database**: PostgreSQL cluster
- **Object Storage**: MinIO S3-compatible storage
- **Data Science**: JupyterHub for collaborative notebooks
- **Remote Access**: Cloudflare Tunnel for secure internet connectivity
- **Automation**: Just task runner with templated configurations

## Quick Start

For detailed step-by-step instructions, see the [Installation Guide](./INSTALLATION.md).

1. **Clone and configure**

   ```bash
   git clone https://github.com/buun-ch/buun-stack
   cd buun-stack
   mise install
   just env::setup
   ```

2. **Deploy cluster and services**

   ```bash
   just k8s::install
   just longhorn::install
   just vault::install
   just postgres::install
   just keycloak::install
   ```

3. **Configure authentication**

   ```bash
   just keycloak::create-realm
   just vault::setup-oidc-auth
   just keycloak::create-user
   just k8s::setup-oidc-auth
   ```

## Core Components

### k3s

Lightweight Kubernetes distribution optimized for edge computing and resource-constrained environments.

### Longhorn

Enterprise-grade distributed storage system providing:

- Highly available block storage
- Backup and disaster recovery
- No single point of failure
- Support for NFS persistent volumes

### HashiCorp Vault

Centralized secrets management offering:

- Secure secret storage
- Dynamic secrets generation
- Encryption as a service
- Integration with External Secrets Operator for automatic Kubernetes Secret synchronization

### Keycloak

Open-source identity and access management providing:

- Single Sign-On (SSO)
- OIDC/OAuth2 authentication
- User federation and identity brokering

### PostgreSQL

Production-ready relational database for:

- Keycloak data storage
- Application databases

### External Secrets Operator

Kubernetes operator for syncing secrets from external systems:

- Automatically syncs secrets from Vault to Kubernetes Secrets
- Supports multiple secret backends
- Provides secure secret rotation and lifecycle management

### MinIO

S3-compatible object storage system providing:

- High-performance distributed object storage
- AWS S3 API compatibility
- Erasure coding for data protection
- Multi-tenancy support

### JupyterHub

Multi-user platform for interactive computing:

- Collaborative Jupyter notebook environment
- Integrated with Keycloak for OIDC authentication
- Persistent storage for user workspaces
- Support for multiple kernels and environments
- Vault integration for secure secrets management

See [JupyterHub Documentation](./docs/jupyterhub.md) for detailed setup and configuration.

## Common Operations

### User Management

Create additional users:

```bash
just keycloak::create-user
```

Add user to group:

```bash
just keycloak::add-user-to-group <username> <group>
```

### Database Management

Create database:

```bash
just postgres::create-db <dbname>
```

Create database user:

```bash
just postgres::create-user <username>
```

Grant privileges:

```bash
just postgres::grant <dbname> <username>
```

### Secret Management

Store secrets in Vault:

```bash
just vault::put <path> <key>=<value>
```

Retrieve secrets:

```bash
just vault::get <path> <field>
```

## Remote Access

Once configured, you can access your cluster from anywhere:

```bash
# SSH access
ssh ssh.yourdomain.com

# Kubernetes API
kubectl --context yourpc-oidc get nodes

# Web interfaces
# Vault: https://vault.yourdomain.com
# Keycloak: https://auth.yourdomain.com
```

## Customization

Create a `custom.just` file to add your own recipes and workflows. The system will automatically import this file if it exists.

## Troubleshooting

- Check logs: `kubectl logs -n <namespace> <pod-name>`

## License

MIT License - See LICENSE file for details
