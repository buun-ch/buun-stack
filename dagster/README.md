# Dagster Documentation

## Overview

This document covers Dagster installation, deployment, and debugging in the buun-stack environment.

## Installation

### Prerequisites

- Kubernetes cluster with buun-stack components
- PostgreSQL database cluster
- MinIO object storage (optional, for MinIO-based storage)
- External Secrets Operator (optional, for Vault integration)
- Keycloak (for authentication)

### Installation Steps

1. **Setup Environment Secrets** (if needed):
   - See Environment Variables Setup section below for configuration options
   - Create ExternalSecret or Secret before installation if you want environment variables available immediately

2. **Install Dagster**:

   ```bash
   # Interactive installation with configuration prompts
   just dagster::install
   ```

3. **Access Dagster Web UI**:
   - Navigate to your Dagster instance (e.g., `https://dagster.buun.dev`)
   - Login with your Keycloak credentials

### Uninstalling

```bash
# Remove Dagster (keeps database by default)
just dagster::uninstall false

# Remove Dagster and delete database
just dagster::uninstall true
```

## Project Deployment

### Overview

Dagster's official Helm chart only supports adding projects during installation. To work around this limitation, `just dagster::deploy-project` was implemented to dynamically add projects to a running Dagster instance.

This solution:

- Copies project files to a shared PVC (ReadWriteMany with Longhorn, or ReadWriteOnce fallback)
- Updates the workspace ConfigMap to register the new project
- Restarts Dagster components to load the updated workspace

### Deploy Projects to Shared PVC

#### 1. Prepare Project Directory

Requirements:

- Project must have a `definitions.py` file (typically in `src/<project_name>/definitions.py`)
- Project directory name must use underscores, not hyphens (e.g., `my_project`, not `my-project`)
- Project should follow standard Python package structure:

  ```
  my_project/
  ├── pyproject.toml          # Optional: for dependencies
  ├── requirements.txt        # Optional: for dependencies
  └── src/
      └── my_project/
          ├── __init__.py
          ├── definitions.py  # Required: Dagster definitions entry point
          └── defs/
              └── assets/
                  └── my_assets.py
  ```

#### 2. Deploy Project

```bash
# Deploy a local project directory
just dagster::deploy-project /path/to/your/project

# Interactive deployment (will prompt for project path)
just dagster::deploy-project
```

**What happens during deployment:**

1. **File Copy**: Project files are copied to `/opt/dagster/user-code/<project_name>/` in the shared PVC
   - Excludes: `.venv`, `__pycache__`, `.git`, and other build artifacts
   - Uses tar with `--no-xattrs` to avoid macOS extended attributes issues

2. **Workspace Update**: The `dagster-workspace-yaml` ConfigMap is updated to include:

   ```yaml
   load_from:
     - python_module:
         module_name: <project_name>.definitions
         working_directory: /opt/dagster/user-code/<project_name>/src  # or project root if no src/
   ```

3. **Automatic Reload**: Dagster automatically detects the workspace.yaml changes and reloads within ~1 minute
   - No manual restart required
   - The new project will appear in the Deployment tab once loaded

#### 3. Verify Deployment

- Access Dagster Web UI
- Navigate to "Deployment" tab to see registered code locations
- Wait ~1 minute for automatic workspace reload
- Click "Reload all" in the UI to refresh the view if needed
- Check the Asset Catalog for your assets

### Remove Projects

```bash
# Remove a deployed project
just dagster::remove-project project_name

# Interactive removal (will prompt for project name)
just dagster::remove-project
```

**What happens during removal:**

1. Files are deleted from the shared PVC
2. The project module is removed from `workspace.yaml`
3. Dagster automatically detects the change and reloads within ~1 minute

### Manual Workspace Reload

If automatic reload doesn't work or you need immediate reload:

```bash
just dagster::reload-workspace
```

This command restarts both `dagster-webserver` and `dagster-daemon` to force an immediate workspace reload.

## Storage Configuration

### Local PVC Storage (Default)

Uses Kubernetes PersistentVolumeClaims for storage:

- **dagster-storage-pvc**: Main Dagster storage (ReadWriteOnce)
- **dagster-user-code-pvc**: Shared user code storage (ReadWriteMany with Longhorn)

### MinIO Storage (Optional)

When MinIO is available, Dagster can use S3-compatible storage:

- **dagster-data**: Data files bucket
- **dagster-logs**: Compute logs bucket

The storage type is selected during installation via interactive prompt.

## Environment Variables Setup

Environment variables are provided to Dagster through Kubernetes Secrets. You have several options:

### Option 1: Customize the Example Template

1. Create the example environment secrets template:

   ```bash
   just dagster::create-env-secrets-example
   ```

2. **Important**: This creates a template with sample values. You must customize it:
   - If using **External Secrets**: Edit `dagster-env-external-secret.gomplate.yaml` to reference your actual Vault paths
   - If using **Direct Secrets**: Update the created `dagster-env-secret` with your actual credentials

### Option 2: Create ExternalSecret Manually

