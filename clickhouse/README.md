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
