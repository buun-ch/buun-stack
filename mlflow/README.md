# MLflow

Open source platform for managing the end-to-end machine learning lifecycle with Keycloak OIDC authentication.

## Overview

This module deploys MLflow using the Community Charts Helm chart with:

- **Keycloak OIDC authentication** for user login
- **Custom Docker image** with mlflow-oidc-auth plugin
- **PostgreSQL backend** for tracking server and auth databases
- **MinIO/S3 artifact storage** with proxied access
- **FastAPI/ASGI server** with Uvicorn for production
- **HTTPS reverse proxy support** via Traefik
- **Group-based access control** via Keycloak groups
- **Prometheus metrics** for monitoring

## Prerequisites

- Kubernetes cluster (k3s)
- Keycloak installed and configured
- PostgreSQL cluster (CloudNativePG)
- MinIO object storage
- External Secrets Operator (optional, for Vault integration)
- Docker registry (local or remote)

## Installation

### Basic Installation

1. **Build and Push Custom MLflow Image**:

   Set `DOCKER_HOST` to your remote Docker host (where k3s is running):

   ```bash
   export DOCKER_HOST=ssh://yourhost.com
   just mlflow::build-and-push-image
   ```

   This builds a custom MLflow image with OIDC auth plugin and pushes it to your k3s registry.

2. **Install MLflow**:

   ```bash
   just mlflow::install
   ```

   You will be prompted for:

   - **MLflow host (FQDN)**: e.g., `mlflow.example.com`

### What Gets Installed

- MLflow tracking server (FastAPI with OIDC)
- PostgreSQL databases:
    - `mlflow` - Experiment tracking, models, and runs
    - `mlflow_auth` - User authentication and permissions
- PostgreSQL user `mlflow` with access to both databases
- MinIO bucket `mlflow` for artifact storage
- Custom MLflow Docker image with OIDC auth plugin
- Keycloak OAuth client (confidential client)
- Keycloak groups:
    - `mlflow-admins` - Full administrative access
    - `mlflow-users` - Basic user access

## Configuration

### Docker Build Environment

For building and pushing the custom MLflow image:

```bash
DOCKER_HOST=ssh://yourhost.com             # Remote Docker host (where k3s is running)
IMAGE_REGISTRY=localhost:30500             # k3s local registry
```

### Deployment Configuration

Environment variables (set in `.env.local` or override):

```bash
MLFLOW_NAMESPACE=mlflow                    # Kubernetes namespace
MLFLOW_CHART_VERSION=1.8.0                 # Helm chart version
MLFLOW_HOST=mlflow.example.com             # External hostname
MLFLOW_IMAGE_TAG=3.6.0-oidc                # Custom image tag
MLFLOW_IMAGE_PULL_POLICY=IfNotPresent     # Image pull policy
KEYCLOAK_HOST=auth.example.com             # Keycloak hostname
KEYCLOAK_REALM=buunstack                   # Keycloak realm name
```

### Architecture Notes

**MLflow 3.6.0 with OIDC**:

- Uses `mlflow-oidc-auth[full]==5.6.1` plugin
- FastAPI/ASGI server with Uvicorn (not Gunicorn)
- Server type: `oidc-auth-fastapi` for ASGI compatibility
- Session management: `cachelib` with filesystem backend
- Custom Docker image built from `burakince/mlflow:3.6.0`

**Authentication Flow**:

- OIDC Discovery: `/.well-known/openid-configuration`
- Redirect URI: `/callback` (not `/oidc/callback`)
- Required scopes: `openid profile email groups`
- Group attribute: `groups` from UserInfo

**Database Structure**:

- `mlflow` database: Experiment tracking, models, parameters, metrics
- `mlflow_auth` database: User accounts, groups, permissions

## Usage

### Access MLflow

1. Navigate to `https://your-mlflow-host/`
2. Click "Keycloak" button to authenticate
3. After successful login:
   - First redirect: Permissions Management UI (`/oidc/ui/`)
   - Click "MLflow" button: Main MLflow UI

