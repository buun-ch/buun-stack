# MinIO

High-performance S3-compatible object storage for Kubernetes:

- **MinIO**: S3-compatible object storage server
- **Keycloak OIDC Integration**: Centralized authentication via OpenID Connect
- **Policy-based Access Control**: Fine-grained permissions using MinIO policies
- **Bucket Management**: Create and manage storage buckets
- **User Management**: Create service accounts with dedicated buckets

## Prerequisites

- Kubernetes cluster (k3s)
- Keycloak (for OIDC authentication)
- External Secrets Operator (optional, for Vault integration)
- Vault (optional, for credential storage)
- Storage provisioner (e.g., Longhorn)

## Installation

```bash
just minio::install
```

You will be prompted for:

1. **MinIO host (FQDN)**: e.g., `minio.example.com` (API endpoint)
2. **MinIO Console host (FQDN)**: e.g., `minio-console.example.com` (Web UI)

### What Gets Installed

1. MinIO server in standalone mode
2. Keycloak OIDC client with `minioPolicy` attribute mapper
3. Root credentials stored in Kubernetes Secret (and optionally Vault)
4. Ingress for both API and Console endpoints
5. Persistent volume for data storage

The stack uses the official [MinIO Helm Chart](https://github.com/minio/minio/tree/master/helm/minio).

## Pod Security Standards

The minio namespace uses **restricted** Pod Security Standard enforcement.

```bash
pod-security.kubernetes.io/enforce=restricted
```

### Security Context

**Pod Security Context**:

- `runAsUser: 1000`
- `runAsGroup: 1000`
- `fsGroup: 1000`
- `fsGroupChangePolicy: OnRootMismatch`
- `seccompProfile.type: RuntimeDefault`

**Container Security Context**:

- `allowPrivilegeEscalation: false`
- `capabilities.drop: [ALL]`
- `runAsNonRoot: true`
- `seccompProfile.type: RuntimeDefault`

**Note**: `readOnlyRootFilesystem: false` is required because MinIO needs to write data and temporary files.

### Init Jobs Security

The `makeUserJob` and `makePolicyJob` init jobs also apply the same restricted security context to comply with Pod Security Standards.

## Access

### Web Console

Access MinIO Console at `https://your-minio-console-host/`

**Authentication**: Login with Keycloak (OIDC)

### Root Credentials

For administrative access:

- Username: Retrieved via `just minio::root-username`
- Password: Retrieved via `just minio::root-password`

### API Endpoint

S3-compatible API: `https://your-minio-host/`

## Configuration

Environment variables (set in `.env.local` or override):

```bash
MINIO_NAMESPACE=minio                        # Kubernetes namespace
MINIO_CHART_VERSION=5.4.0                    # MinIO Helm chart version
MINIO_OIDC_CLIENT_ID=minio                   # Keycloak client ID
MINIO_STORAGE_SIZE=50Gi                      # Persistent volume size
MINIO_HOST=                                  # MinIO API FQDN
MINIO_CONSOLE_HOST=                          # MinIO Console FQDN
KEYCLOAK_REALM=buunstack                     # Keycloak realm
```

## MinIO Client (mc) Setup

The MinIO Client (`mc`) provides a command-line interface for managing MinIO.

### Install mc

```bash
# macOS
brew install minio-mc

# Linux
curl https://dl.min.io/client/mc/release/linux-amd64/mc --create-dirs -o $HOME/bin/mc
chmod +x $HOME/bin/mc
```

### Configure mc Alias

#### For Regular Users (Recommended)

The recommended way to create credentials is through the MinIO Console web UI:

1. **Login to MinIO Console**: Navigate to `https://your-minio-console-host/`
2. **Authenticate with Keycloak**: Click "Login with Keycloak"
3. **Create Access Key**:
   - Go to **User** → **Access Keys**
   - Click **Create access key**
   - Copy the **Access Key** and **Secret Key** (shown only once!)
   - Optionally set expiration and policy restrictions
   - Save these credentials securely

4. **Configure mc alias**:

```bash
mc alias set myminio https://your-minio-host <ACCESS_KEY> <SECRET_KEY>
```

**Note**: Access Keys created via Console are not stored anywhere by the system. Save them immediately when created.

#### For Programmatic Service Accounts

If you created a service account using `just minio::create-user` (for application use), the credentials are automatically stored in Vault:

```bash
# Set up Vault access
export VAULT_ADDR="https://your-vault-host"
just vault::setup-token

# Extract credentials from Vault
ACCESS_KEY=$(vault kv get -mount=secret -field=access_key myuser/minio)
SECRET_KEY=$(vault kv get -mount=secret -field=secret_key myuser/minio)
BUCKET=$(vault kv get -mount=secret -field=bucket myuser/minio)

# Configure mc alias
mc alias set myuser-minio https://your-minio-host ${ACCESS_KEY} ${SECRET_KEY}
```

### Common mc Commands

```bash
# List buckets
mc ls myminio

# Create bucket
mc mb myminio/mybucket

# Upload file
mc cp myfile.txt myminio/mybucket/

# Download file
mc cp myminio/mybucket/myfile.txt ./

# Remove file
mc rm myminio/mybucket/myfile.txt

# List files in bucket
mc ls myminio/mybucket

# Copy directory recursively
mc cp --recursive mydir/ myminio/mybucket/mydir/

# Set bucket policy (public read)
mc anonymous set download myminio/mybucket

# Set bucket policy (private)
mc anonymous set none myminio/mybucket

# Mirror local directory to bucket
mc mirror localdir/ myminio/mybucket/

# Get bucket versioning status
mc version info myminio/mybucket

# Enable bucket versioning
mc version enable myminio/mybucket
```

## Bucket Management

### Create Bucket

Using Just recipes:

```bash
just minio::create-bucket mybucket
```

Using mc:

```bash
mc mb myminio/mybucket
```

### Check if Bucket Exists

```bash
just minio::bucket-exists mybucket
```

This returns exit code 0 if the bucket exists, 1 otherwise.

## User Management

### Create MinIO User

Create a MinIO user with dedicated bucket:

```bash
just minio::create-user user=myuser bucket=mybucket
```

This will:

1. Generate access key and secret key
2. Create the bucket
3. Create MinIO user with readwrite policy
4. Store credentials in Vault (if External Secrets is available)

**Interactive mode** (prompts for username):

```bash
just minio::create-user
```

The bucket defaults to `{username}-storage` if not specified.

### Get Service Account Credentials

For programmatically created service accounts (via `just minio::create-user`), retrieve credentials from Vault:

```bash
# Set up Vault access
export VAULT_ADDR="https://your-vault-host"
just vault::setup-token

# Get all stored information
vault kv get -mount=secret myuser/minio

# Or get specific fields
vault kv get -mount=secret -field=access_key myuser/minio
vault kv get -mount=secret -field=secret_key myuser/minio
vault kv get -mount=secret -field=bucket myuser/minio
vault kv get -mount=secret -field=endpoint myuser/minio
```

**Note**: Regular user Access Keys created via MinIO Console are not stored in Vault.

### Grant Policy to User

Change user permissions:

```bash
just minio::grant-policy user=myuser policy=readonly
```

Available policies:

- `readwrite`: Full read and write access
- `readonly`: Read-only access
- `writeonly`: Write-only access

## OIDC Authentication

MinIO uses Keycloak for web console authentication via OIDC.

### MinIO Policy Claim

Users authenticate via Keycloak and receive MinIO policies based on the `minioPolicy` user attribute.

**Default Policy**: `readwrite`

**Available Policies**:

- `readwrite`: Full access
- `readonly`: Read-only access
- `writeonly`: Write-only access

### Set User Policy via Keycloak

The `minioPolicy` attribute is automatically added to users upon client creation. To modify:

1. Login to Keycloak Admin Console
2. Navigate to Users → Select User → Attributes
3. Set `minioPolicy` to desired policy (e.g., `readonly`)

## Admin Operations

### List Policies and Users

Debug information about MinIO internal state:

```bash
just minio::debug-info
```

This shows:

- All MinIO policies
- All MinIO users

### Using mc Admin Commands

```bash
# List users
mc admin user list myminio

# List policies
mc admin policy list myminio

# Create policy from file
mc admin policy create myminio mypolicy /path/to/policy.json

# Attach policy to user
mc admin policy attach myminio mypolicy --user=myuser

# Server info
mc admin info myminio

# Server stats
mc admin top locks myminio
```

## S3 API Usage

### AWS CLI

Configure AWS CLI to use MinIO:

```bash
# Configure profile
aws configure --profile minio
# Enter:
# - AWS Access Key ID: (MinIO access key)
# - AWS Secret Access Key: (MinIO secret key)
# - Region: us-east-1 (default)
# - Output format: json

# Use with custom endpoint
aws --profile minio --endpoint-url https://your-minio-host s3 ls

# List buckets
aws --profile minio --endpoint-url https://your-minio-host s3 ls

# Upload file
aws --profile minio --endpoint-url https://your-minio-host \
  s3 cp myfile.txt s3://mybucket/

# Download file
aws --profile minio --endpoint-url https://your-minio-host \
  s3 cp s3://mybucket/myfile.txt ./
```

### Python (boto3)

```python
import boto3

s3 = boto3.client(
    's3',
    endpoint_url='https://your-minio-host',
    aws_access_key_id='your-access-key',
    aws_secret_access_key='your-secret-key',
    region_name='us-east-1'
)

# List buckets
response = s3.list_buckets()
for bucket in response['Buckets']:
    print(bucket['Name'])

# Upload file
s3.upload_file('myfile.txt', 'mybucket', 'myfile.txt')

# Download file
s3.download_file('mybucket', 'myfile.txt', 'downloaded.txt')
```

### Environment Variables for Applications

```bash
# S3-compatible endpoint
AWS_ENDPOINT_URL=https://your-minio-host

# Or service-internal endpoint (from pods)
AWS_ENDPOINT_URL=http://minio.minio.svc.cluster.local:9000

# Credentials
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1

# MinIO-specific (some libraries)
MINIO_ENDPOINT=your-minio-host
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET=mybucket
```

## Integration Patterns

### Application with Dedicated Bucket

1. **Create MinIO service account and bucket**:

   ```bash
   just minio::create-user user=myapp
   ```

   This will output the credentials and store them in Vault (if External Secrets is available).

2. **Get credentials from Vault** (if needed later):

   ```bash
   # Set up Vault access
   export VAULT_ADDR="https://your-vault-host"
   just vault::setup-token

   # Get credentials
   ACCESS_KEY=$(vault kv get -mount=secret -field=access_key myapp/minio)
   SECRET_KEY=$(vault kv get -mount=secret -field=secret_key myapp/minio)
   BUCKET=$(vault kv get -mount=secret -field=bucket myapp/minio)
   ```

3. **Create Kubernetes Secret** (if not using External Secrets):

   ```bash
   kubectl create secret generic myapp-minio -n myapp \
     --from-literal=access-key=myapp \
     --from-literal=secret-key=<generated-secret> \
     --from-literal=bucket=myapp-storage \
     --from-literal=endpoint=http://minio.minio.svc.cluster.local:9000
   ```

4. **Mount in application**:

   ```yaml
   env:
     - name: AWS_ACCESS_KEY_ID
       valueFrom:
         secretKeyRef:
           name: myapp-minio
           key: access-key
     - name: AWS_SECRET_ACCESS_KEY
       valueFrom:
         secretKeyRef:
           name: myapp-minio
           key: secret-key
     - name: AWS_ENDPOINT_URL
       valueFrom:
         secretKeyRef:
           name: myapp-minio
           key: endpoint
     - name: S3_BUCKET
       valueFrom:
         secretKeyRef:
           name: myapp-minio
           key: bucket
   ```

### External Secrets Integration

If using External Secrets Operator:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: myapp-minio
  namespace: myapp
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: myapp-minio
    creationPolicy: Owner
  data:
    - secretKey: access-key
      remoteRef:
        key: myapp/minio
        property: access_key
    - secretKey: secret-key
      remoteRef:
        key: myapp/minio
        property: secret_key
    - secretKey: bucket
      remoteRef:
        key: myapp/minio
        property: bucket
    - secretKey: endpoint
      remoteRef:
        key: myapp/minio
        property: endpoint
```

## Troubleshooting

### Check MinIO Pod Status

```bash
kubectl get pods -n minio
```

### View MinIO Logs

```bash
kubectl logs -n minio deploy/minio
```

### Test S3 Connectivity

```bash
# From inside cluster
kubectl run -it --rm debug --image=minio/mc --restart=Never -- \
  mc alias set test http://minio.minio.svc.cluster.local:9000 \
    $(just minio::root-username) \
    $(just minio::root-password)

kubectl run -it --rm debug --image=minio/mc --restart=Never -- \
  mc ls test
```

### Check OIDC Configuration

```bash
# Verify Keycloak client
just keycloak::get-client buunstack minio

# Check MinIO environment
kubectl get deployment minio -n minio -o jsonpath='{.spec.template.spec.containers[0].env}' | jq
```

### Reset Root Credentials

```bash
# Delete existing secret
kubectl delete secret minio -n minio

# Recreate credentials
just minio::create-root-credentials
```

### Verify Bucket Permissions

```bash
# List bucket policy
mc anonymous list myminio/mybucket

# Check user policy
mc admin policy info myminio readwrite
```

## Management

### Uninstall MinIO

```bash
just minio::uninstall
```

This removes:

- MinIO deployment
- MinIO namespace
- Keycloak client
- **Note**: PersistentVolumeClaim is also deleted, losing all data

### Backup Before Uninstall

```bash
# Mirror all buckets to local directory
mc mirror myminio/ ./minio-backup/

# Or use specific bucket
mc mirror myminio/important-bucket/ ./backup/
```

## References

- [MinIO Documentation](https://min.io/docs/minio/linux/index.html)
- [MinIO Client (mc) Guide](https://min.io/docs/minio/linux/reference/minio-mc.html)
- [MinIO Helm Chart](https://github.com/minio/minio/tree/master/helm/minio)
- [MinIO OIDC Identity Management](https://min.io/docs/minio/linux/operations/external-iam/configure-openid-external-identity-management.html)
- [S3 API Reference](https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html)
- [Resource Management Best Practices](../docs/resource-management.md)
