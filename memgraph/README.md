# Memgraph

Memgraph is an in-memory graph database built for real-time streaming and fast graph analytics. It uses OpenCypher as its query language and provides ACID-compliant transactions.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Connection Information](#connection-information)
- [Usage](#usage)
- [Memgraph Lab (Web UI)](#memgraph-lab-web-ui)
- [Configuration](#configuration)
- [Management](#management)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [References](#references)

## Prerequisites

- Kubernetes cluster with Longhorn storage
- For secret management: Vault and External Secrets Operator (optional but recommended)
- For monitoring: kube-prometheus-stack (optional)
- Host kernel parameter: `vm.max_map_count=524288`

### Kernel Parameter Setup

On the host node, configure the kernel parameter:

```bash
# Apply immediately
sudo sysctl -w vm.max_map_count=524288

# Persist across reboots
echo 'vm.max_map_count=524288' | sudo tee /etc/sysctl.d/99-memgraph.conf
sudo sysctl --system
```

## Installation

```bash
just memgraph::install
```

This will:

- Create the `memgraph` namespace with Pod Security Standards (baseline)
- Generate and store credentials in Vault (or Kubernetes Secret)
- Deploy Memgraph using the official Helm chart
- Optionally enable Prometheus monitoring
- Optionally install Memgraph Lab (Web UI)

## Connection Information

| Property | Value |
| -------- | ----- |
| Host | `memgraph.memgraph.svc.cluster.local` |
| Port | `7687` |
| Protocol | Bolt |

## Usage

### Get Credentials

```bash
just memgraph::get-username
just memgraph::get-password
```

### Health Check

```bash
just memgraph::health-check
```

### Console (mgconsole)

Open an interactive Cypher shell:

```bash
just memgraph::console
```

### Test Graph Operations

Run a basic test that creates nodes, relationships, and queries:

```bash
just memgraph::test
```

### User Management

#### Create User

```bash
just memgraph::create-user
```

Prompts for:

- Username
- Password (empty generates random)

Credentials are stored in Vault if available.

#### List Users

```bash
just memgraph::list-users
```

#### Delete User

```bash
just memgraph::delete-user
# or
just memgraph::delete-user username
```

### Cypher Queries

Connect using mgconsole or any Bolt-compatible client:

```cypher
-- Create nodes
CREATE (:Person {name: 'Alice', age: 30});
CREATE (:Person {name: 'Bob', age: 25});

-- Create relationship
MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'})
CREATE (a)-[:KNOWS {since: 2020}]->(b);

-- Query the graph
MATCH (p:Person)-[:KNOWS]->(friend)
RETURN p.name, friend.name;

-- Delete all data
MATCH (n) DETACH DELETE n;
```

### Python Client

```python
from neo4j import GraphDatabase

driver = GraphDatabase.driver(
    "bolt://memgraph.memgraph.svc.cluster.local:7687",
    auth=("memgraph", "<password>")
)

with driver.session() as session:
    # Create nodes
    session.run("CREATE (:Person {name: 'Alice', age: 30})")

    # Query
    result = session.run("MATCH (p:Person) RETURN p.name, p.age")
    for record in result:
        print(record["p.name"], record["p.age"])

driver.close()
```

## Memgraph Lab (Web UI)

Memgraph Lab is a visual interface for exploring and querying graphs.

### Memgraph Lab Installation

Memgraph Lab is optionally installed during `just memgraph::install`, or can be installed separately:

```bash
just memgraph::install-lab
```

You will be prompted for:

- **Host (FQDN)**: e.g., `memgraph.example.com`
- **OAuth2 Proxy**: Enable Keycloak authentication (recommended)

### Authentication

Memgraph Lab's built-in SSO is Enterprise-only. For authentication, OAuth2 Proxy with Keycloak is used:

- OAuth2 Proxy handles authentication before requests reach Memgraph Lab
- After login, you must manually enter Memgraph credentials in the Lab UI

### Connection in Lab

After OAuth2 authentication, click "Connect manually" and enter:

| Field | Value |
| ----- | ----- |
| Host | `memgraph` |
| Port | `7687` |
| Username | (from `just memgraph::get-username`) |
| Password | (from `just memgraph::get-password`) |

### Uninstall Lab

```bash
just memgraph::uninstall-lab
```

## Configuration

### Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `MEMGRAPH_NAMESPACE` | `memgraph` | Kubernetes namespace |
| `MEMGRAPH_CHART_VERSION` | `0.2.14` | Memgraph Helm chart version |
| `MEMGRAPH_LAB_CHART_VERSION` | `0.1.11` | Memgraph Lab Helm chart version |
| `MEMGRAPH_LAB_HOST` | (prompt) | Memgraph Lab hostname (FQDN) |
| `MEMGRAPH_STORAGE_SIZE` | `10Gi` | Persistent volume size |
| `MONITORING_ENABLED` | (prompt) | Enable Prometheus ServiceMonitor |

### Pod Security Standards

The namespace is configured with:

- `enforce=baseline` - Required (sysctlInitContainer needs baseline)
- `warn=restricted` - Shows warnings for restricted violations

## Management

### Uninstall

```bash
# Uninstall and delete all data
just memgraph::uninstall

# Uninstall but keep PVCs (data preserved)
just memgraph::uninstall false
```

### Cleanup Vault Secrets

```bash
just memgraph::cleanup
```

### Available Commands

```bash
just memgraph                    # List all commands
just memgraph::install           # Install Memgraph
just memgraph::install-lab       # Install Memgraph Lab
just memgraph::uninstall         # Uninstall (delete data)
just memgraph::uninstall false   # Uninstall (keep data)
just memgraph::uninstall-lab     # Uninstall Memgraph Lab only
just memgraph::get-username      # Get admin username
just memgraph::get-password      # Get admin password
just memgraph::health-check      # Check health
just memgraph::console           # Open mgconsole
just memgraph::test              # Run graph operation tests
just memgraph::create-user       # Create user
just memgraph::list-users        # List users
just memgraph::delete-user       # Delete user
just memgraph::cleanup           # Clean up Vault secrets
```

## Troubleshooting

### Pod Not Starting

Check pod status and logs:

```bash
kubectl get pods -n memgraph
kubectl logs memgraph-0 -n memgraph
kubectl describe pod memgraph-0 -n memgraph
```

### "max map count too low" Warning

The host's `vm.max_map_count` is below recommended value. Fix on the host:

```bash
sudo sysctl -w vm.max_map_count=524288
echo 'vm.max_map_count=524288' | sudo tee /etc/sysctl.d/99-memgraph.conf
```

Then restart the pod:

```bash
kubectl delete pod memgraph-0 -n memgraph
```

### Authentication Issues

Verify credentials:

```bash
just memgraph::get-username
just memgraph::get-password
```

Test connection:

```bash
just memgraph::health-check
```

### Connection Refused

Ensure service is running:

```bash
kubectl get svc -n memgraph
```

For external access, use telepresence or port-forward:

```bash
kubectl port-forward svc/memgraph -n memgraph 7687:7687
```

### Memory Issues

Memgraph stores graphs in memory. Monitor usage:

```bash
kubectl top pod -n memgraph
```

## Limitations

### Free Version Limitations

The following features require Memgraph Enterprise license:

| Feature | Free | Enterprise |
| ------- | ---- | ---------- |
| User authentication | Yes | Yes |
| Role-based access control | No | Yes |
| Fine-grained permissions | No | Yes |
| Multi-tenancy (databases) | No | Yes |
| Label-based access control | No | Yes |

In the free version, all authenticated users have full access to all data.

## References

- [Memgraph Documentation](https://memgraph.com/docs/)
- [Memgraph GitHub](https://github.com/memgraph/memgraph)
- [Memgraph Helm Charts](https://github.com/memgraph/helm-charts)
- [OpenCypher Query Language](https://opencypher.org/)
- [Memgraph Lab](https://memgraph.com/docs/memgraph-lab)
