# Trino

Fast distributed SQL query engine for big data analytics with Keycloak authentication.

## Overview

This module deploys Trino using the official Helm chart with:

- **Keycloak OAuth2 authentication** for Web UI access
- **Password authentication** for JDBC clients (Metabase, etc.)
- **PostgreSQL catalog** for querying PostgreSQL databases
- **Iceberg catalog** with Lakekeeper (optional)
- **TPCH catalog** with sample data for testing

## Prerequisites

- Kubernetes cluster (k3s)
- Keycloak installed and configured
- PostgreSQL cluster (CloudNativePG)
- MinIO (optional, for Iceberg catalog)
- External Secrets Operator (optional, for Vault integration)

## Installation

### Basic Installation

```bash
just trino::install
```

You will be prompted for:

1. **Trino host (FQDN)**: e.g., `trino.example.com`
2. **PostgreSQL catalog setup**: Recommended for production use
3. **MinIO storage setup**: Optional, for Iceberg/Hive catalogs

### What Gets Installed

- Trino coordinator (1 instance)
- Trino workers (2 instances by default)
- OAuth2 client in Keycloak
- Password authentication for JDBC access
- PostgreSQL catalog (if selected)
- Iceberg catalog with Lakekeeper (if MinIO selected)
- TPCH catalog with sample data

## Configuration

Environment variables (set in `.env.local` or override):

```bash
TRINO_NAMESPACE=trino                   # Kubernetes namespace
TRINO_CHART_VERSION=1.41.0              # Helm chart version
TRINO_IMAGE_TAG=477                     # Trino version
TRINO_COORDINATOR_MEMORY=4Gi            # Coordinator memory
TRINO_COORDINATOR_CPU=2                 # Coordinator CPU
TRINO_WORKER_MEMORY=4Gi                 # Worker memory
TRINO_WORKER_CPU=2                      # Worker CPU
TRINO_WORKER_COUNT=2                    # Number of workers
```

## Usage

### Web UI Access

1. Navigate to `https://your-trino-host/`
2. Click "Sign in" to authenticate with Keycloak
3. Execute queries in the Web UI

### Get Admin Password

For JDBC/Metabase connections:

```bash
just trino::admin-password
```

Returns the password for username `admin`.

### Metabase Integration

**Important**: Trino requires TLS/SSL for password authentication. You must use the external hostname (not the internal Kubernetes service name).

1. In Metabase, go to Admin → Databases → Add database
2. Select **Database type**: Starburst
3. Configure connection:

    ```plain
    Host: your-trino-host (e.g., trino.example.com)
    Port: 443
    Username: admin
    Password: [from just trino::admin-password]
    Catalog: postgresql
    SSL: Yes
    ```

**Note**: Do NOT use internal Kubernetes hostnames like `trino.trino.svc.cluster.local` as they do not have valid TLS certificates for password authentication.

### Example Queries

**Query TPCH sample data:**

```sql
SELECT * FROM tpch.tiny.customer LIMIT 10;
```

**Query PostgreSQL:**

```sql
SELECT * FROM postgresql.public.pg_tables;
```

**Show all catalogs:**

```sql
SHOW CATALOGS;
```

**Show schemas in a catalog:**

```sql
SHOW SCHEMAS FROM postgresql;
```

## Catalogs

### TPCH (Always Available)

Sample TPC-H benchmark data for testing:

- `tpch.tiny.*` - Small dataset
- `tpch.sf1.*` - 1GB dataset

Tables: customer, orders, lineitem, part, supplier, nation, region

### PostgreSQL

Queries your CloudNativePG cluster:

- Catalog: `postgresql`
- Default schema: `public`
- Database: `trino`

### Iceberg (Optional)

Queries Iceberg tables via Lakekeeper:

- Catalog: `iceberg`
- Storage: MinIO S3-compatible

## Management

### Upgrade Trino

```bash
just trino::upgrade
```

Updates the Helm deployment with current configuration.

### Uninstall

```bash
# Keep PostgreSQL database
just trino::uninstall false

# Delete PostgreSQL database too
just trino::uninstall true
```

### Cleanup All Resources

```bash
just trino::cleanup
```

Removes:

- PostgreSQL database
- Vault secrets
- Keycloak OAuth client

## Authentication

### Web UI (OAuth2)

- Uses Keycloak for authentication
- Requires valid user in the configured realm
- Automatic redirect to Keycloak login

### JDBC/Metabase (Password)

- Username: `admin`
- Password: Retrieved via `just trino::admin-password`
- Stored in Vault at `trino/password`

## Architecture

```
External Users
      ↓
Cloudflare Tunnel (HTTPS)
      ↓
Traefik Ingress
      ↓
Trino Coordinator (HTTP:8080)
      ↓
Trino Workers (HTTP:8080)
      ↓
Data Sources:
  - PostgreSQL (CloudNativePG)
  - MinIO (S3)
  - Iceberg (Lakekeeper)
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n trino
```

### View Coordinator Logs

```bash
kubectl logs -n trino -l app.kubernetes.io/component=coordinator --tail=100
```

### View Worker Logs

```bash
kubectl logs -n trino -l app.kubernetes.io/component=worker --tail=100
```

### Test Authentication

```bash
# From inside coordinator pod
kubectl exec -n trino deployment/trino-coordinator -- \
  curl -u admin:PASSWORD http://localhost:8080/v1/info
```

### Common Issues

#### Metabase Sync Fails

- Ensure catalog is specified in connection settings (e.g., `postgresql`)
- Check Trino coordinator logs for errors
- Verify PostgreSQL/Iceberg connectivity

#### OAuth2 Login Fails

- Verify Keycloak OAuth client exists: `just keycloak::list-clients`
- Check redirect URL matches Trino host
- Ensure Keycloak is accessible from Trino pods

#### Password Authentication Fails

- Retrieve current password: `just trino::admin-password`
- Ensure SSL/TLS is enabled in JDBC URL
- For internal testing, HTTP is supported via `http-server.authentication.allow-insecure-over-http=true`

## References

- [Trino Documentation](https://trino.io/docs/current/)
- [Trino Helm Chart](https://github.com/trinodb/charts)
- [OAuth2 Authentication](https://trino.io/docs/current/security/oauth2.html)
- [Password Authentication](https://trino.io/docs/current/security/password-file.html)
- [PostgreSQL Connector](https://trino.io/docs/current/connector/postgresql.html)
- [Iceberg Connector](https://trino.io/docs/current/connector/iceberg.html)