### Grant Admin Access

Add users to the `mlflow-admins` group:

```bash
just keycloak::add-user-to-group <username> mlflow-admins
```

Admin users have full privileges including:

- Experiment and model management
- User and permission management
- Access to all experiments and models

### Log Experiments

#### Using Python Client

```python
import mlflow

# Set tracking URI
mlflow.set_tracking_uri("https://mlflow.example.com")

# Start experiment
mlflow.set_experiment("my-experiment")

# Log parameters, metrics, and artifacts
with mlflow.start_run():
    mlflow.log_param("learning_rate", 0.01)
    mlflow.log_metric("accuracy", 0.95)
    mlflow.log_artifact("model.pkl")
```

#### Authentication for API Access

For programmatic access (Python scripts, notebooks, CI/CD), you need to create an access key.

**Step 1: Create Access Key via Web UI**

1. Navigate to `https://your-mlflow-host/` and log in via Keycloak
2. You will be redirected to the MLflow Permission Manager UI
3. Click the **"Create access key"** button at the top of the page
4. In the dialog that appears:
   - Select an expiration date (maximum 1 year from today)
   - Click **"Request Token"**
5. Copy the generated access key from the "Access Key" field
6. Store it securely (you won't be able to retrieve it again)

**Step 2: Use Access Key in Python**

Set the access key as an environment variable or in your Python code:

```python
import os
import mlflow

# Method 1: Set environment variable (recommended)
os.environ["MLFLOW_TRACKING_TOKEN"] = "your-access-key-here"
os.environ["MLFLOW_TRACKING_URI"] = "https://mlflow.example.com"

# Method 2: Set tracking URI directly
mlflow.set_tracking_uri("https://mlflow.example.com")

# Now you can use MLflow client
mlflow.set_experiment("my-experiment")

with mlflow.start_run():
    mlflow.log_param("alpha", 0.5)
    mlflow.log_metric("rmse", 0.786)
```

**Complete Example**

```python
import os
import mlflow
import mlflow.sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

# Configure MLflow
os.environ["MLFLOW_TRACKING_TOKEN"] = "your-access-key-here"
mlflow.set_tracking_uri("https://mlflow.example.com")
mlflow.set_experiment("iris-classification")

# Load data
X, y = load_iris(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# Train and log model
with mlflow.start_run():
    # Log parameters
    n_estimators = 100
    max_depth = 5
    mlflow.log_param("n_estimators", n_estimators)
    mlflow.log_param("max_depth", max_depth)

    # Train model
    clf = RandomForestClassifier(n_estimators=n_estimators, max_depth=max_depth)
    clf.fit(X_train, y_train)

    # Log metrics
    y_pred = clf.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    mlflow.log_metric("accuracy", accuracy)

    # Log model
    mlflow.sklearn.log_model(clf, "model")

    print(f"Model logged with accuracy: {accuracy}")
```

**Using .env File (Recommended)**

Create a `.env` file in your project:

```bash
MLFLOW_TRACKING_URI=https://mlflow.example.com
MLFLOW_TRACKING_TOKEN=your-access-key-here
```

Load it in your Python code:

```python
from dotenv import load_dotenv
import mlflow

load_dotenv()  # Loads MLFLOW_TRACKING_URI and MLFLOW_TRACKING_TOKEN

mlflow.set_experiment("my-experiment")
with mlflow.start_run():
    mlflow.log_param("param1", 5)
```

**Important Notes**

- Access keys have an expiration date (max 1 year)
- Store access keys securely (use environment variables or secret management)
- Never commit access keys to version control
- Each user should create their own access key
- Expired keys need to be regenerated via the Web UI

### Model Registry

Register and manage models:

```python
# Register model
mlflow.register_model(
    model_uri="runs:/<run-id>/model",
    name="my-model"
)

# Transition model stage
from mlflow.tracking import MlflowClient
client = MlflowClient()
client.transition_model_version_stage(
    name="my-model",
    version=1,
    stage="Production"
)
```

## Features

- **Experiment Tracking**: Log parameters, metrics, and artifacts
- **Model Registry**: Version and manage ML models
- **Model Serving**: Deploy models as REST APIs
- **Project Reproducibility**: Package code, data, and environment
- **Remote Execution**: Run experiments on remote platforms
- **UI Dashboard**: Visual experiment comparison and analysis
- **LLM Tracking**: Track LLM applications with traces
- **Prompt Registry**: Manage and version prompts

## Architecture

```plain
External Users
      ↓
Cloudflare Tunnel (HTTPS)
      ↓
Traefik Ingress (HTTPS)
      ↓
MLflow Server (HTTP inside cluster)
  ├─ FastAPI/ASGI (Uvicorn)
  ├─ mlflow-oidc-auth plugin
  │   ├─ OAuth → Keycloak (authentication)
  │   └─ Session → FileSystemCache
  ├─ PostgreSQL (metadata)
  │   ├─ mlflow (tracking)
  │   └─ mlflow_auth (users/groups)
  └─ MinIO (artifacts via proxied access)
```

**Key Components**:

- **Server Type**: `oidc-auth-fastapi` for FastAPI/ASGI compatibility
- **Allowed Hosts**: Validates `Host` header for security
- **Session Backend**: Cachelib with filesystem storage
- **Artifact Storage**: Proxied through MLflow server (no direct S3 access needed)

## Authentication

### User Login (OIDC)

- Users authenticate via Keycloak
- Standard OIDC flow with Authorization Code grant
- Group membership retrieved from `groups` claim in UserInfo
- Users automatically created on first login

### Access Control

**Group-based Permissions**:

```python
OIDC_ADMIN_GROUP_NAME = "mlflow-admins"
OIDC_GROUP_NAME = "mlflow-admins,mlflow-users"
```

**Default Permissions**:

- New resources: `MANAGE` permission for creator
- Admins: Full access to all resources
- Users: Access based on explicit permissions

### Permission Management

Access the Permissions UI at `/oidc/ui/`:

- View and manage user permissions
- Assign permissions to experiments, models, and prompts
- Create and manage groups
- View audit logs

## Management

### Rebuild Custom Image

If you need to update the custom MLflow image:

```bash
export DOCKER_HOST=ssh://yourhost.com
just mlflow::build-and-push-image
```

After rebuilding, restart MLflow to use the new image:

```bash
kubectl rollout restart deployment/mlflow -n mlflow
```

### Upgrade MLflow

```bash
just mlflow::upgrade
```

Updates the Helm deployment with current configuration.

### Uninstall

```bash
# Keep PostgreSQL databases
just mlflow::uninstall false

# Delete PostgreSQL databases and user
just mlflow::uninstall true
```

### Clean Up All Resources

```bash
just mlflow::cleanup
```

Deletes databases, users, secrets, and Keycloak client (with confirmation).

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n mlflow
```

Expected pods:

- `mlflow-*` - Main application (1 replica)
- `mlflow-db-migration-*` - Database migration (Completed)
- `mlflow-dbchecker-*` - Database connection check (Completed)

### OAuth Login Fails

#### Redirect Loop (Returns to Login Page)

**Symptoms**: User authenticates with Keycloak but returns to login page

**Common Causes**:

1. **Redirect URI Mismatch**:
   - Check Keycloak client redirect URI matches `/callback`
   - Verify `OIDC_REDIRECT_URI` is `https://{host}/callback`

2. **Missing Groups Scope**:
   - Ensure `groups` scope is added to Keycloak client
   - Check groups mapper is configured in Keycloak

3. **Group Membership**:
   - User must be in `mlflow-admins` or `mlflow-users` group
   - Add user to group: `just keycloak::add-user-to-group <user> mlflow-admins`

#### Session Errors

**Error**: `Session module for filesystem could not be imported`

**Solution**: Ensure session configuration is correct:

```yaml
SESSION_TYPE: "cachelib"
SESSION_CACHE_DIR: "/tmp/session"
```

#### Group Detection Errors

**Error**: `Group detection error: No module named 'oidc'`

**Solution**: Remove `OIDC_GROUP_DETECTION_PLUGIN` setting (should be unset or removed)

### Server Type Errors

**Error**: `TypeError: Flask.__call__() missing 1 required positional argument: 'start_response'`

**Cause**: Using Flask server type with Uvicorn (ASGI)

**Solution**: Ensure `appName: "oidc-auth-fastapi"` in values

### Database Connection Issues

Check database credentials:

```bash
kubectl get secret mlflow-db-secret -n mlflow -o yaml
```

Test database connectivity:

```bash
kubectl exec -n mlflow deployment/mlflow -- \
  psql -h postgres-cluster-rw.postgres -U mlflow -d mlflow -c "SELECT 1"
```

### Artifact Storage Issues

Check MinIO credentials:

```bash
kubectl get secret mlflow-s3-secret -n mlflow -o yaml
```

Test MinIO connectivity:

```bash
kubectl exec -n mlflow deployment/mlflow -- \
  python -c "import boto3; import os; \
  client = boto3.client('s3', \
    endpoint_url=os.getenv('MLFLOW_S3_ENDPOINT_URL'), \
    aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'), \
    aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')); \
  print(client.list_buckets())"
```

### Check Logs

```bash
# Application logs
kubectl logs -n mlflow deployment/mlflow --tail=100

# Database migration logs
kubectl logs -n mlflow job/mlflow-db-migration

# Real-time logs
kubectl logs -n mlflow deployment/mlflow -f
```

### Common Log Messages

**Normal**:

- `Successfully created FastAPI app with OIDC integration`
- `OIDC routes, authentication, and UI should now be available`
- `Session module for cachelib imported`
- `Redirect URI for OIDC login: https://{host}/callback`

**Issues**:

- `Group detection error` - Check OIDC configuration
- `Authorization error: User is not allowed to login` - User not in required group
- `Session error` - Session configuration issue

### Image Build Issues

If custom image build fails:

```bash
# Set Docker host
export DOCKER_HOST=ssh://yourhost.com

# Rebuild image manually
cd /path/to/buun-stack/mlflow
just mlflow::build-and-push-image

# Check image exists on remote host
docker images localhost:30500/mlflow:3.6.0-oidc

# Test image on remote host
docker run --rm localhost:30500/mlflow:3.6.0-oidc mlflow --version
```

**Note**: All Docker commands run on the remote host specified by `DOCKER_HOST`.

## Custom Image

### Dockerfile

Located at `mlflow/image/Dockerfile`:

```dockerfile
FROM burakince/mlflow:3.6.0

# Install mlflow-oidc-auth plugin with filesystem session support
RUN pip install --no-cache-dir \
    mlflow-oidc-auth[full]==5.6.1 \
    cachelib[filesystem]
```

### Building Custom Image

**Important**: Set `DOCKER_HOST` to build on the remote k3s host:

```bash
export DOCKER_HOST=ssh://yourhost.com

just mlflow::build-image          # Build only
just mlflow::push-image            # Push only (requires prior build)
just mlflow::build-and-push-image  # Build and push
```

The image is built on the remote Docker host and pushed to the k3s local registry (`localhost:30500`).

## References

- [MLflow Documentation](https://mlflow.org/docs/latest/index.html)
- [MLflow GitHub](https://github.com/mlflow/mlflow)
- [mlflow-oidc-auth Plugin](https://github.com/mlflow-oidc/mlflow-oidc-auth)
- [mlflow-oidc-auth Documentation](https://mlflow-oidc.github.io/mlflow-oidc-auth/)
- [Community Charts MLflow](https://github.com/community-charts/helm-charts/tree/main/charts/mlflow)
- [Keycloak OIDC](https://www.keycloak.org/docs/latest/securing_apps/#_oidc)
