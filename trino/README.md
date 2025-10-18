# Trino

Fast distributed SQL query engine for big data analytics with Keycloak authentication.

## Overview

This module deploys Trino using the official Helm chart with:

- **Keycloak OAuth2 authentication** for Web UI access
- **Password authentication** for JDBC clients (Metabase, Querybook, etc.)
- **Access control with user impersonation** for multi-user query attribution
- **PostgreSQL catalog** for querying PostgreSQL databases
- **Iceberg catalog** with Lakekeeper (optional)
- **TPCH catalog** with sample data for testing
- **Traefik integration** with proper header forwarding

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
- Password authentication for JDBC/Querybook access
- Traefik Middleware for X-Forwarded-* header injection
- Access control with impersonation rules (admin can impersonate any user)
- PostgreSQL catalog (if selected)
- Iceberg catalog with Lakekeeper (if MinIO selected)
    - Keycloak service account enabled for OAuth2 client credentials flow
    - `lakekeeper` client scope added
    - `lakekeeper` audience mapper configured
- TPCH catalog with sample data

**Note**: Trino runs HTTP-only internally. HTTPS is provided by Traefik Ingress, which handles TLS termination.

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

**Note**: OAuth2 authentication works over HTTP internally. Traefik Ingress provides HTTPS to external users, and Trino processes X-Forwarded headers to generate correct HTTPS redirect URLs for OAuth2 flow.

### Get Admin Password

For JDBC/Metabase connections:

```bash
just trino::admin-password
```

Returns the password for username `admin`.

### Metabase Integration

**Important**: The Python Trino client (used by Metabase) requires HTTPS when using authentication. You must use the external hostname which has TLS provided by Traefik Ingress.

1. In Metabase, go to Admin → Databases → Add database
2. Select **Database type**: Starburst
3. Configure connection:

    ```plain
    Host: your-trino-host (e.g., trino.example.com)
    Port: 443
    Username: admin
    Password: [from just trino::admin-password]
    Catalog: postgresql  (or iceberg for Iceberg tables)
    SSL: Yes
    ```

**Catalog Selection**:

- Use `postgresql` to query PostgreSQL database tables
- Use `iceberg` to query Iceberg tables via Lakekeeper
- You can create multiple Metabase connections, one for each catalog

**Note**: Do NOT use internal Kubernetes hostnames like `trino.trino.svc.cluster.local:8080`. Internal services do not have TLS, and the Python Trino client enforces HTTPS when authentication is used. Always use the external hostname with port 443.

### Querybook Integration

**Connection Configuration**:

1. In Querybook, create a new Environment and Query Engine
2. Configure the Trino connection:

    ```plain
    Connection String: trino://your-trino-host:443?SSL=true
    Username: admin
    Password: [from just trino::admin-password]
    Catalog: postgresql  (or iceberg for Iceberg tables)
    ```

3. Optional: Configure `Proxy_user_id` to enable user impersonation

**User Impersonation**:

Trino is configured with file-based access control that allows the `admin` user to impersonate any user. This enables:

- Querybook to connect as `admin` but execute queries as the logged-in Querybook user
- Proper query attribution and audit logging
- User-specific access control (when configured)

The impersonation rules are defined in `trino-values.gomplate.yaml`:

```json
{
  "catalogs": [{"allow": "all"}],
  "impersonation": [
    {
      "original_user": "admin",
      "new_user": ".*"
    }
  ]
}
```

**Why External Hostname is Required**:

- The Python Trino client enforces HTTPS when authentication is used (client-side requirement)
- Trino runs HTTP-only internally; TLS is provided by Traefik Ingress
- Internal service names (e.g., `trino.trino.svc.cluster.local:8080`) do not have TLS termination
- Therefore, you must use the external hostname (e.g., `trino.example.com:443`) which has TLS from Traefik

### Example Queries

**Query TPCH sample data:**

