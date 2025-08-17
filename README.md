# buun-stack

A Kubernetes development stack for self-hosted environments, designed to run on a Linux machine in your home or office that you can access from anywhere via the internet.

## Features

- **Kubernetes Distribution**: k3s lightweight Kubernetes
- **Storage**: Longhorn distributed block storage
- **Identity & Access**: Keycloak for OIDC authentication
- **Secrets Management**: HashiCorp Vault
- **Database**: PostgreSQL cluster
- **Remote Access**: Cloudflare Tunnel for secure internet connectivity
- **Automation**: Just task runner with templated configurations

## Prerequisites

- Linux PC (low power consumption recommended)
- DNS and tunnel managed by Cloudflare
- Local development machine (Linux or macOS preferred)
    - Install [mise](https://mise.jdx.dev/)

## Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/buun-ch/buun-stack
   cd buun-stack
   ```

2. **Install required tools**

   ```bash
   mise install
   mise ls -l  # Verify installation
   ```

3. **Configure environment**

   ```bash
   just env::setup  # Creates .env.local with your configuration
   ```

4. **Install Kubernetes cluster**

   ```bash
   just k8s::install
   kubectl get nodes  # Verify cluster is running
   ```

5. **Set up Cloudflare Tunnel**
   - Create tunnel in Cloudflare dashboard
   - Configure public hostnames:
     - `ssh.yourdomain.com` → SSH localhost:22
     - `vault.yourdomain.com` → HTTPS localhost:443 (no TLS verify)
     - `auth.yourdomain.com` → HTTPS localhost:443 (no TLS verify)
     - `k8s.yourdomain.com` → HTTPS localhost:6443 (no TLS verify)

6. **Install core components**

   ```bash
   just longhorn::install   # Storage layer
   just vault::install      # Secrets management
   just postgres::install   # Database
   just keycloak::install   # Identity provider
   ```

7. **Configure authentication**

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

### Keycloak

Open-source identity and access management providing:

- Single Sign-On (SSO)
- OIDC/OAuth2 authentication
- User federation and identity brokering

### PostgreSQL

Production-ready relational database for:

- Keycloak data storage
- Application databases

## Task Management

All operations are managed through `just` recipes. Key commands include:

```bash
just                     # Show all available commands
just env::setup          # Configure environment
just k8s::install        # Install Kubernetes
just keycloak::create-user <username>  # Create a new user
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
