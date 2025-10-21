# buun-stack

A remotely accessible Kubernetes home lab with OIDC authentication. Build a modern development environment with integrated data analytics and AI capabilities. Includes an open data stack for data ingestion, transformation, serving, and orchestration—built on open-source components you can run locally and port to any cloud.

- 📺 [Remote-Accessible Kubernetes Home Lab](https://www.youtube.com/playlist?list=PLbAvvJK22Y6vJPrUC6GrfNMXneYspckAo) (YouTube playlist)
- 📝 [Building a Remote-Accessible Kubernetes Home Lab with k3s](https://dev.to/buun-ch/building-a-remote-accessible-kubernetes-home-lab-with-k3s-5g05) (Dev.to article)

## Architecture

### Foundation

- **[k3s](https://k3s.io/)**: Lightweight Kubernetes distribution
- **[Just](https://just.systems/)**: Task runner with templated configurations
- **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)**: Secure internet connectivity

### Core Components (Required)

- **[PostgreSQL](https://www.postgresql.org/)**: Database cluster with pgvector extension
- **[Keycloak](https://www.keycloak.org/)**: Identity and access management with OIDC authentication

### Recommended Components

- **[HashiCorp Vault](https://www.vaultproject.io/)**: Centralized secrets management
    - Used by most stack modules for secure credential storage
    - Can be deployed without, but highly recommended
- **[External Secrets Operator](https://external-secrets.io/)**: Kubernetes secret synchronization from Vault
    - Automatically syncs secrets from Vault to Kubernetes Secrets
    - Provides secure secret rotation and lifecycle management

### Storage (Optional)

- **[Longhorn](https://longhorn.io/)**: Distributed block storage
- **[MinIO](https://min.io/)**: S3-compatible object storage

### Data & Analytics (Optional)

- **[JupyterHub](https://jupyter.org/hub)**: Interactive computing with collaborative notebooks
- **[Trino](https://trino.io/)**: Distributed SQL query engine for querying multiple data sources
- **[Querybook](https://www.querybook.org/)**: Big data querying UI with notebook interface
- **[ClickHouse](https://clickhouse.com/)**: High-performance columnar analytics database
- **[Qdrant](https://qdrant.tech/)**: Vector database for AI/ML applications
- **[Lakekeeper](https://lakekeeper.io/)**: Apache Iceberg REST Catalog for data lake management
- **[Apache Superset](https://superset.apache.org/)**: BI platform with rich chart types and high customizability
- **[Metabase](https://www.metabase.com/)**: Lightweight BI with simple configuration and clean, modern interface
- **[DataHub](https://datahubproject.io/)**: Data catalog and metadata management

### Orchestration (Optional)

- **[Dagster](https://dagster.io/)**: Modern data orchestration platform
- **[Apache Airflow](https://airflow.apache.org/)**: Workflow orchestration and task scheduling

### Security (Optional)

- **[OAuth2 Proxy](https://oauth2-proxy.github.io/oauth2-proxy/)**: Authentication proxy for adding Keycloak authentication

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

Lightweight Kubernetes distribution optimized for edge computing:

- **Resource Efficient**: Runs on resource-constrained environments
- **Production Ready**: Full Kubernetes functionality with minimal overhead
- **Easy Deployment**: Single binary installation with built-in ingress

### Longhorn

Enterprise-grade distributed storage system:

- **Highly Available**: Block storage with no single point of failure
- **Backup & Recovery**: Built-in disaster recovery capabilities
- **NFS Support**: Persistent volumes with NFS compatibility

### HashiCorp Vault

Centralized secrets management:

- **Secure Storage**: Encrypted secret storage with access control
- **Dynamic Secrets**: Automatic credential generation and rotation
- **External Secrets Integration**: Syncs with Kubernetes via External Secrets Operator

### Keycloak

Open-source identity and access management:

- **Single Sign-On**: OIDC/OAuth2 authentication across all services
- **User Federation**: Identity brokering and external provider integration
- **Group-Based Access**: Role and permission management

### PostgreSQL

Production-ready relational database:

- **High Availability**: Clustered deployment with CloudNativePG
- **pgvector Extension**: Vector similarity search for AI/ML workloads
- **Multi-Tenant**: Shared database for Keycloak and applications

### External Secrets Operator

Kubernetes operator for secret synchronization:

- **Vault Integration**: Automatically syncs secrets from Vault to Kubernetes
- **Multiple Backends**: Supports various secret management systems
- **Secure Rotation**: Automatic secret lifecycle management

### MinIO

S3-compatible object storage:

- **S3 API**: Drop-in replacement for AWS S3
- **High Performance**: Distributed object storage with erasure coding
- **Multi-Tenancy**: Isolated storage buckets per application

### JupyterHub

Multi-user platform for interactive computing:

- **Keycloak Authentication**: OAuth2 integration with SSO
- **Persistent Storage**: User notebooks stored in Longhorn volumes
- **Collaborative**: Shared computing environment for teams

[📖 See JupyterHub Documentation](./jupyterhub/README.md)

### Apache Superset

Modern business intelligence platform:

- **Rich Visualizations**: 40+ chart types including mixed charts, treemaps, and heatmaps
- **SQL Lab**: Powerful editor for complex queries and dataset creation
- **Keycloak & Trino**: OAuth2 authentication and Iceberg data lake integration

[📖 See Superset Documentation](./superset/README.md)

### Metabase

Lightweight business intelligence:

- **Simple Setup**: Quick configuration with clean, modern UI
- **Multiple Databases**: Connect to PostgreSQL, Trino, and more
- **Keycloak Authentication**: OAuth2 integration for user management

[📖 See Metabase Documentation](./metabase/README.md)

### Querybook

Big data querying UI with notebook interface:

- **Trino Integration**: SQL queries against multiple data sources with user impersonation
- **Notebook Interface**: Shareable datadocs with queries and visualizations
- **Real-time Execution**: WebSocket-based query progress updates

[📖 See Querybook Documentation](./querybook/README.md)

### Trino

Fast distributed SQL query engine:

- **Multi-Source Queries**: Query PostgreSQL, Iceberg, and other sources in single query
- **Keycloak Authentication**: OAuth2 for Web UI, password auth for JDBC clients
- **Sample Data**: TPCH catalog with benchmark data for testing

[📖 See Trino Documentation](./trino/README.md)

### DataHub

Modern data catalog and metadata management:

- **OIDC Integration**: Keycloak authentication for unified access
- **Metadata Discovery**: Search and browse data assets across platforms
- **Lineage Tracking**: Visualize data flow and dependencies

[📖 See DataHub Documentation](./datahub/README.md)

### ClickHouse

High-performance columnar OLAP database:

- **Fast Analytics**: Optimized for analytical queries on large datasets
- **Compression**: Efficient storage with columnar format
- **Real-time Ingestion**: Stream data from Kafka and other sources

[📖 See ClickHouse Documentation](./clickhouse/README.md)

### Qdrant

High-performance vector database:

- **Similarity Search**: Fast vector search for AI/ML applications
- **Rich Filtering**: Combine vector search with structured filters
- **Scalable**: Distributed deployment for large-scale embeddings

[📖 See Qdrant Documentation](./qdrant/README.md)

### Lakekeeper

Apache Iceberg REST Catalog:

- **OIDC Authentication**: Keycloak integration for secure access
- **Table Management**: Manages Iceberg tables with ACID transactions
- **Multi-Engine**: Compatible with Trino, Spark, and other query engines

[📖 See Lakekeeper Documentation](./lakekeeper/README.md)

### Apache Airflow

Workflow orchestration platform:

- **DAG-Based**: Define data pipelines as code with Python
- **JupyterHub Integration**: Develop and test workflows in notebooks
- **Keycloak Authentication**: OAuth2 for user management

[📖 See Airflow Documentation](./airflow/README.md)

### Dagster

Modern data orchestration platform:

- **Asset-Centric**: Define data assets and their dependencies
- **Integrated Development**: Built-in UI for development and monitoring
- **Testing & Validation**: Data quality checks and pipeline testing

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
# Trino: https://trino.yourdomain.com
# Querybook: https://querybook.yourdomain.com
# Superset: https://superset.yourdomain.com
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

## Demo Projects

The following demo projects showcase end-to-end data workflows using buun-stack:

### Salesforce to Iceberg REST Catalog

[**dlt-salesforce-iceberg-rest-demo**](https://github.com/buun-ch/dlt-salesforce-iceberg-rest-demo)

Demonstrates Salesforce data ingestion into an Iceberg data lake:

- **dlt** extracts data from Salesforce API (Account, Contact, Opportunity, etc.)
- **Custom Iceberg destination** loads data into Lakekeeper REST Catalog
- **Automatic schema conversion** from dlt to Iceberg with PyArrow
- **Orchestration** with Dagster or Apache Airflow
- **Query** with Trino and visualize in Superset/Metabase

Key technologies: dlt, PyIceberg, Lakekeeper, Trino, MinIO

### E-commerce Lakehouse Analytics

[**payload-ecommerce-lakehouse-demo**](https://github.com/buun-ch/payload-ecommerce-lakehouse-demo)

Full-stack e-commerce application with integrated lakehouse analytics:

- **Next.js + Payload CMS** for e-commerce application
- **dlt** ingests data incrementally from Payload API to Iceberg
- **dbt** transforms raw data into analytics-ready star schema
- **Trino** queries across all data layers (raw, staging, marts)
- **Superset/Metabase** for dashboards and business intelligence

Key technologies: Next.js, Payload CMS, dlt, dbt, Iceberg, Trino, Superset, PostgreSQL

Both projects demonstrate the medallion architecture (raw → staging → marts) and showcase how buun-stack components work together for production data workflows.

## Troubleshooting

- Check logs: `kubectl logs -n <namespace> <pod-name>`

## License

MIT License - See LICENSE file for details
