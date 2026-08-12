# Langfuse

Open source LLM observability and analytics platform with Keycloak OIDC authentication.

## Overview

This module deploys Langfuse using the official Helm chart with:

- **Keycloak OIDC authentication** for user login
- **PostgreSQL backend** for application data
- **ClickHouse database** for analytics and traces
- **Redis (Valkey)** for caching and queues
- **S3-compatible object storage** (MinIO or RustFS) for event uploads and batch exports
- **Traefik ingress** for HTTPS access
- **External Secrets Operator integration** for secure credential management

## Prerequisites

- Kubernetes cluster (k3s)
- Keycloak installed and configured
- PostgreSQL cluster (CloudNativePG), version 16 or later
- ClickHouse cluster, **version 25.12 or later** (26.4 recommended)
- Object storage: MinIO or RustFS
- External Secrets Operator (optional, for Vault integration)

### Langfuse v4

The Helm chart still ships Langfuse v3 as its `appVersion`, so this module pins v4
explicitly through `LANGFUSE_IMAGE_TAG`. v4 only works with an **external** ClickHouse
of version 25.12 or later — the ClickHouse bundled with the chart is not compatible,
which is why `clickhouse.deploy` is `false` and the cluster from `just clickhouse::install`
is used instead. `just langfuse::install` verifies the server version before touching
anything and aborts with an actionable message if it is too old.

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
- Object storage bucket `langfuse` (MinIO or RustFS)
- Keycloak OAuth client (confidential client)
- Keycloak user `langfuse` for system access
- Vault secrets (if External Secrets Operator is available)

## Configuration

Environment variables (set in `.env.local` or override):

```bash
LANGFUSE_NAMESPACE=langfuse                # Kubernetes namespace
LANGFUSE_CHART_VERSION=<version>           # Helm chart version
LANGFUSE_IMAGE_TAG=4.9.0                   # Langfuse application version (v4)
LANGFUSE_RETENTION_DAYS=30                 # Trace data retention in days (minimum 3)
LANGFUSE_HOST=langfuse.example.com         # External hostname
LANGFUSE_OIDC_CLIENT_ID=langfuse           # Keycloak client ID
LANGFUSE_OBJECT_STORAGE=minio              # Object storage backend: minio | rustfs
LANGFUSE_BUCKET=langfuse                   # Bucket name for event uploads
```

### Data Retention

Langfuse keeps trace data forever by default, in three places that all grow with
ingest volume:

- ClickHouse `events_full` / `events_core`: traces and observations, including inputs
  and outputs
- ClickHouse `scores`: scores
- Object storage `events/`: one JSON blob per ingested event — the raw ingestion log,
  indexed by the ClickHouse table `blob_storage_file_log`
- Object storage `media/`: media assets attached to traces

The object-storage ingestion log is usually the part that grows fastest, since every
event is written there in addition to its ClickHouse row.

Retention is enforced per project through the `retention_days` column of the `projects`
table in the `langfuse` PostgreSQL database. The worker jobs that act on it are part of
the OSS build; only the *UI toggle* for the setting requires an Enterprise license, so
the value is written directly instead:

```bash
just langfuse::set-retention          # apply LANGFUSE_RETENTION_DAYS (default 30)
just langfuse::set-retention 90       # or an explicit number of days
just langfuse::show-retention         # show the current setting per project
just langfuse::clear-retention        # keep data indefinitely again
```

`just langfuse::install` applies the setting at the end of the run. Because it acts on
the projects that exist at that moment, **re-run `just langfuse::set-retention` after
creating a new project** in the UI.

#### Which job deletes what

Two independent workers are enabled, and the difference matters for the
object-storage side:

- **Daily sweep, 03:15** (`QUEUE_CONSUMER_DATA_RETENTION_QUEUE_IS_ENABLED`) — walks every
  project with a retention setting and deletes ClickHouse rows, expired media, **and the
  raw ingestion-event blobs** in `events/` together with their `blob_storage_file_log`
  references. This is the only job that reliably removes the event blobs.
- **Hourly cleanup** (`LANGFUSE_BATCH_DATA_RETENTION_CLEANER_ENABLED`) — trims ClickHouse
  rows incrementally so they do not accumulate until 03:15. It also starts
  `MediaRetentionCleaner`, whose object-storage pass is reached only for projects that
  have expired *media*, so it cannot be relied on for the event blobs on its own.

Cleanup is therefore not instant, and disk space is reclaimed one step later still:
ClickHouse deletes are lightweight deletes, so the space comes back only once the
deleted-mask cleaner applies the masks (hourly, via
`LANGFUSE_CLICKHOUSE_DELETED_MASK_CLEANER_ENABLED`).

To confirm that the event blobs are actually shrinking:

```bash
just rustfs::list-buckets                       # or: just minio::...
just langfuse::show-retention                   # retention must be set per project
kubectl logs -n langfuse deployment/langfuse-worker | grep "Data Retention"
```

### Object Storage Backend

`LANGFUSE_OBJECT_STORAGE` selects the S3-compatible backend:

- `minio` (default): creates a dedicated MinIO user `langfuse` with its own bucket.
  Credentials come from Vault path `langfuse/minio`, endpoint is the MinIO ingress
  host (falling back to `http://minio.<namespace>:9000`).
