# buun-stack

A Kubernetes development stack for self-hosted environments, designed to run on a Linux machine in your home or office that you can access from anywhere via the internet.

📺 [Watch the setup tutorial on YouTube](https://youtu.be/Ezv4dEjLeKo) | 📝 [Read the detailed guide on Dev.to](https://dev.to/buun-ch/building-a-remote-accessible-kubernetes-home-lab-with-k3s-5g05)

## Features

- **Kubernetes Distribution**: [k3s](https://k3s.io/) lightweight Kubernetes
- **Storage**: [Longhorn](https://longhorn.io/) distributed block storage
- **Identity & Access**: [Keycloak](https://www.keycloak.org/) for OIDC authentication
- **Secrets Management**: [HashiCorp Vault](https://www.vaultproject.io/) with [External Secrets Operator](https://external-secrets.io/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) cluster
- **Object Storage**: [MinIO](https://min.io/) S3-compatible storage
- **Data Science**: [JupyterHub](https://jupyter.org/hub) for collaborative notebooks
- **Analytics**: [Metabase](https://www.metabase.com/) for business intelligence and data visualization
- **Data Catalog**: [DataHub](https://datahubproject.io/) for metadata management and data discovery
- **Analytics Database**: [ClickHouse](https://clickhouse.com/) for high-performance analytics and data warehousing
- **Remote Access**: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for secure internet connectivity
- **Automation**: [Just](https://just.systems/) task runner with templated configurations

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
- Vector similarity search with [pgvector](https://github.com/pgvector/pgvector) extension for AI/ML workloads

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

### Metabase

Business intelligence and data visualization platform:

- Open-source analytics and dashboards
- Interactive data exploration
- PostgreSQL integration for data storage
- Automated setup with Helm
- Session management through Vault/External Secrets
- Simplified deployment (no OIDC dependency)

Installation:

```bash
just metabase::install
```

Access Metabase at `https://metabase.yourdomain.com` and complete the initial setup wizard to create an admin account.

### DataHub

Modern data catalog and metadata management platform:

- Centralized data discovery and documentation
- Data lineage tracking and impact analysis
- Schema evolution monitoring
- OIDC integration with Keycloak for secure access
- Elasticsearch-powered search and indexing
- Kafka-based real-time metadata streaming
- PostgreSQL backend for metadata storage

Installation:

```bash
just datahub::install
```

> **⚠️ Resource Requirements:** DataHub is resource-intensive, requiring approximately **4-5GB of RAM** and 1+ CPU cores across multiple components (Elasticsearch, Kafka, Zookeeper, and DataHub services). Deployment typically takes 15-20 minutes to complete. Ensure your cluster has sufficient resources before installation.

Access DataHub at `https://datahub.yourdomain.com` and use "Sign in with SSO" to authenticate via Keycloak.

### ClickHouse

High-performance columnar OLAP database for analytics and data warehousing:

- Columnar storage for fast analytical queries
- Real-time data ingestion and processing
- Horizontal scaling for large datasets
- SQL interface with advanced analytics functions
- Integration with External Secrets for secure credential management
- Support for various data formats (CSV, JSON, Parquet, etc.)

Installation:

```bash
just clickhouse::install
```

Access ClickHouse at `https://clickhouse.yourdomain.com` using the admin credentials stored in Vault.

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
# Metabase: https://metabase.yourdomain.com
```

## Customization

### Adding Custom Recipes

You can extend buun-stack with your own Just recipes and services:

1. Copy the example files:

   ```bash
   cp custom-example.just custom.just
   cp -r custom-example custom
   ```

2. Use the custom recipes:

   ```bash
   # Install reddit-rss
   just custom::reddit-rss::install

   # Install Miniflux feed reader
   just custom::miniflux::install
   ```

3. Create your own recipes:

Add new modules to the `custom/` directory following the same pattern as the examples. Each module should have its own `justfile` with install, uninstall, and other relevant recipes.

The `custom.just` file is automatically imported by the main Justfile if it exists, allowing you to maintain your custom workflows separately from the core stack.

## Troubleshooting

- Check logs: `kubectl logs -n <namespace> <pod-name>`

## License

MIT License - See LICENSE file for details
