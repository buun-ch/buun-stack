# Langfuse

Open source LLM observability and analytics platform with Keycloak OIDC authentication.

## Overview

This module deploys Langfuse using the official Helm chart with:

- **Keycloak OIDC authentication** for user login
- **PostgreSQL backend** for application data
- **ClickHouse database** for analytics and traces
- **Redis (Valkey)** for caching and queues
- **MinIO/S3 storage** for event uploads and batch exports
- **Traefik ingress** for HTTPS access
- **External Secrets Operator integration** for secure credential management

## Prerequisites

- Kubernetes cluster (k3s)
- Keycloak installed and configured
- PostgreSQL cluster (CloudNativePG)
- ClickHouse cluster
- MinIO object storage
- External Secrets Operator (optional, for Vault integration)

## Installation

### Basic Installation

```bash
just langfuse::install
```

You will be prompted for:

- **Langfuse host (FQDN)**: e.g., `langfuse.example.com`

### What Gets Installed

- Langfuse web application (1 replica)
- Langfuse worker (background job processor)
- Redis (Valkey) for caching and queues
- PostgreSQL database `langfuse` with dedicated user
- ClickHouse database `langfuse` with dedicated user
- MinIO bucket `langfuse` for storage
- Keycloak OAuth client (confidential client)
- Keycloak user `langfuse` for system access
- Vault secrets (if External Secrets Operator is available)

## Configuration

Environment variables (set in `.env.local` or override):

```bash
LANGFUSE_NAMESPACE=langfuse                # Kubernetes namespace
LANGFUSE_CHART_VERSION=<version>           # Helm chart version
LANGFUSE_HOST=langfuse.example.com         # External hostname
LANGFUSE_OIDC_CLIENT_ID=langfuse           # Keycloak client ID
```

### Architecture Notes

**Langfuse**:

- Next.js application with FastAPI backend
- Redis/Valkey for session management and job queues
- ClickHouse for analytics queries
- PostgreSQL for application metadata
- S3-compatible storage for file uploads

**Authentication Flow**:

- OIDC via Keycloak with Authorization Code flow
- Username/password authentication disabled (`AUTH_DISABLE_USERNAME_PASSWORD=true`)
- Account linking enabled (`AUTH_KEYCLOAK_ALLOW_ACCOUNT_LINKING=true`)
- New users automatically provisioned on first SSO login
- Sign-up disabled for anonymous users

**Database Structure**:

- `langfuse` PostgreSQL database: Application data, experiments, projects
- `langfuse` ClickHouse database: Traces, observations, scores for analytics
- Redis: Session storage, job queues, caching

## Usage

### Access Langfuse

1. Navigate to `https://your-langfuse-host/`
2. Click "Keycloak" button to authenticate via SSO
3. On first login, your account will be automatically created
4. Access the dashboard and start tracking LLM applications

### Create API Keys

1. Log in to Langfuse UI
2. Navigate to **Settings** → **API Keys**
3. Click **Create new API key**
4. Copy the public and secret keys
5. Use these keys in your LLM applications

## Architecture

```plain
External Users
      ↓
Cloudflare Tunnel (HTTPS)
      ↓
Traefik Ingress (HTTPS)
      ↓
Langfuse Web (HTTP inside cluster)
  ├─ Next.js
  ├─ OAuth → Keycloak (authentication)
  ├─ PostgreSQL (metadata)
  ├─ ClickHouse (analytics)
  ├─ Redis/Valkey (cache & queues)
  └─ MinIO (file storage)
      ↓
Langfuse Worker (background jobs)
  ├─ Job queues (Redis)
  ├─ Data processing
  └─ Analytics aggregation
```

**Key Components**:

- **Web UI**: Next.js application for dashboard and API
- **Worker**: Background job processor for async tasks
- **Redis**: Session management, job queues, caching
- **PostgreSQL**: Application data (projects, users, API keys)
- **ClickHouse**: Analytics data (traces, observations, scores)
- **MinIO**: S3-compatible storage for event uploads and batch exports

## Authentication

### User Login (OIDC)

- Users authenticate via Keycloak
- Standard OIDC flow with Authorization Code grant
- Users automatically created on first login
- Username/password authentication is disabled
- Account linking enabled for users with same email

### API Authentication

- Public/Secret key pairs for programmatic access
- API keys are created per user in the Langfuse UI
- Keys are stored securely and can be rotated
- Each key is associated with a specific project

### Access Control

- Project-based access control
- Users can be invited to specific projects
- Role-based permissions (Owner, Admin, Member, Viewer)
- API keys are scoped to specific projects

## Management

### Upgrade Langfuse

To upgrade Langfuse to a new version:

```bash
just langfuse::upgrade
```

### Uninstall

```bash
just langfuse::uninstall
```

This removes:

- Helm release and all Kubernetes resources
- Namespace
- Keycloak client and Vault secrets

**Note**: The following resources are NOT deleted and must be removed manually if needed:

