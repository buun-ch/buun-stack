# Apache Superset

Modern, enterprise-ready business intelligence web application with Keycloak OAuth authentication and Trino integration.

## Overview

This module deploys Apache Superset using the official Helm chart with:

- **Keycloak OAuth authentication** for user login
- **Trino integration** for data lake analytics
- **PostgreSQL backend** for metadata storage (dedicated user)
- **Redis** for caching and Celery task queue
- **HTTPS reverse proxy support** via Traefik
- **Group-based access control** via Keycloak groups

## Prerequisites

- Kubernetes cluster (k3s)
- Keycloak installed and configured
- PostgreSQL cluster (CloudNativePG)
- Trino with password authentication
- External Secrets Operator (optional, for Vault integration)

## Installation

### Basic Installation

```bash
just superset::install
```

You will be prompted for:

1. **Superset host (FQDN)**: e.g., `superset.example.com`
2. **Keycloak host (FQDN)**: e.g., `auth.example.com`

### What Gets Installed

- Superset web application
- Superset worker (Celery for async tasks)
- PostgreSQL database and user for Superset metadata
- Redis for caching and Celery broker
- Keycloak OAuth client (confidential client)
- `superset-admin` group in Keycloak for admin access

## Configuration

Environment variables (set in `.env.local` or override):

```bash
SUPERSET_NAMESPACE=superset              # Kubernetes namespace
SUPERSET_CHART_VERSION=0.15.0            # Helm chart version
SUPERSET_HOST=superset.example.com       # External hostname
KEYCLOAK_HOST=auth.example.com           # Keycloak hostname
KEYCLOAK_REALM=buunstack                 # Keycloak realm name
```

### Architecture Notes

**Superset 5.0+ Changes**:

- Uses `uv` instead of `pip` for package management
- Lean base image without database drivers (installed via bootstrapScript)
- Required packages: `psycopg2-binary`, `sqlalchemy-trino`, `authlib`

**Redis Image**:

- Uses `bitnami/redis:latest` due to Bitnami's August 2025 strategy change
- Community users can only use `latest` tag (no version pinning)
- For production version pinning, consider using official Redis image separately

## Usage

### Access Superset

1. Navigate to `https://your-superset-host/`
2. Click "Sign in with Keycloak" to authenticate
3. Create charts and dashboards

### Grant Admin Access

Add users to the `superset-admin` group:

```bash
just keycloak::add-user-to-group <username> superset-admin
```

Admin users have full privileges including:

- Database connection management
- User and role management
- All chart and dashboard operations

### Configure Database Connections

**Prerequisites**: User must be in `superset-admin` group

#### Trino Connection

1. Log in as an admin user
2. Navigate to **Settings** → **Database Connections** → **+ Database**
3. Select **Trino** from supported databases
4. Configure connection:

   ```plain
   DISPLAY NAME: Trino Iceberg (or any name)
   SQLALCHEMY URI: trino://admin:<password>@trino.example.com/iceberg
   ```

   **Important Notes**:
   - **Must use HTTPS hostname** (e.g., `trino.example.com`)
   - **Cannot use internal service** (e.g., `trino.trino:8080`)
   - Trino password authentication requires HTTPS connection
   - Get admin password: `just trino::admin-password`

5. Click **TEST CONNECTION** to verify
6. Click **CONNECT** to save

**Available Trino Catalogs**:

- `iceberg` - Iceberg data lakehouse (Lakekeeper)
- `postgresql` - PostgreSQL connector
- `tpch` - TPC-H benchmark data

Example URIs:

```plain
trino://admin:<password>@trino.example.com/iceberg
trino://admin:<password>@trino.example.com/postgresql
trino://admin:<password>@trino.example.com/tpch
```

#### Other Database Connections

Superset supports many databases. Examples:

**PostgreSQL**:

```plain
postgresql://user:password@postgres-cluster-rw.postgres:5432/database
```

**MySQL**:

```plain
mysql://user:password@mysql-host:3306/database
```

### Create Charts and Dashboards

1. Navigate to **Charts** → **+ Chart**
2. Select dataset (from configured database)
3. Choose visualization type
4. Configure chart settings
5. Save chart
6. Add to dashboard

## Features

- **Rich Visualizations**: 40+ chart types including tables, line charts, bar charts, maps, etc.
- **SQL Lab**: Interactive SQL editor with query history
- **No-code Chart Builder**: Drag-and-drop interface for creating charts
- **Dashboard Composer**: Create interactive dashboards with filters
- **Row-level Security**: Control data access per user/role
- **Alerting & Reports**: Schedule email reports and alerts
- **Semantic Layer**: Define metrics and dimensions for consistent analysis

## Architecture

```plain
External Users
      ↓
Cloudflare Tunnel (HTTPS)
      ↓
Traefik Ingress (HTTPS)
      ↓
Superset Web (HTTP inside cluster)
      ├─ OAuth → Keycloak (authentication)
      ├─ PostgreSQL (metadata: charts, dashboards, users)
      ├─ Redis (cache, Celery broker)
      └─ Celery Worker (async tasks)
      ↓
Data Sources (via HTTPS)
      ├─ Trino (analytics)
      ├─ PostgreSQL (operational data)
      └─ Others
```