```sql
SELECT * FROM tpch.tiny.customer LIMIT 10;
```

**Query PostgreSQL:**

```sql
SELECT * FROM postgresql.public.pg_tables;
```

**Query Iceberg tables:**

```sql
-- Show schemas in Iceberg catalog
SHOW SCHEMAS FROM iceberg;

-- Show tables in a namespace
SHOW TABLES FROM iceberg.ecommerce;

-- Query Iceberg table
SELECT * FROM iceberg.ecommerce.products LIMIT 10;
```

**Show all catalogs:**

```sql
SHOW CATALOGS;
```

**Show schemas in a catalog:**

```sql
SHOW SCHEMAS FROM postgresql;
SHOW SCHEMAS FROM iceberg;
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

Queries Iceberg tables via Lakekeeper REST Catalog:

- **Catalog**: `iceberg`
- **Storage**: MinIO S3-compatible object storage
- **REST Catalog**: Lakekeeper (Apache Iceberg REST Catalog implementation)
- **Authentication**: OAuth2 client credentials flow with Keycloak

**How It Works**:

1. Trino authenticates to Lakekeeper using OAuth2 (client credentials flow)
2. Lakekeeper provides Iceberg table metadata from its catalog
3. Trino reads actual data files directly from MinIO using static S3 credentials
4. Vended credentials are disabled; Trino uses pre-configured MinIO access keys

**Configuration**:

The following settings are automatically configured during installation when MinIO storage is enabled:

- Service account enabled on Trino Keycloak client
- `lakekeeper` client scope added to Trino client
- Audience mapper configured to include `aud: lakekeeper` in JWT tokens
- S3 file system factory enabled (`fs.native-s3.enabled=true`)
- Static MinIO credentials provided via Kubernetes secrets

**Example Usage**:

```sql
-- List all namespaces (schemas)
SHOW SCHEMAS FROM iceberg;

-- Create a namespace
CREATE SCHEMA iceberg.analytics;

-- List tables in a namespace
SHOW TABLES FROM iceberg.ecommerce;

-- Query table
SELECT * FROM iceberg.ecommerce.products LIMIT 10;

-- Create table
CREATE TABLE iceberg.analytics.sales (
    date DATE,
    product VARCHAR,
    amount DECIMAL(10,2)
);
```

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

### JDBC/Metabase/Querybook (Password)

- Username: `admin`
- Password: Retrieved via `just trino::admin-password`
- Stored in Vault at `trino/password`
- Requires external hostname with SSL/TLS

### Access Control

Trino uses file-based system access control with the following configuration:

**Catalogs**: All users can access all catalogs

**Impersonation**: The `admin` user can impersonate any user

This configuration enables:

- **Querybook Integration**: Admin user connects and executes queries as logged-in users
- **Audit Logging**: Queries are attributed to the actual user, not the admin account
- **Future Access Control**: Can be extended to add user-specific catalog/schema restrictions

The access control rules are defined in `/etc/trino/access-control/rules.json` (automatically generated from Helm values).

## Architecture

```
External Users / Querybook
      ↓
Cloudflare Tunnel (HTTPS)
      ↓
Traefik Ingress (HTTPS → HTTP)
      ├─ TLS Termination
      ├─ Traefik Middleware (X-Forwarded-* headers)
      └─ Backend: HTTP (port 8080)
      ↓
Trino Coordinator (HTTP:8080)
      ├─ OAuth2 → Keycloak (Web UI auth)
      ├─ Password file (JDBC/Querybook auth)
      └─ Access Control (file-based, impersonation rules)
      ↓
Trino Workers (HTTP:8080)
      ↓
Data Sources:
  - PostgreSQL (CloudNativePG)
    └─ Direct SQL connection

  - Iceberg Tables
    ├─ Metadata: Lakekeeper (REST Catalog)
    │   └─ OAuth2 → Keycloak (client credentials)
    └─ Data: MinIO (S3)
        └─ Static credentials
