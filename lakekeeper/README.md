# Lakekeeper

Apache Iceberg REST Catalog implementation for managing data lake tables:

- **Iceberg REST Catalog**: Complete Apache Iceberg REST specification implementation
- **OIDC Authentication**: Integrated with Keycloak for secure access via PKCE flow
- **PostgreSQL Backend**: Reliable metadata storage with automatic migrations
- **Web UI**: Built-in web interface for catalog management
- **Secrets Management**: Vault/External Secrets integration for secure credentials
- **Multi-table Format**: Primarily designed for Apache Iceberg with extensibility

## Installation

```bash
just lakekeeper::install
```

During installation, you will be prompted for:

- **Lakekeeper host (FQDN)**: The domain name for accessing Lakekeeper (e.g., `lakekeeper.yourdomain.com`)

The installation automatically:

- Creates PostgreSQL database and user
- Stores credentials in Vault (if External Secrets is available) or Kubernetes Secrets
- Creates Keycloak OIDC client with PKCE flow for Web UI authentication
- Creates API client (`lakekeeper-api`) for programmatic access with OAuth2 Client Credentials Flow
- Configures audience mapper for JWT tokens
- Runs database migrations
- Configures Traefik ingress with TLS

**IMPORTANT**: During installation, API client credentials will be displayed. Save these for programmatic access (dlt, PyIceberg, etc.).

## Access

Access Lakekeeper at `https://lakekeeper.yourdomain.com` and authenticate via Keycloak.

## Warehouse Management

### Creating Warehouses with Vended Credentials

Create warehouses with STS (Security Token Service) enabled for automatic temporary credential management:

```bash
# Create warehouse with default name and bucket
just lakekeeper::create-warehouse <warehouse-name> <bucket-name>

# Example: Create 'production' warehouse using 'warehouse' bucket
just lakekeeper::create-warehouse production warehouse
```

This creates a warehouse with:

- **STS enabled** for vended credentials (temporary S3 tokens)
- **S3-compatible storage** (MinIO) with path-style access
- **Automatic credential rotation** via MinIO STS

**Prerequisites**:

- MinIO bucket must exist (create with `just minio::create-bucket <bucket-name>`)
- API client credentials must be available in Vault

**Benefits of Vended Credentials**:

- No need to distribute static S3 credentials to clients
- Automatic credential expiration and rotation
- Better security through temporary tokens
- Centralized credential management

### Creating Namespaces

Namespaces organize tables within a warehouse (similar to databases in traditional systems):

```bash
# Create Iceberg namespace in a warehouse
just lakekeeper::create-warehouse-namespace <warehouse-name> <namespace>

# Example: Create 'ecommerce' namespace in 'test' warehouse
just lakekeeper::create-warehouse-namespace test ecommerce
```

### Managing Warehouses

List, view, and delete warehouses:

```bash
# List all warehouses
just lakekeeper::list-warehouses

# List all namespaces in a warehouse
just lakekeeper::list-warehouse-namespaces <warehouse-name>

# Example: List namespaces in 'test' warehouse
just lakekeeper::list-warehouse-namespaces test

# Delete a namespace from a warehouse (recursively deletes all tables)
just lakekeeper::delete-warehouse-namespace <warehouse-name> <namespace>

# Example: Delete 'ecommerce' namespace from 'test' warehouse (including all tables)
just lakekeeper::delete-warehouse-namespace test ecommerce

# Delete a warehouse (must be empty)
just lakekeeper::delete-warehouse <warehouse-name>

# Force delete a warehouse (automatically deletes all namespaces first)
just lakekeeper::delete-warehouse <warehouse-name> true

# Example: Force delete 'test' warehouse with all its namespaces
just lakekeeper::delete-warehouse test true
```

**Important Notes**:

- Namespace deletion is **recursive** - it will delete all tables and data within the namespace
- Warehouses must be empty before deletion. If a warehouse contains namespaces, you must either:
  1. Delete each namespace individually using `delete-warehouse-namespace`, then delete the warehouse
  2. Use force deletion (`delete-warehouse <name> true`) to automatically delete all namespaces and their tables first
- All deletion operations require confirmation prompts to prevent accidental data loss

## Programmatic Access

### API Client Credentials

During installation, a default API client `lakekeeper-api` is automatically created for programmatic access (dlt, Python scripts, etc.).

**IMPORTANT**: The client ID and secret are displayed during installation. Save these credentials securely.

If you need additional API clients or lost the credentials:

```bash
# Create additional API client with custom name
just lakekeeper::create-oidc-api-client my-app

# Recreate default client (delete first, then create)
just lakekeeper::delete-oidc-api-client lakekeeper-api
just lakekeeper::create-oidc-api-client lakekeeper-api
```

Each API client has:

- **Service account enabled** for OAuth2 Client Credentials Flow
- **`lakekeeper` scope** with audience mapper (`aud: lakekeeper`)
- **Client credentials** stored in Vault (if External Secrets is available)

### Using API Clients

#### dlt (Data Load Tool)

Configure dlt to use the API client credentials:

```bash
export OIDC_CLIENT_ID=lakekeeper-api
export OIDC_CLIENT_SECRET=<secret-from-creation>
export ICEBERG_CATALOG_URL=http://lakekeeper.lakekeeper.svc.cluster.local:8181/catalog
export ICEBERG_WAREHOUSE=test  # Use warehouse with vended credentials enabled
export KEYCLOAK_TOKEN_URL=https://auth.example.com/realms/buunstack/protocol/openid-connect/token
export OAUTH2_SCOPE=lakekeeper  # Optional, defaults to "lakekeeper"
```

