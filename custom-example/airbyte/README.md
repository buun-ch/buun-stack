# Airbyte

Open-source data integration platform for building ELT pipelines.

> **Note**: Airbyte has been moved to the custom-example directory. It is no longer part of the core buun-stack but can be installed as an optional component.

## Features

- **600+ Connectors**: Pre-built connectors for databases, APIs, files, and SaaS applications
- **Change Data Capture (CDC)**: Real-time data replication with PostgreSQL logical replication
- **Schema Management**: Automatic schema detection and evolution handling
- **Incremental Sync**: Efficient data synchronization with deduplication
- **Storage Options**: Flexible storage with MinIO (S3-compatible) or local persistent volumes
- **OAuth2 Authentication**: Secure access through Keycloak via OAuth2 Proxy

## Installation

From the `custom-example/airbyte` directory:

```bash
# Copy to custom directory
cp -r custom-example/airbyte custom/

# Install using the copied version
just custom::airbyte::install
```

## PostgreSQL CDC Setup

Enable Change Data Capture for real-time data replication:

```bash
# Setup CDC with user tables only (recommended)
just postgres::setup-cdc <database> <slot_name> <publication_name> <username>

# Example for database 'mydb' with user 'etl_user'
just postgres::setup-cdc mydb airbyte_slot airbyte_pub etl_user
```

## Storage Configuration

- **MinIO**: S3-compatible object storage for scalable data staging
- **Local**: Persistent volumes with automatic Longhorn RWX detection

## Authentication

Airbyte OSS uses OAuth2 Proxy for Keycloak integration:

- During installation, optionally enable OAuth2 authentication
- Access control through Keycloak groups and roles
- **Note**: All authenticated users share the same internal Airbyte account (OSS limitation)

> **⚠️ Multi-user Limitation**: Airbyte OSS does not support individual user accounts or role-based permissions within the application. All users authenticated through Keycloak will share the same internal workspace and have access to all connections and configurations. Use naming conventions and team coordination for shared usage.

## Access

Access Airbyte at `https://airbyte.yourdomain.com` and authenticate via Keycloak (if OAuth2 is enabled).

## Common Operations

```bash
# Install Airbyte
just custom::airbyte::install

# Uninstall Airbyte
just custom::airbyte::uninstall

# Check status
just custom::airbyte::status
```

## Troubleshooting

- Check pod status: `kubectl get pods -n airbyte`
- View logs: `kubectl logs -n airbyte <pod-name>`
- Check ingress: `kubectl get ingress -n airbyte`