**Key Components**:

- **Proxy Fix**: `ENABLE_PROXY_FIX = True` for correct HTTPS redirect URLs behind Traefik
- **OAuth Integration**: Uses Keycloak OIDC discovery (`.well-known/openid-configuration`)
- **Database Connections**: Must use external HTTPS hostnames for authenticated connections
- **Role Mapping**: Keycloak groups map to Superset roles (Admin, Alpha, Gamma)

## Authentication

### User Login (OAuth)

- Users authenticate via Keycloak
- Standard OIDC flow with Authorization Code grant
- Group membership included in UserInfo endpoint response
- Roles synced at each login (`AUTH_ROLES_SYNC_AT_LOGIN = True`)

### Role Mapping

Keycloak groups automatically map to Superset roles:

```python
AUTH_ROLES_MAPPING = {
    "superset-admin": ["Admin"],  # Full privileges
    "Alpha": ["Alpha"],            # Create charts/dashboards
    "Gamma": ["Gamma"],            # View only
}
```

**Default Role**: New users are assigned `Gamma` role by default

### Access Levels

- **Admin**: Full access to all features (requires `superset-admin` group)
- **Alpha**: Create and edit charts/dashboards
- **Gamma**: View charts and dashboards only

## Management

### Upgrade Superset

```bash
just superset::upgrade
```

Updates the Helm deployment with current configuration.

### Uninstall

```bash
# Keep PostgreSQL database
just superset::uninstall false

# Delete PostgreSQL database and user
just superset::uninstall true
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n superset
```

Expected pods:

- `superset-*` - Main application (1 replica)
- `superset-worker-*` - Celery worker (1 replica)
- `superset-redis-master-*` - Redis cache
- `superset-init-db-*` - Database initialization (Completed)

### OAuth Login Fails with "Invalid parameter: redirect_uri"

**Error**: Redirect URI uses `http://` instead of `https://`

**Solution**: Ensure proxy configuration is enabled in `configOverrides`:

```python
ENABLE_PROXY_FIX = True
PREFERRED_URL_SCHEME = "https"
```

### OAuth Login Fails with "The request to sign in was denied"

**Error**: `Missing "jwks_uri" in metadata`

**Solution**: Ensure `server_metadata_url` is configured in OAuth provider:

```python
"server_metadata_url": f"https://{KEYCLOAK_HOST}/realms/{REALM}/.well-known/openid-configuration"
```

### Database Connection Test Fails

#### Trino: "Password not allowed for insecure authentication"

- Must use external HTTPS hostname (e.g., `trino.example.com`)
- Cannot use internal service name (e.g., `trino.trino:8080`)
- Trino enforces HTTPS for password authentication

#### Trino: "error 401: Basic authentication required"

- Missing username in SQLAlchemy URI
- Format: `trino://username:password@host:port/catalog`

### Database Connection Not Available

- Only users in `superset-admin` Keycloak group can add databases
- Add user to group: `just keycloak::add-user-to-group <user> superset-admin`
- Logout and login again to sync roles

### Worker Pod Crashes

Check worker logs:

```bash
kubectl logs -n superset deployment/superset-worker
```

Common issues:

- Redis connection failed (check Redis pod status)
- PostgreSQL connection failed (check database credentials)
- Missing Python packages (check bootstrapScript execution)

### Package Installation Issues

Superset 5.0+ uses `uv` for package management. Check bootstrap logs:

```bash
kubectl logs -n superset deployment/superset -c superset | grep "uv pip install"
```

Expected packages:

- `psycopg2-binary` - PostgreSQL driver
- `sqlalchemy-trino` - Trino driver
- `authlib` - OAuth library

### Chart/Dashboard Not Loading

- Check browser console for errors
- Verify database connection is active: Settings → Database Connections
- Test query in SQL Lab first
- Check Superset logs for errors

### "Unable to migrate query editor state to backend" Error

**Symptom**: Repeated error message in SQL Lab:

```plain
Unable to migrate query editor state to backend. Superset will retry later.
Please contact your administrator if this problem persists.
```

**Root Cause**: Known Apache Superset bug ([#30351](https://github.com/apache/superset/issues/30351), [#33423](https://github.com/apache/superset/issues/33423)) where `/tabstateview/` endpoint returns HTTP 400 errors. Multiple underlying causes:

- Missing `dbId` in query editor state (KeyError)
- Foreign key constraint violations in `tab_state` table
- Missing PostgreSQL development tools in container images

**Solution**: Disable SQL Lab backend persistence in `configOverrides`:

```python
# Disable SQL Lab backend persistence to avoid tab state migration errors
SQLLAB_BACKEND_PERSISTENCE = False
```

**Impact**:

- Query editor state stored in browser local storage only (not in database)
- Browser cache clear may lose unsaved queries
- Use "Saved Queries" feature for important queries
- This configuration is already applied in this deployment

## References

- [Apache Superset Documentation](https://superset.apache.org/docs/)
- [Superset GitHub](https://github.com/apache/superset)
- [Superset Helm Chart](https://github.com/apache/superset/tree/master/helm/superset)
- [Trino Integration](../trino/README.md)
- [Keycloak OAuth](https://www.keycloak.org/docs/latest/securing_apps/#_oidc)
