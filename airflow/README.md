# Airflow Documentation

## Overview

This document covers Airflow installation, deployment, and debugging in the buun-stack environment.

## Installation

### Prerequisites

- Kubernetes cluster with buun-stack components
- PostgreSQL database cluster
- MinIO object storage
- External Secrets Operator (optional, for Vault integration)
- JupyterHub (optional, for DAG deployment via web interface)

### Installation Steps

1. **Setup Environment Secrets** (if needed):
   - See Environment Variables Setup section below for configuration options
   - Create ExternalSecret or Secret before installation if you want environment variables available immediately

2. **Install Airflow**:

   ```bash
   # Interactive installation with configuration prompts
   just airflow::install
   ```

3. **Access Airflow Web UI**:
   - Navigate to your Airflow instance (e.g., `https://airflow.buun.dev`)
   - Login with your Keycloak credentials

4. **Assign User Roles** (if needed):

   ```bash
   # Add user role for DAG execution permissions
   just airflow::assign-role <username> airflow_user

   # Available roles:
   # - airflow_admin: Full administrative access
   # - airflow_op: Operator access (can trigger DAGs)
   # - airflow_user: User access (read/write access to DAGs)
   # - airflow_viewer: Viewer access (read-only)
   ```

### Uninstalling

```bash
# Remove Airflow (keeps database by default)
just airflow::uninstall

# Remove Airflow and delete database
just airflow::uninstall true
```

## DAG Deployment

### 1. Access JupyterHub

- Navigate to your JupyterHub instance (e.g., `https://jupyter.buun.dev`)
- Login with your credentials

### 2. Navigate to Airflow DAGs Directory

In JupyterHub, the Airflow DAGs directory is mounted at:

```
/home/jovyan/airflow-dags/
```

### 3. Upload the DAG File

1. Open JupyterHub file browser
2. Navigate to `/home/jovyan/airflow-dags/`
3. Upload or copy `csv_to_postgres_dag.py` to this directory

### 4. Verify Deployment

1. Access Airflow Web UI (e.g., `https://airflow.buun.dev`)
2. Check that the DAG `csv_to_postgres` appears in the DAGs list
3. If the DAG doesn't appear immediately, wait 1-2 minutes for Airflow to detect the new file

## DAG Features

### Tables Processed

- **movies**: MovieLens movies data with primary key `movieId`
- **ratings**: User ratings with composite primary key `[userId, movieId]`
- **tags**: User tags with composite primary key `[userId, movieId, timestamp]`
- **summary**: Generates metadata summary of all processed tables

### Smart Processing

- **Table Existence Check**: Uses DuckDB PostgreSQL scanner to check if tables already exist
- **Skip Logic**: If a table already contains data, the task will skip processing to avoid reprocessing large files
- **Write Disposition**: Uses `replace` mode for initial loads

### Environment Variables Required

The DAG expects the following environment variables to be set:

- `POSTGRES_URL`: PostgreSQL connection string (format: `postgresql://user:password@host:port/database`)
- `AWS_ACCESS_KEY_ID`: MinIO/S3 access key
- `AWS_SECRET_ACCESS_KEY`: MinIO/S3 secret key
- `AWS_ENDPOINT_URL`: MinIO endpoint URL
- Additional dlt-specific environment variables for advanced configuration

### Environment Variables Setup

Environment variables are provided to Airflow through Kubernetes Secrets. You have several options:

#### Option 1: Customize the Example Template

1. Create the example environment secrets template:

   ```bash
   just airflow::create-env-secrets-example
   ```

2. **Important**: This creates a template with sample values. You must customize it:
   - If using **External Secrets**: Edit `airflow-env-external-secret.gomplate.yaml` to reference your actual Vault paths
   - If using **Direct Secrets**: Update the created `airflow-env-secret` with your actual credentials

#### Option 2: Create ExternalSecret Manually

Create an ExternalSecret that references your Vault credentials:

