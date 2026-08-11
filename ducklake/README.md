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
just ducklake::quack-helm-test  # Smoke test from inside the cluster (helm test, read-only)
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
FROM remote.query('USE lake');                    -- once per session, see below
SELECT * FROM remote.<table>;                     -- reads, INSERT, CREATE/DROP TABLE
SELECT * FROM remote.query('MERGE INTO ...');     -- UPDATE/DELETE/ALTER/MERGE/time travel
```

Notes:

- Remote sessions start in the server's own (empty) default database, and the quack client
  sends SQL without the catalog qualifier — so each session has to switch to the lake once
  with `FROM remote.query('USE lake')`. After that, reads, `INSERT` and `CREATE`/`DROP TABLE`
  work directly against `remote.<table>`. Schemas other than `main` need `USE lake.<schema>`
- `UPDATE`, `DELETE`, `ALTER TABLE`, `MERGE INTO`, time travel and the DuckLake table
  functions are not implemented in the quack client yet; wrap those in `remote.query('...')`
- Requires chart 0.2.0 or later. Earlier versions mirrored lake tables as views in the
  default database, which made `remote.<table>` read-only
- Quack clients assume HTTPS for non-localhost hosts — use `DISABLE_SSL true` inside the
  cluster; behind a TLS-terminating tunnel, omit it
- telepresence direct routing does not work with the duckdb quack client (curl reaches the
  service, duckdb does not); use `kubectl port-forward` from a local machine
- Single replica = single writer, which matches the write-path design
  (see the lakehouse-app project's PLAN)

### Tooling over Quack: use a workspace instead

The Quack server is the door for a human at an interactive prompt. It is not yet a substrate for
tools that drive the catalog programmatically — **dbt does not work through it**, and the reason is
the quack client's implementation, not DuckLake:

- **No `ALTER TABLE`.** dbt's `table` materialization builds `<model>__dbt_tmp` and renames it into
  place. The create succeeds and the swap fails.
- **The catalog cannot be enumerated.** dbt lists existing relations before every run;
  `information_schema.tables`, `duckdb_tables()` and `SHOW TABLES` all come back empty over quack —
  even for tables the same session just created.
- **No `MERGE`/`DELETE`**, so `incremental` and `snapshot` materializations are out as well.

Wrapping statements in `remote.query('...')` gets around each of these individually, but dbt emits
its own SQL and cannot be made to do that.

**Run dbt (and other catalog-driven tooling) inside the cluster against a direct attach.** With the
Postgres catalog and S3 attached directly, the local DuckDB has the full catalog and every one of
the above works — verified end to end, including `incremental`. The [`coder`](../coder/README.md)
module provides a workspace for exactly this: a persistent in-cluster development environment,
reachable over `coder ssh` from anywhere, with `duckdb`, `dbt-duckdb` and the DuckLake credentials
already wired up. See [its README](../coder/README.md) for the working dbt profile, including the
two fields that fail silently when omitted.

This split is also the right one on performance grounds. dbt-duckdb computes wherever the dbt
process runs, so a laptop-side dbt would pull the lake's Parquet across the WAN and write it back.
Keep the compute next to the data and send only control from outside.

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