- PostgreSQL user and database
- ClickHouse user and database
- MinIO user and bucket
- Keycloak user

### Clean Up Specific Resources

```bash
# Delete PostgreSQL user and database
just langfuse::delete-postgres-user-and-db

# Delete ClickHouse user and database
just langfuse::delete-clickhouse-user

# Delete MinIO user and bucket
just langfuse::delete-minio-user

# Delete Keycloak user
just langfuse::delete-keycloak-user
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n langfuse
```

Expected pods:

- `langfuse-web-*` - Web application (1 replica)
- `langfuse-worker-*` - Background worker (1 replica)
- `langfuse-redis-primary-0` - Redis/Valkey instance

### OAuth Login Fails

**Error**: `OAuthCallback: Invalid client or Invalid client credentials`

**Cause**: Client secret mismatch between Keycloak and Langfuse

**Solution**: Verify client secret is synchronized:

```bash
# Get secret from Keycloak
just keycloak::get-client-secret langfuse

# Compare with Vault
just vault::get keycloak/client/langfuse client_secret

# If mismatched, update Vault and restart pods
just vault::put keycloak/client/langfuse client_id=langfuse client_secret=<correct-secret>
kubectl rollout restart deployment/langfuse-web -n langfuse
```

**Error**: `Sign up is disabled`

**Cause**: New SSO users cannot be created due to configuration

**Solution**: This should not occur with the current configuration (`signUpDisabled: false`). If it does, verify Helm values:

```bash
helm get values langfuse -n langfuse | grep signUpDisabled
# Should show: signUpDisabled: false
```

### Redis Connection Errors (Startup Only)

**Symptoms**: Logs show `Redis error connect ECONNREFUSED` during pod startup

**Cause**: Timing issue where web/worker pods start before Redis is ready

**Impact**: None - these are transient errors during startup. Once Redis is ready, connections succeed and the application functions normally.

**Solution**: No action needed. If you want to eliminate these startup errors, Redis pod can be deployed with a headstart, or init containers can be added to wait for Redis readiness.

### Database Connection Issues

Check PostgreSQL connectivity:

```bash
kubectl exec -n langfuse deployment/langfuse-web -- \
  psql -h postgres-cluster-rw.postgres -U langfuse -d langfuse -c "SELECT 1"
```

Check ClickHouse connectivity:

```bash
kubectl exec -n clickhouse clickhouse-clickhouse-0 -- \
  clickhouse-client --user=langfuse --password=$(just vault::get clickhouse/user/langfuse password) \
  --query "SELECT 1"
```

### Storage Issues

Check MinIO credentials:

```bash
kubectl get secret minio-auth -n langfuse -o yaml
```

Verify bucket exists:

```bash
just minio::bucket-exists langfuse
```

### Check Logs

```bash
# Web application logs
kubectl logs -n langfuse deployment/langfuse-web --tail=100

# Worker logs
kubectl logs -n langfuse deployment/langfuse-worker --tail=100

# Redis logs
kubectl logs -n langfuse langfuse-redis-primary-0 --tail=100

# Real-time logs
kubectl logs -n langfuse deployment/langfuse-web -f
```

### Common Issues

**Blank page after login**: Check browser console for errors. Ensure `NEXTAUTH_URL` matches the actual hostname.

**API requests fail**: Verify API keys are correct and associated with the correct project.

**Slow dashboard**: Check ClickHouse query performance. Large trace volumes may require index optimization.

**Missing traces**: Ensure SDK is configured with correct host and API keys. Check network connectivity from application to Langfuse.

## Configuration Files

Key configuration files:

- `langfuse-values.gomplate.yaml` - Helm values template
- `keycloak-auth-external-secret.yaml` - Keycloak credentials
- `postgres-auth-external-secret.gomplate.yaml` - PostgreSQL credentials
- `clickhouse-auth-external-secret.gomplate.yaml` - ClickHouse credentials
- `redis-auth-external-secret.yaml` - Redis password
- `minio-auth-external-secret.yaml` - MinIO credentials

## Security Considerations

- **Secrets Management**: All credentials stored in Vault and synced via External Secrets Operator
- **OIDC Authentication**: No local password storage, authentication delegated to Keycloak
- **API Key Security**: Keys are hashed and stored securely in PostgreSQL
- **TLS/HTTPS**: All external traffic encrypted via Traefik Ingress
- **Network Isolation**: Internal services communicate via cluster network
- **Database Credentials**: Unique user per application with minimal privileges

## References

- [Langfuse Documentation](https://langfuse.com/docs)
- [Langfuse GitHub](https://github.com/langfuse/langfuse)
- [Langfuse Helm Chart](https://github.com/langfuse/langfuse-k8s)
- [Langfuse Python SDK](https://langfuse.com/docs/sdk/python)
- [Langfuse OpenAI Integration](https://langfuse.com/docs/integrations/openai)
- [Keycloak OIDC](https://www.keycloak.org/docs/latest/securing_apps/#_oidc)
