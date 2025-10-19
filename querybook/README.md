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
QUERYBOOK_CUSTOM_IMAGE_TAG=trino-metastore              # Custom image tag (default: latest)
QUERYBOOK_CUSTOM_IMAGE_PULL_POLICY=Always               # Image pull policy (default: Always)
```

### Using Custom Image

To use a custom Querybook image (e.g., with patches or fixes):

```bash
# Set environment variables
export QUERYBOOK_CUSTOM_IMAGE=localhost:30500/querybook
export QUERYBOOK_CUSTOM_IMAGE_TAG=trino-metastore

# Install or upgrade Querybook
just querybook::install
# or
just querybook::upgrade
```

**When to use custom image**:

- Testing bug fixes before they are merged upstream
- Applying patches for specific issues (e.g., datetime JSON serialization)
- Using Trino Metastore integration (requires sqlalchemy-trino)
- Using modified versions with custom features

**Custom image includes** (`trino-metastore` tag):

- Datetime JSON serialization fixes for WebSocket communication
- `sqlalchemy-trino` package for Metastore integration

**Custom image behavior** (when `QUERYBOOK_CUSTOM_IMAGE` is set):

- Pull policy: `Always` (default, override with `QUERYBOOK_CUSTOM_IMAGE_PULL_POLICY`)
- Ensures latest image is always pulled from registry

**Default behavior** (when `QUERYBOOK_CUSTOM_IMAGE` is not set):

- Uses official image: `querybook/querybook:latest`
- Pull policy: `IfNotPresent`
- Note: Official image does not include `sqlalchemy-trino`, so Trino Metastore integration will not work

### Building Custom Image

To build a custom Querybook image with `sqlalchemy-trino` support:

1. **Clone Querybook repository**:

    ```bash
    git clone https://github.com/pinterest/querybook.git
    cd querybook
    ```

2. **Create requirements/local.txt**:

    ```bash
    cat > requirements/local.txt <<EOF
    # Local additional requirements for buun-stack
    # SQLAlchemy dialect for Trino (required for Metastore)
    sqlalchemy-trino
    EOF
    ```

3. **Build the Docker image**:

    ```bash
    # For remote Docker host (e.g., k3s node)
    DOCKER_HOST=ssh://yourdomain.com docker build \
        --build-arg EXTRA_PIP_INSTALLS=extra.txt \
        -t localhost:30500/querybook:trino-metastore .

    # For local Docker
    docker build \
        --build-arg EXTRA_PIP_INSTALLS=extra.txt \
        -t localhost:30500/querybook:trino-metastore .
    ```

4. **Push to registry**:

    ```bash
    DOCKER_HOST=ssh://yourdomain.com docker push localhost:30500/querybook:trino-metastore
    # or for local Docker
    docker push localhost:30500/querybook:trino-metastore
    ```

5. **Deploy to Kubernetes**:

    ```bash
    export QUERYBOOK_CUSTOM_IMAGE=localhost:30500/querybook
    export QUERYBOOK_CUSTOM_IMAGE_TAG=trino-metastore
    just querybook::upgrade
    ```

**Notes**:

- The Dockerfile automatically includes `requirements/local.txt` if it exists (lines 40-42)
- `EXTRA_PIP_INSTALLS=extra.txt` ensures additional dependencies are installed during build
- The custom image will have both the official Querybook packages and `sqlalchemy-trino`

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

### Configure Metastore (Optional but Recommended)

Metastore enables table/column autocompletion and provides a browsable table catalog.

**Prerequisites**: Custom image with `sqlalchemy-trino` (official image does not include this package)

1. Navigate to Admin → Metastores
2. Click "Create Metastore"
3. Configure:

    ```plain
    Name: Trino Iceberg
    Metastore Loader: SqlAlchemyMetastoreLoader
    Connection String: trino://admin:[password]@trino.example.com:443/iceberg?SSL=true
    Acct Info (Key-Value):
      http_scheme = https
    Impersonate: OFF (recommended for shared table catalog)
    ```

    **Important Notes**:
    - Include authentication in Connection String: `admin:[password]@host`
    - Include catalog in Connection String: `/iceberg` after port
    - `http_scheme` must be set to `https` in Acct Info
    - Keep Impersonate OFF unless you need per-user table filtering

4. Click "Run Task" to sync table metadata
5. Verify in Admin → Metastores that "Last Synced" timestamp is updated
6. Check left sidebar "Tables" for table list

**Scheduled Updates** (recommended):

- Navigate to Admin → Metastores → [your metastore] → Schedule
- Set cron expression: `0 */6 * * *` (sync every 6 hours)

**Usage**:

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

- **Tables sidebar is empty**
    - Check Admin → Metastores for "Last Synced" timestamp
    - Click "Run Task" to manually sync
    - Verify Metastore is linked to Query Engine (Admin → Query Engines → Metastore field)
    - Check worker logs: `kubectl logs -n querybook deployment/worker --tail=100 | grep metastore`

- **Error: "Can't load plugin: sqlalchemy.dialects:trino"**
    - Official Querybook image does not include `sqlalchemy-trino`
    - Use custom image with `QUERYBOOK_CUSTOM_IMAGE_TAG=trino-metastore`
    - See "Using Custom Image" section above

- **Error: "Connection.**init**() got an unexpected keyword argument 'password'"**
    - Do not use `password` key in Acct Info
    - Embed authentication in Connection String: `trino://admin:[password]@host:port/catalog?SSL=true`
    - Set `http_scheme = https` in Acct Info

- **Only system.* schemas visible**
    - Connection String is missing catalog specification
    - Add `/iceberg` (or your catalog) after port: `trino://host:443/iceberg?SSL=true`

- **Autocomplete not working**
    - Verify Query Engine has Metastore linked (Admin → Query Engines → Metastore field)
    - Refresh DataDoc page (F5) after linking Metastore
    - Check Environment matches between DataDoc and Query Engine
    - Try Tab or Escape key instead of Ctrl+Space (macOS shortcut conflict)

## References

- [Querybook Documentation](https://www.querybook.org/)
- [Querybook GitHub](https://github.com/pinterest/querybook)
- [Trino Integration](../trino/README.md)
- [Keycloak OAuth2](https://www.keycloak.org/docs/latest/securing_apps/#_oidc)
