# ClickHouse

High-performance columnar OLAP database for analytics and data warehousing:

- Columnar storage for fast analytical queries
- Real-time data ingestion and processing
- Horizontal scaling for large datasets
- SQL interface with advanced analytics functions
- Integration with External Secrets for secure credential management
- Support for various data formats (CSV, JSON, Parquet, etc.)

## Installation

```bash
just clickhouse::install
```

## Access

Access ClickHouse at `https://clickhouse.yourdomain.com` using the admin credentials stored in Vault.

## CH-UI Web Interface

An optional web-based query interface for ClickHouse is available:

```bash
just ch-ui::install
```

## Pod Security Standards

The ClickHouse namespace is configured with **baseline** enforcement:

- `pod-security.kubernetes.io/enforce=baseline`
- `pod-security.kubernetes.io/warn=baseline`

### Optional Capabilities

ClickHouse can use the following Linux capabilities for enhanced performance, but they are **not required** for normal operation:

| Capability | Purpose                                          | Impact if disabled                            |
|------------|--------------------------------------------------|-----------------------------------------------|
| `IPC_LOCK` | `mlock` to prevent binary from being paged out   | Slightly slower startup under memory pressure |
| `SYS_NICE` | Thread priority control via `os_thread_priority` | Setting has no effect                         |

These capabilities are disabled by default to comply with baseline Pod Security Standards. To enable them, the namespace must allow privileged pods, and you need to uncomment the `add` line in `clickhouse-installation-template.yaml`.

## Monitoring

ClickHouse exposes Prometheus metrics on port 9363. When Prometheus (kube-prometheus-stack) is installed, monitoring can be enabled during installation or manually.

### Enable Monitoring

```bash
just clickhouse::setup-monitoring
```

This creates a ServiceMonitor and a metrics Service for Prometheus to scrape.

### Grafana Dashboard

Import the ClickHouse dashboard from Grafana.com:

1. Open Grafana → **Dashboards** → **New** → **Import**
2. Enter Dashboard ID: `14192`
3. Click **Load**, select **Prometheus** data source, then **Import**

The dashboard includes panels for memory, connections, queries, I/O, replication, merge operations, cache, and ZooKeeper metrics.

### Remove Monitoring

```bash
just clickhouse::remove-monitoring
```
