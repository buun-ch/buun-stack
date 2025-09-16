# CSV to PostgreSQL Airflow DAG Deployment

## Overview

This document describes how to deploy the `csv_to_postgres_dag.py` to Airflow using JupyterHub interface. The DAG processes MovieLens dataset files stored in MinIO and loads them into PostgreSQL.

## Dataset Information

### MovieLens 20M Dataset

This DAG processes the [MovieLens 20M dataset](https://grouplens.org/datasets/movielens/20m/) from GroupLens Research. The dataset contains:

- **27,278 movies** with metadata
- **20 million ratings** from 138,493 users
- **465,564 tags** applied by users
- Additional genome data for content-based filtering

### MinIO Storage Structure

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

## Deployment Steps

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

## Dependencies

- dlt[duckdb,filesystem,postgres,s3]>=1.12.1
- duckdb (for table existence checking)
- Standard Airflow libraries

## Troubleshooting

### DAG Not Appearing

- Check file permissions in `/home/jovyan/airflow-dags/`
- Verify the Python syntax is correct
- Check Airflow logs for import errors

### Environment Variables

- Ensure the `airflow-env-secret` Kubernetes Secret exists in the datastack namespace
- Verify secret contains all required environment variables:

  ```bash
  kubectl describe secret airflow-env-secret -n datastack
  ```

- If using External Secrets, check that the ExternalSecret is syncing properly:

  ```bash
  kubectl get externalsecret airflow-env-external-secret -n datastack
  ```

### Connection Issues

- Verify MinIO and PostgreSQL connectivity from Airflow workers
- Check that the `movielens_af` database exists in PostgreSQL
- Ensure MinIO bucket `movie-lens` is accessible with proper credentials