Create an ExternalSecret that references your Vault credentials:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: dagster-env-external-secret
  namespace: dagster
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-secret-store
    kind: ClusterSecretStore
  target:
    name: dagster-env-secret
  data:
  - secretKey: AWS_ACCESS_KEY_ID
    remoteRef:
      key: minio/credentials
      property: access_key
  - secretKey: AWS_SECRET_ACCESS_KEY
    remoteRef:
      key: minio/credentials
      property: secret_key
  - secretKey: POSTGRES_URL
    remoteRef:
      key: postgres/admin
      property: connection_string
  # Add more variables as needed
```

### Option 3: Create Kubernetes Secret Directly

```bash
kubectl create secret generic dagster-env-secret -n dagster \
  --from-literal=AWS_ACCESS_KEY_ID="your-access-key" \
  --from-literal=AWS_SECRET_ACCESS_KEY="your-secret-key" \
  --from-literal=AWS_ENDPOINT_URL="http://minio.minio.svc.cluster.local:9000" \
  --from-literal=POSTGRES_URL="postgresql://user:pass@postgres-cluster-rw.postgres:5432"
```

After creating the environment secrets, redeploy Dagster to pick up the new configuration.

## Example Projects

### CSV to PostgreSQL Project

The `examples/csv_to_postgres` project demonstrates a complete ETL pipeline that loads data from MinIO object storage into PostgreSQL using dlt (data load tool).

#### Dataset Information

##### MovieLens 20M Dataset

This project processes the [MovieLens 20M dataset](https://grouplens.org/datasets/movielens/20m/) from GroupLens Research. The dataset contains:

- **27,278 movies** with metadata
- **20 million ratings** from 138,493 users
- **465,564 tags** applied by users
- Additional genome data for content-based filtering

##### MinIO Storage Structure

The dataset files are stored in MinIO under the `movie-lens` bucket:

```bash
mc alias set buun https://minio.your-domain.com access-key secret-key
mc ls buun/movie-lens

[2025-09-14 12:13:09 JST] 309MiB STANDARD genome-scores.csv
[2025-09-14 12:12:37 JST]  18KiB STANDARD genome-tags.csv
[2025-09-14 12:12:38 JST] 557KiB STANDARD links.csv
[2025-09-14 12:12:38 JST] 1.3MiB STANDARD movies.csv
[2025-09-14 12:13:15 JST] 509MiB STANDARD ratings.csv
[2025-09-14 12:12:42 JST]  16MiB STANDARD tags.csv
```

The project processes:

- **movies.csv** (1.3MiB) - Movie metadata
- **tags.csv** (16MiB) - User-generated tags
- **ratings.csv** (509MiB) - User ratings

#### Project Features

##### Assets Processed

- **movies_pipeline**: MovieLens movies data with primary key `movieId`
- **ratings_pipeline**: User ratings with composite primary key `[userId, movieId]`
- **tags_pipeline**: User tags with composite primary key `[userId, movieId, timestamp]`
- **movielens_summary**: Generates metadata summary of all processed assets

##### Smart Processing

- **Table Existence Check**: Uses DuckDB PostgreSQL scanner to check if tables already exist
- **Skip Logic**: If a table already contains data, the asset will skip processing to avoid reprocessing large files
- **Write Disposition**: Uses `replace` mode for initial loads

##### Dependencies

- `dlt[duckdb,filesystem,postgres,s3]>=1.12.1`
- `dagster` and related libraries
- duckdb (for table existence checking)

#### Environment Variables Required

The project expects the following environment variables to be set:

- `POSTGRES_URL`: PostgreSQL connection string (format: `postgresql://user:password@host:port/database`)
- `AWS_ACCESS_KEY_ID`: MinIO/S3 access key
- `AWS_SECRET_ACCESS_KEY`: MinIO/S3 secret key
- `AWS_ENDPOINT_URL`: MinIO endpoint URL
- Additional dlt-specific environment variables for advanced configuration

## Debugging and Troubleshooting

### Debug Commands

Check Dagster component logs using kubectl:

#### Pod Status and Logs

```bash
# Check Dagster pods status
kubectl get pods -n dagster

# View webserver logs
kubectl logs -n dagster deployment/dagster-dagster-webserver -c dagster-webserver --tail=100

# View daemon logs
kubectl logs -n dagster deployment/dagster-daemon -c dagster-daemon --tail=100

# View user code deployment logs (if using code servers)
kubectl logs -n dagster deployment/dagster-user-code -c dagster --tail=100
```

#### Configuration and Secrets

```bash
# Check workspace configuration
kubectl get configmap dagster-workspace-yaml -n dagster -o yaml

# Check database secret
kubectl describe secret dagster-database-secret -n dagster

# Check environment secrets (if configured)
kubectl describe secret dagster-env-secret -n dagster

# Check OAuth secrets
kubectl describe secret dagster-oauth-secret -n dagster
```

### Common Issues

#### Assets Not Appearing

**Symptoms**: Project deployed but assets not visible in Dagster UI

**Debugging Steps**:

1. Check webserver logs for import errors:

   ```bash
   kubectl logs -n dagster deployment/dagster-dagster-webserver -c dagster-webserver --tail=100 | grep -i error
   ```

