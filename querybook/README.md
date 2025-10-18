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
```

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
4. Configure:

    ```plain
    Name: Trino
    Language: Trino
    Environment: production (or your preferred environment name)
    ```

5. Navigate to Admin → Environments → [your environment]
6. Add new query engine connection:

    ```plain
    Connection String: trino://trino.example.com:443?SSL=true
    Username: admin
    Password: [from just trino::admin-password]
    ```

7. Optional: Configure additional connection parameters:
    - **Catalog**: Specify default catalog (e.g., `postgresql` or `iceberg`)
    - **Schema**: Specify default schema
    - **Proxy_user_id**: Leave empty or set to enable user impersonation

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

```
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

## References

- [Querybook Documentation](https://www.querybook.org/)
- [Querybook GitHub](https://github.com/pinterest/querybook)
- [Trino Integration](../trino/README.md)
- [Keycloak OAuth2](https://www.keycloak.org/docs/latest/securing_apps/#_oidc)
