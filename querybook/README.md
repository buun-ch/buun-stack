# Querybook

Pinterest's big data querying UI with notebook interface, Keycloak OAuth authentication, and Trino integration.

## Overview

This module deploys Querybook using the official Helm chart from Pinterest with:

- **Keycloak OAuth2 authentication** for user login
- **Trino integration** with user impersonation for query attribution
- **PostgreSQL backend** for metadata storage
- **Redis** for caching and session management
- **Traefik integration** with WebSocket support for real-time query execution
- **Group-based admin access** via Keycloak groups

## Prerequisites

- Kubernetes cluster (k3s)
- Keycloak installed and configured
- PostgreSQL cluster (CloudNativePG)
- Trino with access control configured
- External Secrets Operator (optional, for Vault integration)

## Installation

### Basic Installation

```bash
just querybook::install
```

You will be prompted for:

1. **Querybook host (FQDN)**: e.g., `querybook.example.com`
2. **Keycloak host (FQDN)**: e.g., `auth.example.com`

### What Gets Installed

- Querybook web service
- Querybook scheduler (background jobs)
- Querybook workers (query execution)
- PostgreSQL database for Querybook metadata
- Redis for caching and sessions
- Keycloak OAuth2 client (confidential client)
- `querybook-admin` group in Keycloak for admin access
- Traefik Middleware for WebSocket and header forwarding

## Configuration

Environment variables (set in `.env.local` or override):

```bash
QUERYBOOK_NAMESPACE=querybook          # Kubernetes namespace
QUERYBOOK_HOST=querybook.example.com   # External hostname
KEYCLOAK_HOST=auth.example.com         # Keycloak hostname
KEYCLOAK_REALM=buunstack               # Keycloak realm name

# Optional: Use custom Docker image (for testing fixes/patches)
QUERYBOOK_CUSTOM_IMAGE=localhost:30500/querybook        # Custom image repository
QUERYBOOK_CUSTOM_IMAGE_TAG=buun-stack                   # Custom image tag (default: latest)
QUERYBOOK_CUSTOM_IMAGE_PULL_POLICY=Always               # Image pull policy (default: Always)
```

### Using Custom Image

To use a custom Querybook image (e.g., with patches or fixes):

```bash
# Set environment variables
export QUERYBOOK_CUSTOM_IMAGE=localhost:30500/querybook
export QUERYBOOK_CUSTOM_IMAGE_TAG=buun-stack

# Install or upgrade Querybook
just querybook::install
# or
just querybook::upgrade
```

**When to use custom image**:

- Testing bug fixes before they are merged upstream
- Applying patches for specific issues (e.g., WebSocket disconnect errors)
- Using modified versions with custom features

**Custom image includes** (`buun-stack` tag):

- Fix for WebSocket disconnect handler (python-socketio 5.12.0+ compatibility)
- Fix for datetime serialization in WebSocket emit
- Trino 0.336.0 upgrade with Metastore support (table autocomplete, schema browser)

**Custom image behavior** (when `QUERYBOOK_CUSTOM_IMAGE` is set):

- Pull policy: `Always` (default, override with `QUERYBOOK_CUSTOM_IMAGE_PULL_POLICY`)
- Ensures latest image is always pulled from registry

**Default behavior** (when `QUERYBOOK_CUSTOM_IMAGE` is not set):

- Uses official image: `querybook/querybook:latest`
- Pull policy: `IfNotPresent`
- Note: Official image may encounter WebSocket disconnect errors with python-socketio 5.12.0+

### Building Custom Image

To build a custom Querybook image with bug fixes and Metastore support:

1. **Clone Querybook repository**:

    ```bash
    git clone https://github.com/pinterest/querybook.git
    cd querybook
    ```

2. **Apply bug fix patch**:

    ```bash
    # Copy patch file from buun-stack repository
    # cp /path/to/buun-stack/querybook/querybook-fixes.diff .

    # Apply the patch
    git apply querybook-fixes.diff
    ```

    **Patch includes**:
    - Fix for WebSocket disconnect handler (python-socketio 5.12.0+ compatibility)
    - Fix for datetime serialization in WebSocket emit
    - Trino 0.336.0 upgrade with TrinoCursor.poll() compatibility fix
    - sqlalchemy-trino 0.5.0 for Metastore support

3. **Build the Docker image**:

    ```bash
    # For remote Docker host (e.g., k3s node)
    DOCKER_HOST=ssh://yourdomain.com docker build \
        --no-cache \
        --build-arg EXTRA_PIP_INSTALLS=extra.txt \
        -t localhost:30500/querybook:buun-stack .

    # For local Docker
    docker build \
        --no-cache \
        --build-arg EXTRA_PIP_INSTALLS=extra.txt \
        -t localhost:30500/querybook:buun-stack .
    ```

    **Important**: Use `--no-cache` to ensure pip installs the correct package versions. Docker layer caching can cause pip to reuse old dependency resolutions.

4. **Push to registry**:

    ```bash
    DOCKER_HOST=ssh://yourdomain.com docker push localhost:30500/querybook:buun-stack
    # or for local Docker
    docker push localhost:30500/querybook:buun-stack
    ```

