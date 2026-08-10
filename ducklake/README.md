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
just ducklake::install          # Provision catalog DB + bucket + secrets + Quack server
just ducklake::test             # Smoke test via direct attach (create/insert/select/drop)
just ducklake::quack-test       # Smoke test via the Quack server
just ducklake::duckdb           # Open a DuckDB shell attached to the lake
just ducklake::print-init-sql   # Print attach SQL for any DuckDB client
just ducklake::show-config      # Show current configuration
just ducklake::uninstall        # Remove Quack server, catalog DB/user and Vault secrets (data kept)
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

## Quack server (remote access layer)

Serves the lake over the DuckDB [Quack protocol](https://duckdb.org/docs/current/quack/overview)
(HTTP + token auth) — a self-hosted equivalent of the MotherDuck-style "URL + token" UX.
Postgres and S3 stay private; only the Quack HTTP endpoint needs to be exposed
(e.g., via Cloudflare Tunnel with TLS termination).

The server itself is [simple-quack-server](https://github.com/buun-ch/simple-quack-server),
installed via its Helm chart (`oci://ghcr.io/buun-ch/charts/simple-quack-server`).
This module provisions the surrounding pieces: the `ducklake-quack` Secret
(from Vault via External Secrets, with a direct-Secret fallback), the token
(Vault `ducklake/quack`), and the chart values (Ingress for `DUCKLAKE_QUACK_HOST`).

```bash
just ducklake::quack-deploy     # Deploy server (token stored at Vault ducklake/quack)
just ducklake::quack-test       # Smoke test via kubectl port-forward
just ducklake::quack-token      # Print client token
just ducklake::quack-undeploy   # Remove server (token kept)
```

Client usage:

```sql
LOAD quack;
ATTACH 'quack:ducklake-quack.ducklake' AS remote (TOKEN '<token>', DISABLE_SSL true);
-- or remotely via Cloudflare Tunnel (TLS terminated; :443 is required because
-- the quack default port 9494 is not proxied by Cloudflare):
-- ATTACH 'quack:ducklake.example.com:443' AS remote (TOKEN '<token>');
SELECT * FROM remote.<table>;                                 -- reads (mirror views)
SELECT * FROM remote.query('INSERT INTO lake.<table> ...');   -- writes / DDL
```

Notes:

- Remote sessions do not inherit the server's default database; the server mirrors lake
  tables as views (refreshed every 60s) so `remote.<table>` works for reads. Writes and DDL
  go through `remote.query('... lake.<table> ...')`
- Quack clients assume HTTPS for non-localhost hosts — use `DISABLE_SSL true` inside the
  cluster; behind a TLS-terminating tunnel, omit it
- telepresence direct routing does not work with the duckdb quack client (curl reaches the
  service, duckdb does not); use `kubectl port-forward` from a local machine
- Single replica = single writer, which matches the write-path design
  (see the lakehouse-app project's PLAN)

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
