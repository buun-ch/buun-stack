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
export ICEBERG_WAREHOUSE=default
```

The dlt Iceberg REST destination automatically uses these credentials for OAuth2 authentication.

#### PyIceberg

```python
from pyiceberg.catalog import load_catalog

catalog = load_catalog(
    "rest_catalog",
    **{
        "uri": "http://lakekeeper.lakekeeper.svc.cluster.local:8181/catalog",
        "warehouse": "default",
        "credential": f"{client_id}:{client_secret}",  # OAuth2 format
    }
)
```

#### Trino Integration

Trino uses its own OIDC client with service account. This is automatically configured by `just trino::enable-iceberg-catalog`. You don't need to create a separate API client for Trino.

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

## Documentation

For more information, see the official documentation:

- [Lakekeeper Documentation](https://docs.lakekeeper.io/)
- [Apache Iceberg Documentation](https://iceberg.apache.org/docs/latest/)
- [PyIceberg Documentation](https://py.iceberg.apache.org/)
