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
- Creates Keycloak OIDC client with PKCE flow for secure authentication
- Configures audience mapper for JWT tokens
- Runs database migrations
- Configures Traefik ingress with TLS

## Access

Access Lakekeeper at `https://lakekeeper.yourdomain.com` and authenticate via Keycloak.

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
