# Metabase

Business intelligence and data visualization platform:

- Open-source analytics and dashboards
- Interactive data exploration
- PostgreSQL integration for data storage
- Automated setup with Helm
- Session management through Vault/External Secrets
- Simplified deployment (no OIDC dependency)

## Installation

```bash
just metabase::install
```

## Access

Access Metabase at `https://metabase.yourdomain.com` and complete the initial setup wizard to create an admin account.

## Data Sources

### Trino Integration

Metabase can connect to Trino to query multiple data sources (PostgreSQL, Iceberg tables, etc.) through a unified SQL interface.

**Adding Trino Database**:

1. In Metabase, go to **Admin → Databases → Add database**
2. Select **Database type**: Starburst
3. Configure connection:

    ```plain
    Display name: Trino (PostgreSQL) or Trino (Iceberg)
    Host: trino.yourdomain.com
    Port: 443
    Username: admin
    Password: [from just trino::admin-password]
    Catalog: postgresql or iceberg
    SSL: Yes
    ```

**Catalog Selection**:

- **postgresql**: Query PostgreSQL database tables
- **iceberg**: Query Iceberg tables via Lakekeeper REST Catalog
- You can create multiple connections, one for each catalog

**Getting Trino Admin Password**:

```bash
just trino::admin-password
```

For more details, see the [Trino documentation](../trino/README.md).
