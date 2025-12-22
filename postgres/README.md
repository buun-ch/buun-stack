# PostgreSQL

PostgreSQL is deployed using CloudNativePG, a Kubernetes operator that manages the full lifecycle of PostgreSQL clusters. It provides high availability, automated failover, backup management, and declarative configuration.

## Table of Contents

- [Installation](#installation)
- [Prerequisites](#prerequisites)
- [Connection Information](#connection-information)
- [Configuration](#configuration)
- [PostgreSQL Parameters](#postgresql-parameters)
- [Usage](#usage)
- [CDC (Change Data Capture)](#cdc-change-data-capture)
- [Management](#management)

## Installation

Install PostgreSQL with CloudNativePG:

```bash
just postgres::install
```

This will:

- Install the CloudNativePG operator
- Create the `postgres` namespace with Pod Security Standards (restricted)
- Generate and store superuser credentials in Vault (or Kubernetes Secret)
- Deploy a PostgreSQL cluster with the pgvector extension

## Prerequisites

- Kubernetes cluster with Longhorn storage
- For secret management: Vault and External Secrets Operator (optional but recommended)

## Connection Information

| Property | Value                                            |
| -------- | ------------------------------------------------ |
| Host     | `postgres-cluster-rw.postgres.svc.cluster.local` |
| Port     | `5432`                                           |
| Username | `postgres`                                       |
| Database | `postgres`                                       |

## Configuration

### Environment Variables

| Variable                     | Default          | Description                               |
| ---------------------------- | ---------------- | ----------------------------------------- |
| `CNPG_NAMESPACE`             | `postgres`       | Kubernetes namespace                      |
| `CNPG_CHART_VERSION`         | `0.26.1`         | CloudNativePG operator Helm chart version |
| `CNPG_CLUSTER_CHART_VERSION` | `0.3.1`          | Cluster Helm chart version                |
| `POSTGRES_VERSION`           | `18`             | PostgreSQL major version                  |
| `POSTGRES_STORAGE_SIZE`      | `20Gi`           | Persistent volume size                    |
| `POSTGRES_MAX_CONNECTIONS`   | `200`            | Maximum database connections              |
| `POSTGRES_MEMORY_REQUEST`    | `2Gi`            | Memory request                            |
| `POSTGRES_MEMORY_LIMIT`      | `4Gi`            | Memory limit                              |
| `POSTGRES_CPU_REQUEST`       | `200m`           | CPU request                               |
| `POSTGRES_CPU_LIMIT`         | `2`              | CPU limit                                 |
| `POSTGRES_SECCOMP_PROFILE`   | `Unconfined`     | Seccomp profile (see below)               |

### Security Configuration

PostgreSQL 18's `io_uring` async I/O requires relaxed security settings:

#### Pod Security Standards

The namespace is configured with `privileged` enforcement to allow `Unconfined` seccomp profile:

| Label                                      | Value        | Description                          |
| ------------------------------------------ | ------------ | ------------------------------------ |
| `pod-security.kubernetes.io/enforce`       | `privileged` | Allows Unconfined seccomp            |
| `pod-security.kubernetes.io/warn`          | `baseline`   | Warns when exceeding baseline        |

#### Seccomp Profile

The `POSTGRES_SECCOMP_PROFILE` variable controls the seccomp security profile:

| Value                     | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `Unconfined`              | No restrictions, allows `io_uring` (default)    |
| `RuntimeDefault`          | Secure profile, blocks `io_uring`               |
| `Localhost:filename.json` | Custom profile from `/var/lib/kubelet/seccomp/` |

#### Why Relaxed Security?

PostgreSQL 18 introduces `io_uring` for async I/O, providing up to 3x read performance improvement. However, `io_uring` syscalls are blocked by:

- `RuntimeDefault` seccomp profile
- `restricted` and `baseline` Pod Security Standards

To use `io_uring`, the namespace requires `privileged` PSS and `Unconfined` seccomp profile.

#### Disabling io_uring (Stricter Security)

If you prefer stricter security over performance:

```bash
# In parameters.yaml
io_method: worker  # Instead of io_uring

# Set seccomp to RuntimeDefault
POSTGRES_SECCOMP_PROFILE=RuntimeDefault just postgres::upgrade
```

Then update namespace labels manually:

```bash
kubectl label namespace postgres \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/warn=restricted \
  --overwrite
```

## PostgreSQL Parameters

PostgreSQL configuration parameters are managed through the `parameters.yaml` file. This file is included in the Helm values and applied to the cluster.

### File Structure

```text
postgres/
├── parameters.yaml           # Active configuration (git-ignored)
├── parameters.example.yaml   # Example configuration (committed)
└── ...
```

### Setup

Copy the example file and customize:

```bash
cp postgres/parameters.example.yaml postgres/parameters.yaml
vim postgres/parameters.yaml
```

### Example Configuration

```yaml
# PostgreSQL 18 Async I/O settings
io_method: worker              # Use 'io_uring' if seccomp allows
effective_io_concurrency: "200"
maintenance_io_concurrency: "50"
io_combine_limit: 512kB

# Memory settings
shared_buffers: 1GB
work_mem: 256MB
maintenance_work_mem: 1GB

# WAL settings
wal_buffers: 64MB
```

### Applying Changes

After editing `parameters.yaml`, apply changes with:

```bash
just postgres::upgrade
```

### PostgreSQL 18 I/O Settings

PostgreSQL 18 introduces asynchronous I/O for improved read performance:

| Parameter                    | Description                              | Restart Required |
| ---------------------------- | ---------------------------------------- | ---------------- |
| `io_method`                  | I/O method: `sync`, `worker`, `io_uring` | Yes              |
| `effective_io_concurrency`   | Concurrent I/O operations for reads      | No               |
| `maintenance_io_concurrency` | Concurrent I/O for maintenance           | No               |
| `io_combine_limit`           | Read-ahead combining (max 512kB)         | No               |

To use `io_uring`, set `POSTGRES_SECCOMP_PROFILE=Unconfined`.

## Usage

### Get Admin Credentials

```bash
just postgres::admin-username
just postgres::admin-password
```

### Connect with psql

```bash
just postgres::psql
```

### Database Management

```bash
# Create database
just postgres::create-db myapp

# Delete database
just postgres::delete-db myapp

# Check if database exists
just postgres::db-exists myapp
```

### User Management

```bash
# Create user (interactive)
just postgres::create-user

# Create user with parameters
just postgres::create-user myuser mypassword

# Delete user
just postgres::delete-user myuser

# Change password
just postgres::change-password myuser newpassword
```

### Create Database and User Together

```bash
# Create database, user, and grant privileges
just postgres::create-user-and-db myuser mydb mypassword

# Delete database and user
just postgres::delete-user-and-db myuser mydb
```

### Grant/Revoke Privileges

```bash
just postgres::grant mydb myuser
just postgres::revoke mydb myuser
```

### Backup and Restore

```bash
# Dump database
just postgres::dump mydb backup.dump

# Dump with excluded tables
just postgres::dump mydb backup.dump "large_table,temp_table"

# Restore database
just postgres::restore mydb backup.dump
```

## CDC (Change Data Capture)

CloudNativePG supports logical replication for CDC with tools like Airbyte, Debezium, etc.

### Setup CDC

```bash
# Full setup: slot, publication, and user privileges
just postgres::setup-cdc mydb myslot mypub myuser
```

### Manual Setup

```bash
# Create replication slot
just postgres::create-replication-slot myslot mydb

# Create publication
just postgres::create-publication mypub mydb

# Grant CDC privileges to user
just postgres::grant-cdc-privileges myuser mydb
```

### List CDC Resources

```bash
just postgres::list-replication-slots
just postgres::list-publications mydb
```

### Cleanup CDC

```bash
just postgres::cleanup-cdc mydb myslot mypub
```

## Management

### Upgrade Configuration

Apply changes from environment variables and `parameters.yaml`:

```bash
just postgres::upgrade
```

### Enable Monitoring

```bash
just postgres::enable-monitoring
just postgres::disable-monitoring
```

### Uninstall

```bash
# Uninstall (keeps data and PVCs)
just postgres::uninstall

# WARNING: Data is NOT preserved on uninstall
# CloudNativePG deletes PVCs when the cluster is deleted
```

### Available Commands

```bash
just postgres                        # List all commands
just postgres::install               # Install CloudNativePG and cluster
just postgres::uninstall             # Uninstall
just postgres::upgrade               # Apply configuration changes
just postgres::admin-username        # Get admin username
just postgres::admin-password        # Get admin password
just postgres::psql                  # Connect with psql
just postgres::create-db             # Create database
just postgres::delete-db             # Delete database
just postgres::create-user           # Create user
just postgres::delete-user           # Delete user
just postgres::create-user-and-db    # Create database and user
just postgres::delete-user-and-db    # Delete database and user
just postgres::grant                 # Grant privileges
just postgres::revoke                # Revoke privileges
just postgres::dump                  # Backup database
just postgres::restore               # Restore database
just postgres::setup-cdc             # Setup CDC
just postgres::enable-monitoring     # Enable Prometheus monitoring
just postgres::disable-monitoring    # Disable monitoring
```

## References

- [CloudNativePG Documentation](https://cloudnative-pg.io/documentation/)
- [CloudNativePG GitHub](https://github.com/cloudnative-pg/cloudnative-pg)
- [PostgreSQL 18 Release Notes](https://www.postgresql.org/docs/18/release-18.html)
- [PostgreSQL 18 Async I/O](https://www.postgresql.org/docs/18/runtime-config-resource.html#GUC-IO-METHOD)