5. **Deploy to Kubernetes**:

    ```bash
    export QUERYBOOK_CUSTOM_IMAGE=localhost:30500/querybook
    export QUERYBOOK_CUSTOM_IMAGE_TAG=buun-stack
    just querybook::upgrade
    ```

6. **Restart Pods to use new image**:

    ```bash
    # Delete all Querybook pods to force image pull
    kubectl delete pod -n querybook -l app=querybook

    # Wait for pods to be ready
    kubectl wait --for=condition=ready pod -l app=querybook -n querybook --timeout=120s

    # Verify trino version and sqlalchemy-trino is installed
    kubectl exec -n querybook deployment/worker -- pip show trino | grep -E "Name:|Version:"
    kubectl exec -n querybook deployment/worker -- pip show sqlalchemy-trino | grep -E "Name:|Version:"
    ```

    Expected output:

    ```
    Name: trino
    Version: 0.336.0
    Name: sqlalchemy-trino
    Version: 0.5.0
    ```

**Notes**:

- `EXTRA_PIP_INSTALLS=extra.txt` ensures all query engines (Trino, BigQuery, Snowflake, etc.) are installed
- Metastore features are fully enabled with trino 0.336.0 and sqlalchemy-trino 0.5.0

## Usage

### Access Querybook

1. Navigate to `https://your-querybook-host/`
2. Click "Login with OAuth" to authenticate with Keycloak
3. Create datadocs (notebooks) and execute queries

### Grant Admin Access

Add users to the `querybook-admin` group:

```bash
just keycloak::add-user-to-group <username> querybook-admin
```

Admin users can:

- Manage query engines
- Configure data sources
- Manage user permissions
- View all datadocs

### Configure Trino Query Engine

1. Log in as an admin user
2. Navigate to Admin → Query Engines
3. Click "Add Query Engine"
4. Configure basic settings:

    ```plain
    Name: Trino
    Language: Trino
    Executor: Trino (not SqlAlchemy)
    Environment: production (or your preferred environment name)
    ```

5. Configure connection settings:

    ```plain
    Connection String: trino://trino.example.com:443/iceberg?SSL=true
    Username: admin
    Password: [from just trino::admin-password]
    Proxy_user_id: (leave empty to use admin username)
    ```

    **Important Notes**:
    - **Catalog in Connection String**: Include `/iceberg` (or your catalog name) after the port
      - With catalog: `trino://host:443/iceberg?SSL=true` → queries work without `iceberg.` prefix
      - Without catalog: `trino://host:443?SSL=true` → queries fail with "Catalog 'hive' not found"
    - **Proxy_user_id**: Leave empty (defaults to Username field = admin)
    - For user impersonation, configure Trino access control separately

6. Optional: Link to Metastore for table autocompletion:
    - **Metastore**: Select created Metastore (see Metastore Configuration section below)
    - Enables autocomplete for table and column names in query editor

### Metastore Configuration

**Status**: Metastore features are **fully enabled** in the custom image (`buun-stack` tag) with trino 0.336.0 and sqlalchemy-trino 0.5.0.

**How to configure**:

1. Log in as an admin user
2. Navigate to Admin → Metastores
3. Click "Add Metastore"
4. Configure settings:

   ```plain
   Name: Trino
   Metastore Loader: SqlAlchemyMetastoreLoader
   Connection String: trino://admin:<password>@trino.example.com:443/iceberg?SSL=true
   ```

   **Important**: The Connection String must include username and password embedded in the URL format: `trino://username:password@host:port/catalog?SSL=true`

5. Configure Connect_args section:

   ```plain
   Key: http_scheme
   Value: https
   ```

   This setting ensures proper HTTPS connection handling for the Metastore loader.

6. Enable Impersonate option:

   ```plain
   Impersonate: ON
   ```

   This ensures metadata is fetched as the logged-in user, consistent with query execution behavior. Each user will see tables and schemas they have access to.

7. Link the Metastore to your Query Engine (Admin → Query Engines → Edit → Metastore)

Trino admin password can be retrieved with:

```bash
just trino::admin-password
```

**Features**:

- **Schema Browser**: Browse catalogs, schemas, and tables in Admin UI
- **Table Autocomplete**: Type table names in query editor, press Tab or Escape
- **Column Autocomplete**: Type column names after table name in query
- **Search**: Use search box in Tables sidebar to find tables by name

**Note**: Views are currently not displayed in the schema browser (only tables are shown)

## Features

- **Tables Sidebar**: Browse schemas and tables, view column details
- **Autocomplete**: Type table/column names in query editor, press Tab or Escape
- **Search**: Use search box in Tables sidebar to find tables by name

### User Impersonation

Querybook connects to Trino as `admin` but executes queries as the logged-in user via Trino's impersonation feature. This provides:

- **Query Attribution**: Queries are attributed to the actual user, not the admin account
- **Audit Logging**: Trino logs show the real user who executed each query
- **Access Control**: Future per-user access policies can be enforced