```

**Key Components**:

- **TLS Termination**: Traefik Ingress handles HTTPS, Trino runs HTTP-only internally
- **Traefik Middleware**: Injects X-Forwarded-Proto, X-Forwarded-Host, X-Forwarded-Port headers for correct URL generation
- **Single Port Configuration**: HTTP (8080) for all communication (Ingress backend, internal clients, Querybook)
- **Access Control**: File-based system with impersonation rules allowing `admin` to impersonate any user
- **Querybook Integration**: Connects via external HTTPS hostname (Traefik provides TLS), uses admin credentials with user impersonation

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

#### Querybook Connection Fails

- **Error: "cannot use authentication with HTTP"**
  - Python Trino client requires HTTPS when using authentication (client-side enforcement)
  - Trino runs HTTP-only internally; TLS is provided by Traefik Ingress at the external hostname
  - Solution: Use external hostname with SSL: `trino://your-trino-host:443?SSL=true`
  - Do NOT use internal service names (e.g., `trino.trino.svc.cluster.local:8080`) as they lack TLS

- **Error: "Access Denied: User admin cannot impersonate user X"**
  - Access control rules may not be properly configured
  - Verify rules exist: `kubectl exec -n trino deployment/trino-coordinator -- cat /etc/trino/access-control/rules.json`
  - Check for impersonation section in rules

- **Error: "500 Internal Server Error"**
  - Check Traefik middleware exists: `kubectl get middleware trino-headers -n trino`
  - Verify Ingress annotation references correct middleware: `trino-trino-headers@kubernetescrd`
  - Check Traefik logs: `kubectl logs -n kube-system -l app.kubernetes.io/name=traefik`
  - Verify Ingress backend port is 8080: `kubectl get ingress trino-coordinator -n trino -o yaml | grep "number:"`
  - If Ingress shows port 8443, ensure `server.config.https.enabled: false` in values (Helm chart v1.41.0 auto-selects HTTPS port when enabled)

#### Metabase Sync Fails

- Ensure catalog is specified in connection settings (e.g., `postgresql` or `iceberg`)
- For Iceberg catalog, verify Lakekeeper is running: `kubectl get pods -n lakekeeper`
- Check Trino coordinator logs for errors
- Verify PostgreSQL/Iceberg connectivity
- For Iceberg issues, check OAuth2 token: Service account should be enabled on Trino client

#### OAuth2 Login Fails

- Verify Keycloak OAuth client exists: `just keycloak::list-clients`
- Check redirect URL matches Trino host
- Ensure Keycloak is accessible from Trino pods

#### Password Authentication Fails

- Retrieve current password: `just trino::admin-password`
- Ensure SSL/TLS is enabled in JDBC URL (use external hostname with port 443)
- Python Trino client requires HTTPS for authentication (client-side enforcement)
- Trino coordinator allows password auth over HTTP via `http-server.authentication.allow-insecure-over-http=true`, but clients may refuse to connect without TLS

#### URLs Contain "localhost" Instead of Actual Hostname

- Traefik middleware is not injecting X-Forwarded headers
- Verify middleware exists and is referenced in Ingress annotations
- Check `http-server.process-forwarded=true` is set in Trino configuration

## References

- [Trino Documentation](https://trino.io/docs/current/)
- [Trino Helm Chart](https://github.com/trinodb/charts)
- [OAuth2 Authentication](https://trino.io/docs/current/security/oauth2.html)
- [Password Authentication](https://trino.io/docs/current/security/password-file.html)
- [PostgreSQL Connector](https://trino.io/docs/current/connector/postgresql.html)
- [Iceberg Connector](https://trino.io/docs/current/connector/iceberg.html)
- [Lakekeeper (Iceberg REST Catalog)](https://lakekeeper.io/)
- [Apache Iceberg](https://iceberg.apache.org/)