```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: airflow-env-external-secret
  namespace: datastack
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-secret-store
    kind: ClusterSecretStore
  target:
    name: airflow-env-secret
  data:
  - secretKey: AWS_ACCESS_KEY_ID
    remoteRef:
      key: minio/credentials
      property: access_key
  - secretKey: AWS_SECRET_ACCESS_KEY
    remoteRef:
      key: minio/credentials
      property: secret_key
  # Add more variables as needed
```

#### Option 3: Create Kubernetes Secret Directly

```bash
kubectl create secret generic airflow-env-secret -n datastack \
  --from-literal=AWS_ACCESS_KEY_ID="your-access-key" \
  --from-literal=AWS_SECRET_ACCESS_KEY="your-secret-key" \
  --from-literal=AWS_ENDPOINT_URL="http://minio.minio.svc.cluster.local:9000" \
  --from-literal=POSTGRES_URL="postgresql://user:pass@postgres-cluster-rw.postgres:5432"
```

After creating the environment secrets, redeploy Airflow to pick up the new configuration.

### Manual Execution

The DAG is configured for manual execution only (`schedule_interval=None`). To run:

1. Go to Airflow Web UI
2. Find the `csv_to_postgres` DAG
3. Click "Trigger DAG" to start execution

## Example DAGs

### CSV to PostgreSQL DAG

The `csv_to_postgres_dag.py` demonstrates a complete ETL pipeline that loads data from MinIO object storage into PostgreSQL using dlt (data load tool).

#### Dataset Information

##### MovieLens 20M Dataset

