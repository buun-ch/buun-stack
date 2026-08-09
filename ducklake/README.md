# DuckLake

Provisions [DuckLake](https://ducklake.select/) on buun-stack: a lakehouse whose catalog lives in
PostgreSQL and whose data files live in S3-compatible object storage (MinIO or RustFS).

DuckLake has no server component of its own — "installing" it means provisioning a catalog
database, an object storage bucket and client credentials. Any DuckDB client (CLI, Python,
JupyterHub notebook, application) can then attach the lake.

## Prerequisites

- `just postgres::install` — the catalog database
- `just minio::install` or `just rustfs::install` — the data file storage
- Vault (recommended) — client credentials are stored at `ducklake/catalog` and `ducklake/storage`
- `telepresence connect` — required for local recipes that reach in-cluster services
  (`duckdb`, `test`, `print-init-sql`)
- DuckDB CLI >= 1.4 for the local shell and smoke test (`mise install` provides it)

## Usage

```bash
just ducklake::install          # Provision catalog DB + bucket + secrets
just ducklake::test             # Smoke test (create/insert/select/drop)
just ducklake::duckdb           # Open a DuckDB shell attached to the lake
just ducklake::print-init-sql   # Print attach SQL for any DuckDB client
just ducklake::show-config      # Show current configuration
just ducklake::uninstall        # Remove catalog DB/user and Vault secrets (data kept)
```

## Configuration

| Variable                | Default              | Description                                 |
| ----------------------- | -------------------- | ------------------------------------------- |
| `DUCKLAKE_CATALOG_DB`   | `ducklake_catalog`   | Postgres database for the catalog           |
| `DUCKLAKE_CATALOG_USER` | `ducklake`           | Postgres user for the catalog               |
| `DUCKLAKE_S3_BACKEND`   | `minio`              | Object storage backend: `minio` or `rustfs` |
| `DUCKLAKE_BUCKET`       | `ducklake`           | Bucket for data files                       |
| `DUCKLAKE_DATA_PATH`    | `s3://<bucket>/main` | Data path prefix inside the bucket          |
| `DUCKLAKE_ATTACH_ALIAS` | `lake`               | Attached database alias                     |

## Client access

From Python (inside the cluster, e.g. a JupyterHub notebook):

```python
import duckdb

con = duckdb.connect()
# Render the same SQL as `just ducklake::print-init-sql`, reading
# ducklake/catalog and ducklake/storage from Vault (buunstack.SecretStore).
con.sql(init_sql)
con.sql("SELECT * FROM lake.my_table").show()
```

Notes:

- Storage currently uses the backend root credentials (same approach as the Lakekeeper
  warehouse setup). Dedicated per-lake credentials can be added later.
- The catalog uses PostgreSQL, so `variant` columns cannot be inlined into the catalog
  (data inlining); they are always written to Parquet. See the
  [DuckLake data types spec](https://ducklake.select/docs/stable/specification/data_types).