- `rustfs`: creates the bucket via `just rustfs::create-bucket`, then prompts for an
  access key pair. Credentials are stored in Vault path `langfuse/rustfs`, endpoint is
  `http://rustfs.<namespace>:9000`.

Either way the credentials land in the `s3-auth` Secret in the Langfuse namespace.

The bucket is laid out with one prefix per payload type, so the three can be told apart
and monitored separately:

- `events/<projectId>/<entityType>/<entityId>/<eventId>.json` — raw ingestion events
- `media/` — media assets attached to traces
- `exports/` — batch exports

#### RustFS Access Key

RustFS has no CLI user management, so the key pair must be created manually in the
RustFS Web Console (read/write on the `langfuse` bucket) before installing. The admin
(root) credentials are deliberately not used. `just langfuse::install` prompts for the
pair with `gum` and stores it in Vault; the prompt is skipped if `langfuse/rustfs`
already exists. Non-interactive runs can preset the values:

```bash
LANGFUSE_RUSTFS_ACCESS_KEY=... LANGFUSE_RUSTFS_SECRET_KEY=... just langfuse::install
```

To rotate the key after installation:

```bash
just langfuse::update-rustfs-credentials   # re-prompt, resync s3-auth, restart pods
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
  └─ MinIO / RustFS (file storage)
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
- **MinIO / RustFS**: S3-compatible storage for event uploads and batch exports

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

Set the target version and re-run the installer, which is idempotent:

```bash
LANGFUSE_IMAGE_TAG=4.10.0 just langfuse::install
```

Schema migrations are applied automatically on startup. To move the Helm chart itself,
set `LANGFUSE_CHART_VERSION` the same way.

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
- Object storage user and bucket
- Keycloak user

### Clean Up Specific Resources

```bash
# Delete PostgreSQL user and database
just langfuse::delete-postgres-user-and-db

# Delete ClickHouse user and database
just langfuse::delete-clickhouse-user

# Delete object storage resources of the selected backend
just langfuse::delete-object-storage

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

### ClickHouse "Not enough privileges" in the Worker

**Symptoms**: the worker logs, in a loop:

```plain
Error executing EventPropagationJob langfuse: Not enough privileges.
To execute this query, it's necessary to have the grant SELECT ON system.parts.
```

**Cause**: Langfuse v4 reads ClickHouse system tables — `system.parts` from the event
propagation job (every 10 s) and `system.mutations` from the deleted-mask cleaner.
`just clickhouse::grant` only covers the `langfuse` database.

**Solution**:

```bash
just clickhouse::grant-system-tables langfuse
```

`just langfuse::install` does this automatically; the recipe exists separately for
clusters provisioned before it was added.

### Redis "Socket timeout" on Every Queue

**Symptoms**: many queues fail at once with
`Socket timeout. Expecting data, but didn't receive any in 30000ms` from `ioredis`.

**Cause**: the Redis subchart is Valkey aliased as `redis`, so its resources live under
`redis.primary`, not `redis.master`. A block written under `master` is silently ignored
and Valkey falls back to the `nano` resourcesPreset (150 m CPU / 192 Mi), which cannot
keep up with the worker's queues during startup.

**Solution**: keep the resources under `redis.primary` in
`langfuse-values.gomplate.yaml`, then re-run `just langfuse::install`. Verify what
actually landed:

```bash
kubectl get sts -n langfuse langfuse-redis-primary \
  -o jsonpath='{.spec.template.spec.containers[0].resources}'
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

Check object storage credentials:

```bash
kubectl get secret s3-auth -n langfuse -o yaml
```

Verify bucket exists:

```bash
just minio::bucket-exists langfuse   # MinIO
just rustfs::list-buckets            # RustFS
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
- `s3-auth-external-secret.gomplate.yaml` - Object storage credentials (MinIO or RustFS)

## Security Considerations

- **Pod Security Standards**: Namespace configured with **restricted** enforcement
- **Secrets Management**: All credentials stored in Vault and synced via External Secrets Operator
- **OIDC Authentication**: No local password storage, authentication delegated to Keycloak
- **API Key Security**: Keys are hashed and stored securely in PostgreSQL
- **TLS/HTTPS**: All external traffic encrypted via Traefik Ingress
- **Network Isolation**: Internal services communicate via cluster network
- **Database Credentials**: Unique user per application with minimal privileges

### Pod Security Standards

The Langfuse namespace is configured with **restricted** Pod Security Standards:

- `pod-security.kubernetes.io/enforce=restricted`
- `pod-security.kubernetes.io/warn=restricted`

All pods (Langfuse web, worker, and Valkey) run with restricted-compliant security contexts:

- `runAsNonRoot: true` - Prevents containers from running as root
- `allowPrivilegeEscalation: false` - Blocks privilege escalation
- `seccompProfile.type: RuntimeDefault` - Enables seccomp filtering
- `capabilities.drop: [ALL]` - Drops all Linux capabilities

## References

- [Langfuse Documentation](https://langfuse.com/docs)
- [Langfuse GitHub](https://github.com/langfuse/langfuse)
- [Langfuse Helm Chart](https://github.com/langfuse/langfuse-k8s)
- [Langfuse Python SDK](https://langfuse.com/docs/sdk/python)
- [Langfuse OpenAI Integration](https://langfuse.com/docs/integrations/openai)
- [Keycloak OIDC](https://www.keycloak.org/docs/latest/securing_apps/#_oidc)