This DAG processes the [MovieLens 20M dataset](https://grouplens.org/datasets/movielens/20m/) from GroupLens Research. The dataset contains:

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

The DAG currently processes:

- **movies.csv** (1.3MiB) - Movie metadata
- **tags.csv** (16MiB) - User-generated tags
- **ratings.csv** (509MiB) - User ratings (available but currently disabled in DAG)

#### DAG Features

##### Tables Processed

- **movies**: MovieLens movies data with primary key `movieId`
- **ratings**: User ratings with composite primary key `[userId, movieId]`
- **tags**: User tags with composite primary key `[userId, movieId, timestamp]`
- **summary**: Generates metadata summary of all processed tables

##### Smart Processing

- **Table Existence Check**: Uses DuckDB PostgreSQL scanner to check if tables already exist
- **Skip Logic**: If a table already contains data, the task will skip processing to avoid reprocessing large files
- **Write Disposition**: Uses `replace` mode for initial loads

##### Dependencies

- `dlt[duckdb,filesystem,postgres,s3]>=1.12.1`
- duckdb (for table existence checking)
- Standard Airflow libraries

## Debugging and Troubleshooting

### Debug Commands

The Airflow justfile provides several debugging recipes:

#### DAG Import and Processing Logs

```bash
# Check DAG import errors from processor logs
just airflow::logs-dag-errors

# Check DAG import errors for a specific file
just airflow::logs-dag-errors csv_to_postgres_dag.py

# Test DAG file import manually
just airflow::logs-test-import csv_to_postgres_dag.py

# Monitor DAG processing in real-time
just airflow::logs-dag-processor
```

#### Worker and Task Logs

```bash
# View worker logs (where tasks execute)
just airflow::logs-worker

# View scheduler logs
just airflow::logs-scheduler

# View API server logs (Airflow 3.0)
just airflow::logs-api-server

# View all Airflow component logs
just airflow::logs-all
```

#### Specific Component Debugging

```bash
# Check specific pod logs
kubectl logs -n datastack <pod-name> -c <container-name>

# Examples:
kubectl logs -n datastack airflow-worker-0 -c worker --tail=100
kubectl logs -n datastack airflow-scheduler-xxx -c scheduler --tail=100
kubectl logs -n datastack airflow-dag-processor-xxx -c dag-processor --tail=100
```

### Common Issues

#### DAG Not Appearing

**Symptoms**: DAG file uploaded but not visible in Airflow UI

**Debugging Steps**:

1. Check DAG processor logs:

   ```bash
   just airflow::logs-dag-errors
   ```

2. Test DAG import manually:

   ```bash
   just airflow::logs-test-import your-dag-file.py
   ```

3. Verify file location and permissions:

   ```bash
   kubectl exec -n datastack airflow-dag-processor-xxx -c dag-processor -- ls -la /opt/airflow/dags/
   ```

**Common Causes**:

- Python syntax errors in DAG file
- Missing Python package imports
- Duplicate DAG IDs
- File permissions issues

#### Task Execution Failures

**Symptoms**: DAG appears but tasks fail during execution

**Debugging Steps**:

1. Check worker logs for the specific task:

   ```bash
   just airflow::logs-worker | grep -A 10 -B 10 "task_id"
   ```

2. Check environment variables in worker:

   ```bash
   kubectl exec -n datastack airflow-worker-0 -c worker -- env | grep -E "(AWS|POSTGRES)"
   ```

3. Test connectivity from worker:

   ```bash
   # Test MinIO connectivity
   kubectl exec -n datastack airflow-worker-0 -c worker -- ping minio.minio.svc.cluster.local

   # Test PostgreSQL connectivity
   kubectl exec -n datastack airflow-worker-0 -c worker -- nc -zv postgres-cluster-rw.postgres 5432
   ```

#### Environment Variables Issues

**Symptoms**: Tasks fail with authentication or connection errors

**Debugging Steps**:

1. Verify secret exists and contains data:

   ```bash
   kubectl describe secret airflow-env-secret -n datastack
   ```

2. Check if ExternalSecret is syncing (if using External Secrets):

   ```bash
   kubectl get externalsecret airflow-env-external-secret -n datastack
   kubectl describe externalsecret airflow-env-external-secret -n datastack
   ```

3. Verify environment variables are loaded in pods:

   ```bash
   kubectl exec -n datastack airflow-worker-0 -c worker -- printenv | grep -E "(AWS|POSTGRES|DLT)"
   ```

#### Authentication and Permissions

**Symptoms**: 403 Forbidden errors when triggering DAGs

**Debugging Steps**:

1. Check user roles in Airflow:

   ```bash
   kubectl exec -n datastack airflow-scheduler-xxx -c scheduler -- airflow users list
   ```

2. Assign proper role if needed:

   ```bash
   just airflow::assign-role <username> airflow_user
   ```

3. Check Keycloak client roles:
   - Ensure user has appropriate Keycloak client role
   - Re-login to Airflow to sync roles

#### Package Installation Issues

**Symptoms**: Import errors for packages like `dlt`, `duckdb`

**Debugging Steps**:

1. Check if packages are installed correctly:

   ```bash
   kubectl exec -n datastack airflow-worker-0 -c worker -- pip list | grep -E "(dlt|duckdb)"
   ```

2. Verify init container logs:

   ```bash
   kubectl logs -n datastack airflow-worker-0 -c install-packages
   ```

3. Check PYTHONPATH configuration:

   ```bash
   kubectl exec -n datastack airflow-worker-0 -c worker -- echo $PYTHONPATH
   ```

### Connection Testing

#### MinIO Connectivity

```bash
# Test MinIO access from worker
kubectl exec -n datastack airflow-worker-0 -c worker -- python3 -c "
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
   kubectl logs -n datastack airflow-worker-0 -c worker --since=10m
   ```

2. **Search for specific errors**:

   ```bash
   just airflow::logs-worker | grep -i "error\|exception\|failed"
   ```

3. **Monitor logs in real-time**:

   ```bash
   kubectl logs -n datastack airflow-worker-0 -c worker -f
   ```

4. **Check resource usage**:

   ```bash
   kubectl top pods -n datastack | grep airflow
   ```