The dlt Iceberg REST destination automatically uses these credentials for OAuth2 authentication and receives temporary S3 credentials via STS (vended credentials).

**Notes**:

- `KEYCLOAK_TOKEN_URL` is required because Lakekeeper v0.9.x uses external OAuth2 provider (Keycloak) instead of the deprecated `/v1/oauth/tokens` endpoint.
- `OAUTH2_SCOPE` must be set to `lakekeeper` (default) to include the audience claim in JWT tokens. PyIceberg defaults to `catalog` scope, which is not valid for Keycloak.
- **No S3 credentials needed** when using warehouses with vended credentials enabled (STS). Lakekeeper provides temporary S3 credentials automatically.

#### Legacy Mode: Static S3 Credentials

If using a warehouse with `vended-credentials-enabled=false`, you need to provide static S3 credentials:

```bash
# Additional environment variables for static credentials mode
export S3_ENDPOINT_URL=http://minio.minio.svc.cluster.local:9000
export S3_ACCESS_KEY_ID=<minio-access-key>
export S3_SECRET_ACCESS_KEY=<minio-secret-key>
```

To get MinIO credentials:

```bash
just vault::get minio/dlt access_key
just vault::get minio/dlt secret_key
```

Or create a dedicated MinIO user:

```bash
just minio::create-user dlt "dlt-data"
```

#### PyIceberg

With vended credentials (recommended):

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog(
    "rest_catalog",
    **{
        "uri": "http://lakekeeper.lakekeeper.svc.cluster.local:8181/catalog",
        "warehouse": "test",  # Use warehouse with vended credentials enabled
        "credential": f"{client_id}:{client_secret}",  # OAuth2 format
        "oauth2-server-uri": "https://auth.example.com/realms/buunstack/protocol/openid-connect/token",
        "scope": "lakekeeper",  # Required for Keycloak (PyIceberg defaults to "catalog")
    }
)
```

With static S3 credentials (legacy mode):

```python
catalog = load_catalog(
    "rest_catalog",
    **{
        "uri": "http://lakekeeper.lakekeeper.svc.cluster.local:8181/catalog",
        "warehouse": "default",
        "credential": f"{client_id}:{client_secret}",
        "oauth2-server-uri": "https://auth.example.com/realms/buunstack/protocol/openid-connect/token",
        "scope": "lakekeeper",
        # Static S3 credentials (only needed when vended credentials disabled)
        "s3.endpoint": "http://minio.minio.svc.cluster.local:9000",
        "s3.access-key-id": "<minio-access-key>",
        "s3.secret-access-key": "<minio-secret-key>",
        "s3.path-style-access": "true",
    }
)
```

#### Trino Integration

Trino uses the `lakekeeper-api` OIDC client to authenticate with Lakekeeper via OAuth2 Client Credentials Flow. The `lakekeeper-api` client is automatically created during Lakekeeper installation and is shared by all applications that need programmatic access to Lakekeeper.

### Deleting API Clients

```bash
# Delete default API client
just lakekeeper::delete-oidc-api-client

# Delete custom-named client
just lakekeeper::delete-oidc-api-client my-app
```

This removes the Keycloak client and Vault credentials.

## Cleanup

To remove all Lakekeeper resources and secrets from Vault:

```bash
just lakekeeper::cleanup
```

This will prompt for confirmation before deleting:

- PostgreSQL database
- Vault secrets
- Keycloak client

## Uninstallation

```bash
# Keep database
just lakekeeper::uninstall false

# Delete database as well
just lakekeeper::uninstall true
```

This will:

- Uninstall the Lakekeeper Helm release
- Delete Kubernetes secrets
- Optionally delete PostgreSQL database
- Remove Keycloak OIDC client

## Troubleshooting

### Error: "Project not found" when creating warehouse

**Symptom:**

```bash
just lakekeeper::create-warehouse default warehouse
# Error: Failed to create warehouse (HTTP 404)
# Response: {"error":{"message":"Project not found","type":"ProjectNotFound","code":404}}
```

**Cause:**

Lakekeeper requires **bootstrap** before creating warehouses. Bootstrap initializes the system by:

- Setting the initial administrator
- Creating the first project

Warehouses must be created under a project. Without bootstrap, no project exists.

**Solution:**

Bootstrap Lakekeeper via Web UI:

1. Access `https://<LAKEKEEPER_HOST>/ui/`
2. Authenticate with Keycloak (use your OIDC user credentials)
3. Follow the bootstrap wizard to:
   - Accept terms of use
   - Set initial administrator
   - Create the first project

**Verify Bootstrap Status:**

Access the Web UI at `https://<LAKEKEEPER_HOST>/ui/`:

- If bootstrap is **not complete**: Bootstrap wizard will be displayed
- If bootstrap is **complete**: Normal UI will be displayed

After bootstrap completes, you can create warehouses successfully.

## Documentation

For more information, see the official documentation:

- [Lakekeeper Documentation](https://docs.lakekeeper.io/)
- [Apache Iceberg Documentation](https://iceberg.apache.org/docs/latest/)
- [PyIceberg Documentation](https://py.iceberg.apache.org/)
