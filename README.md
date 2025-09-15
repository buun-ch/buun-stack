# buun-stack

A Kubernetes development stack for self-hosted environments, designed to run on a Linux machine in your home or office that you can access from anywhere via the internet.

📺 [Watch the setup tutorial on YouTube](https://youtu.be/Ezv4dEjLeKo) | 📝 [Read the detailed guide on Dev.to](https://dev.to/buun-ch/building-a-remote-accessible-kubernetes-home-lab-with-k3s-5g05)

## Features

- **Kubernetes Distribution**: [k3s](https://k3s.io/) lightweight Kubernetes
- **Block Storage**: [Longhorn](https://longhorn.io/) distributed block storage
- **Object Storage**: [MinIO](https://min.io/) S3-compatible storage
- **Identity & Access**: [Keycloak](https://www.keycloak.org/) for OIDC authentication
- **Secrets Management**: [HashiCorp Vault](https://www.vaultproject.io/) with [External Secrets Operator](https://external-secrets.io/)
- **Interactive Computing**: [JupyterHub](https://jupyter.org/hub) for collaborative notebooks
- **Business Intelligence**: [Metabase](https://www.metabase.com/) for business intelligence and data visualization
- **Data Catalog**: [DataHub](https://datahubproject.io/) for metadata management and data discovery
- **Database**: [PostgreSQL](https://www.postgresql.org/) cluster
- **Analytics Engine/Database**: [ClickHouse](https://clickhouse.com/) for high-performance analytics and data warehousing
- **Data Orchestration**: [Dagster](https://dagster.io/) for modern data pipelines and asset management
- **Workflow Orchestration**: [Apache Airflow](https://airflow.apache.org/) for data pipeline automation and task scheduling
- **Authentication Proxy**: [OAuth2 Proxy](https://oauth2-proxy.github.io/oauth2-proxy/) for adding Keycloak authentication to any application
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

**CH-UI Web Interface**: An optional web-based query interface for ClickHouse is available:

```bash
just ch-ui::install
```

### Apache Airflow

Modern workflow orchestration platform for data pipelines and task automation:

- Airflow 3 with modern SDK components and FastAPI integration
- DAG Development: Integrated with JupyterHub for seamless workflow creation and editing
- OIDC Authentication: Secure access through Keycloak integration
- Shared Storage: DAG files shared between JupyterHub and Airflow for direct editing
- Role-based Access Control: Multiple user roles (Admin, Operator, User, Viewer)
- REST API: Ful API access for programmatic DAG management

Installation:

```bash
just airflow::install
```

**JupyterHub Integration**: After installing both JupyterHub and Airflow, DAG files are automatically shared:

- Edit DAG files directly in JupyterHub: `~/airflow-dags/*.py`
- Changes appear in Airflow UI within 1-2 minutes
- Full Python development environment with syntax checking
- Template files available for quick DAG creation

**User Management**:

```bash
# Assign roles to users
just airflow::assign-role <username> <role>

# Available roles: airflow_admin, airflow_op, airflow_user, airflow_viewer
just airflow::assign-role myuser airflow_admin
```

**API Access**: Create API users for programmatic access:

```bash
just airflow::create-api-user <username> <role>
```

> **💡 Development Workflow**: Create DAGs in JupyterHub using `~/airflow-dags/dag_template.py` as a starting point. Use `.tmp` extension during development to avoid import errors, then rename to `.py` when ready.

Access Airflow at `https://airflow.yourdomain.com` and authenticate via Keycloak.

### Dagster

Modern data orchestration platform for building data pipelines and managing data assets:

- **Asset-Centric Development**: Define data assets with clear lineage and dependencies
- **Dynamic Pipeline Deployment**: Deploy projects directly from local development environments
- **Integrated Development**: Shared storage with PVC-based project deployment
- **OAuth2 Authentication**: Secure access through Keycloak via OAuth2 Proxy
- **Python-First**: Native Python development with comprehensive SDK

Installation:

```bash
just dagster::install
```

**Project Development**: Deploy `dagster project scaffold` projects directly to Dagster:

```bash
# Create a new project locally
dagster project scaffold my-project

# Deploy to Dagster cluster
just dagster::deploy-project my-project

# Remove project when done
just dagster::remove-project my-project
```

**Storage Configuration**:

- **MinIO**: S3-compatible object storage for compute logs and staging
- **Local**: Persistent volumes with automatic Longhorn RWX detection for shared development

**Custom Dependencies**: For projects requiring additional Python packages:

```bash
# Build custom image with dependencies
export DAGSTER_CONTAINER_IMAGE=myregistry/dagster-custom
export DAGSTER_CONTAINER_TAG=latest
just dagster::build-container-image
just dagster::push-container-image
just dagster::upgrade
```

**Project Structure**: Projects must follow naming conventions:

- Directory names: Use underscores only (e.g., `my_project`, not `my-project`)
- Python modules: Follow standard Python naming (snake_case)

**Authentication**: Dagster uses OAuth2 Proxy for Keycloak integration:

- During installation, OAuth2 authentication is automatically configured
- Access control through Keycloak groups and roles
- **Note**: All authenticated users share the same Dagster instance and workspace

> **⚠️ Multi-user Limitation**: Dagster OSS does not support individual user workspaces or role-based permissions within the application. All users authenticated through Keycloak will share the same Dagster instance and have access to all assets, jobs, and configurations. Use naming conventions and team coordination for shared usage.
>
> **💡 Development Workflow**: Create projects locally with `dagster project scaffold`, develop with local dependencies, then deploy to the cluster for execution. The shared PVC allows immediate access to deployed code.

Access Dagster at `https://dagster.yourdomain.com` and authenticate via Keycloak.

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