2. Verify workspace configuration:

   ```bash
   kubectl get configmap dagster-workspace-yaml -n dagster -o jsonpath='{.data.workspace\.yaml}'
   ```

3. Check project files in PVC:

   ```bash
   WEBSERVER_POD=$(kubectl get pods -n dagster -l component=dagster-webserver -o jsonpath='{.items[0].metadata.name}')
   kubectl exec $WEBSERVER_POD -n dagster -- ls -la /opt/dagster/user-code/
   ```

**Common Causes**:

- Python syntax errors in project files
- Missing `definitions.py` file
- Incorrect module structure
- Project name contains hyphens

#### Asset Execution Failures

**Symptoms**: Assets appear but fail during materialization

**Debugging Steps**:

1. Check daemon logs for execution errors:

   ```bash
   kubectl logs -n dagster deployment/dagster-daemon -c dagster-daemon --tail=100
   ```

2. Check environment variables in webserver:

   ```bash
   WEBSERVER_POD=$(kubectl get pods -n dagster -l component=dagster-webserver -o jsonpath='{.items[0].metadata.name}')
   kubectl exec $WEBSERVER_POD -n dagster -- env | grep -E "(AWS|POSTGRES|DLT)"
   ```

3. Test connectivity from pods:

   ```bash
   # Test MinIO connectivity
   kubectl exec $WEBSERVER_POD -n dagster -- ping minio.minio.svc.cluster.local

   # Test PostgreSQL connectivity
   kubectl exec $WEBSERVER_POD -n dagster -- nc -zv postgres-cluster-rw.postgres 5432
   ```

#### Environment Variables Issues

**Symptoms**: Assets fail with authentication or connection errors

**Debugging Steps**:

1. Verify secret exists and contains data:

   ```bash
   kubectl describe secret dagster-env-secret -n dagster
   ```

2. Check if ExternalSecret is syncing (if using External Secrets):

   ```bash
   kubectl get externalsecret dagster-env-external-secret -n dagster
   kubectl describe externalsecret dagster-env-external-secret -n dagster
   ```

3. Verify environment variables are loaded in pods:

   ```bash
   WEBSERVER_POD=$(kubectl get pods -n dagster -l component=dagster-webserver -o jsonpath='{.items[0].metadata.name}')
   kubectl exec $WEBSERVER_POD -n dagster -- printenv | grep -E "(AWS|POSTGRES|DLT)"
   ```

#### Authentication Issues

**Symptoms**: Cannot access Dagster UI or authentication failures

**Debugging Steps**:

1. Check OAuth2 proxy status:

   ```bash
   kubectl get pods -n dagster -l app=oauth2-proxy
   kubectl logs -n dagster deployment/oauth2-proxy-dagster --tail=100
   ```

2. Verify OAuth client configuration in Keycloak:
   - Ensure client `dagster` exists in the realm
   - Check redirect URIs are correctly configured
   - Verify client secret matches

3. Check OAuth secret:

   ```bash
   kubectl describe secret dagster-oauth-secret -n dagster
   ```

#### Database Connection Issues

**Symptoms**: Database-related errors or connection failures

**Debugging Steps**:

1. Test database connectivity:

   ```bash
   WEBSERVER_POD=$(kubectl get pods -n dagster -l component=dagster-webserver -o jsonpath='{.items[0].metadata.name}')
   kubectl exec $WEBSERVER_POD -n dagster -- python3 -c "
   import os
   import psycopg2
   conn = psycopg2.connect(
       host='postgres-cluster-rw.postgres',
       port=5432,
       database='dagster',
       user=os.getenv('POSTGRES_USER', 'dagster'),
       password=os.getenv('POSTGRES_PASSWORD', '')
   )
   print('Database connection successful')
   conn.close()
   "
   ```

2. Check database secret:

   ```bash
   kubectl describe secret dagster-database-secret -n dagster
   ```

3. Verify database exists:

   ```bash
   just postgres::psql -c "\l" | grep dagster
   ```

### Connection Testing

#### MinIO Connectivity

```bash
# Test MinIO access from Dagster pod
WEBSERVER_POD=$(kubectl get pods -n dagster -l component=dagster-webserver -o jsonpath='{.items[0].metadata.name}')
kubectl exec $WEBSERVER_POD -n dagster -- python3 -c "
import boto3
import os
client = boto3.client('s3',
    endpoint_url=os.getenv('AWS_ENDPOINT_URL'),
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
)
print('Buckets:', [b['Name'] for b in client.list_buckets()['Buckets']])
"
```

### Log Analysis Tips

1. **Filter logs by timestamp**:

   ```bash
   kubectl logs -n dagster deployment/dagster-dagster-webserver --since=10m
   ```

2. **Search for specific errors**:

   ```bash
   kubectl logs -n dagster deployment/dagster-daemon | grep -i "error\|exception\|failed"
   ```

3. **Monitor logs in real-time**:

   ```bash
   kubectl logs -n dagster deployment/dagster-dagster-webserver -f
   ```

4. **Check resource usage**:

   ```bash
   kubectl top pods -n dagster
   ```
