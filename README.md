# buun-stack

A remotely accessible Kubernetes home lab with OIDC authentication. Build a modern development environment with integrated data analytics and AI capabilities. Includes a complete open data stack for data ingestion, transformation, serving, and orchestration—built on open-source components you can run locally and port to any cloud.

- 📺 [Remote-Accessible Kubernetes Home Lab](https://www.youtube.com/playlist?list=PLbAvvJK22Y6vJPrUC6GrfNMXneYspckAo) (YouTube playlist)
- 📝 [Building a Remote-Accessible Kubernetes Home Lab with k3s](https://dev.to/buun-ch/building-a-remote-accessible-kubernetes-home-lab-with-k3s-5g05) (Dev.to article)

## Architecture

### Foundation

- **Kubernetes**: [k3s](https://k3s.io/) lightweight distribution
- **Automation**: [Just](https://just.systems/) task runner with templated configurations
- **Remote Access**: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for secure internet connectivity

### Core Components (Required)

- **Database**: [PostgreSQL](https://www.postgresql.org/) cluster with pgvector extension
- **Identity & Access**: [Keycloak](https://www.keycloak.org/) for OIDC authentication

### Recommended Components

- **Secrets Management**: [HashiCorp Vault](https://www.vaultproject.io/) with [External Secrets Operator](https://external-secrets.io/)
    - Used by most stack modules for secure credential management
    - Can be deployed without, but highly recommended

### Storage (Optional)

- **Block Storage**: [Longhorn](https://longhorn.io/) distributed block storage
- **Object Storage**: [MinIO](https://min.io/) S3-compatible storage

### Data & Analytics (Optional)

- **Interactive Computing**: [JupyterHub](https://jupyter.org/hub) for collaborative notebooks
- **Analytics Database**: [ClickHouse](https://clickhouse.com/) for high-performance analytics
- **Vector Database**: [Qdrant](https://qdrant.tech/) for vector search and AI/ML applications
- **Iceberg REST Catalog**: [Lakekeeper](https://lakekeeper.io/) for Apache Iceberg table management
- **Business Intelligence**: [Metabase](https://www.metabase.com/) for data visualization
- **Data Catalog**: [DataHub](https://datahubproject.io/) for metadata management

### Orchestration (Optional)

- **Data Orchestration**: [Dagster](https://dagster.io/) for modern data pipelines
- **Workflow Orchestration**: [Apache Airflow](https://airflow.apache.org/) for task scheduling

### Security (Optional)

- **Authentication Proxy**: [OAuth2 Proxy](https://oauth2-proxy.github.io/oauth2-proxy/) for adding Keycloak authentication

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

## Component Details

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

Multi-user platform for interactive computing with Keycloak authentication and persistent storage.

[📖 See JupyterHub Documentation](./jupyterhub/README.md)

### Metabase

Business intelligence and data visualization platform with PostgreSQL integration.

[📖 See Metabase Documentation](./metabase/README.md)

### DataHub

Modern data catalog and metadata management platform with OIDC integration.

[📖 See DataHub Documentation](./datahub/README.md)

### ClickHouse

High-performance columnar OLAP database for analytics and data warehousing.

[📖 See ClickHouse Documentation](./clickhouse/README.md)

### Qdrant

High-performance vector database for AI/ML applications with similarity search and rich filtering.

[📖 See Qdrant Documentation](./qdrant/README.md)

### Lakekeeper

Apache Iceberg REST Catalog for managing data lake tables with OIDC authentication.

[📖 See Lakekeeper Documentation](./lakekeeper/README.md)

### Apache Airflow

Modern workflow orchestration platform for data pipelines with JupyterHub integration.

[📖 See Airflow Documentation](./airflow/README.md)

### Dagster

Modern data orchestration platform for building data pipelines and managing data assets.

[📖 See Dagster Documentation](./dagster/README.md)

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

## Security & Authentication

### OAuth2 Proxy Integration

For applications that don't natively support Keycloak/OIDC authentication, buun-stack provides OAuth2 Proxy integration to add Keycloak authentication to any application:

- **Universal Authentication**: Add Keycloak SSO to any web application
- **Automatic Setup**: Configures Keycloak client, secrets, and proxy deployment
- **Security**: Prevents unauthorized access by routing all traffic through authentication
- **Easy Management**: Simple recipes for setup and removal

**Setup OAuth2 authentication for any application**:

```bash
# For CH-UI (included in installation prompt)
just ch-ui::setup-oauth2-proxy

# For any custom application
just oauth2-proxy::setup-for-app <app-name> <app-host> [namespace] [upstream-service]
```

**Remove OAuth2 authentication**:

```bash
just ch-ui::remove-oauth2-proxy
just oauth2-proxy::remove-for-app <app-name> [namespace]
```

The OAuth2 Proxy automatically:

- Creates a Keycloak client with proper audience mapping
- Generates secure secrets and stores them in Vault
- Deploys proxy with Traefik ingress routing
- Disables direct application access to ensure security

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
# Airflow: https://airflow.yourdomain.com
# JupyterHub: https://jupyter.yourdomain.com
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