**How it Works**:

1. User logs into Querybook with Keycloak
2. Querybook connects to Trino using admin credentials
3. Querybook sends queries with `X-Trino-User: <username>` header
4. Trino impersonates the user (allowed by access control rules)
5. Query runs as if executed by the actual user

## Architecture

```plain
External Users
      ↓
Cloudflare Tunnel (HTTPS)
      ↓
Traefik Ingress (HTTPS)
      ├─ Traefik Middleware (X-Forwarded-*, WebSocket upgrade)
      └─ Backend: HTTP
      ↓
Querybook Web
      ├─ OAuth2 → Keycloak (authentication)
      ├─ PostgreSQL (metadata)
      ├─ Redis (cache/sessions)
      └─ WebSocket (real-time query updates)
      ↓
Querybook Workers
      ↓
Trino (HTTPS via external hostname)
      └─ Password auth + User impersonation
```

**Key Components**:

- **Traefik Middleware**: Handles WebSocket upgrade headers and X-Forwarded-* headers
- **OAuth2 Integration**: Uses standard OIDC scopes (openid, email, profile) with groups mapper
- **Trino Connection**: Must use external HTTPS hostname (not internal service name)
- **User Impersonation**: Admin credentials with X-Trino-User header for query attribution

## Authentication

### User Login (OAuth2)

- Users authenticate via Keycloak
- Standard OIDC flow with Authorization Code grant
- Group membership included in UserInfo endpoint response
- Session stored in Redis

### Admin Access

- Controlled by Keycloak group membership
- Users in `querybook-admin` group have full admin privileges
- Regular users can create and manage their own datadocs

### Trino Connection

- Uses password authentication (admin user)
- Connects via external HTTPS hostname (Traefik provides TLS)
- Python Trino client enforces HTTPS when authentication is used
- User impersonation via X-Trino-User header

## Management

### Upgrade Querybook

```bash
just querybook::upgrade
```

Updates the Helm deployment with current configuration.

### Uninstall

```bash
# Keep PostgreSQL database
just querybook::uninstall false

# Delete PostgreSQL database too
just querybook::uninstall true
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n querybook
```

### WebSocket Connection Fails

- Verify Traefik middleware exists: `kubectl get middleware querybook-headers -n querybook`
- Check WebSocket upgrade headers in middleware configuration
- Ensure Ingress annotation references middleware: `querybook-querybook-headers@kubernetescrd`

### OAuth Login Fails

- Verify Keycloak client exists: `just keycloak::list-clients`
- Check redirect URL: `https://<querybook-host>/oauth2callback`
- Verify client secret matches: Compare Vault/K8s secret with Keycloak
- Check Keycloak is accessible from Querybook pods

### Trino Connection Fails

- **Error: "cannot use authentication with HTTP"**
    - Must use external hostname with HTTPS: `trino://trino.example.com:443?SSL=true`
    - Do NOT use internal service name (e.g., `trino.trino.svc.cluster.local:8080`)
    - Python Trino client enforces HTTPS when authentication is used

- **Error: "500 Internal Server Error"**
    - Verify Trino is accessible via external hostname
    - Check Trino admin password: `just trino::admin-password`
    - Test Trino connection manually with curl

- **Error: "Access Denied: User admin cannot impersonate user X"**
    - Verify Trino access control is configured
    - Check impersonation rules: `kubectl exec -n trino deployment/trino-coordinator -- cat /etc/trino/access-control/rules.json`
    - Ensure admin can impersonate all users

### Query Execution Stuck

- Check worker pod logs: `just querybook::logs worker`
- Verify Redis is running: `kubectl get pods -n querybook | grep redis`
- Check Trino coordinator health: `kubectl get pods -n trino`

### Database Connection Issues

- Verify PostgreSQL cluster is running: `kubectl get cluster -n postgres`
- Check database exists: `just postgres::list-databases | grep querybook`
- Verify secret exists: `kubectl get secret querybook-config-secret -n querybook`

### Metastore Issues

**Note**: Metastore features are fully enabled in the `buun-stack` custom image with trino 0.336.0 and sqlalchemy-trino 0.5.0.

- **Metastore not loading tables**:
    - Verify Metastore configuration: Admin → Metastores → Edit
    - Check connection string includes catalog: `trino://admin:password@host:443/iceberg?SSL=true`
    - Test Trino connection with admin credentials
    - Check worker pod logs for errors: `just querybook::logs worker`

- **Tables not appearing in sidebar**:
    - Wait for initial metadata sync (may take a few minutes)
    - Trigger manual sync: Admin → Metastores → Sync
    - Verify schemas exist in Trino: `SHOW SCHEMAS FROM iceberg`

- **Views not displayed**:
    - This is a known limitation - only tables are currently shown
    - Views can still be queried directly by typing the full name

## References

- [Querybook Documentation](https://www.querybook.org/)
- [Querybook GitHub](https://github.com/pinterest/querybook)
- [Trino Integration](../trino/README.md)
- [Keycloak OAuth2](https://www.keycloak.org/docs/latest/securing_apps/#_oidc)
