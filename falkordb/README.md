# FalkorDB

FalkorDB is a high-performance graph database with vector similarity search capabilities, designed for knowledge graphs and GraphRAG applications. It uses OpenCypher as its query language and is Redis-compatible.

## Table of Contents

- [Installation](#installation)
- [Prerequisites](#prerequisites)
- [Connection Information](#connection-information)
- [Usage](#usage)
- [Configuration](#configuration)
- [Cognee Integration](#cognee-integration)
- [Management](#management)
- [Troubleshooting](#troubleshooting)

## Installation

Install FalkorDB with interactive configuration:

```bash
just falkordb::install
```

This will:

- Create the `falkordb` namespace with Pod Security Standards (baseline)
- Generate and store a password in Vault (or Kubernetes Secret)
- Deploy FalkorDB using the custom Helm chart
- Optionally enable Prometheus monitoring

## Prerequisites

- Kubernetes cluster with Longhorn storage
- For secret management: Vault and External Secrets Operator (optional but recommended)
- For monitoring: kube-prometheus-stack (optional)

## Connection Information

| Property | Value                                 |
| -------- | ------------------------------------- |
| Host     | `falkordb.falkordb.svc.cluster.local` |
| Port     | `6379`                                |
| Protocol | Redis (Bolt not supported)            |

## Usage

### Get Password

```bash
just falkordb::get-password
```

### Health Check

```bash
just falkordb::health-check
```

### Test Graph Operations

Run a basic test that creates nodes, relationships, and queries:

```bash
just falkordb::test
```

### User Management

FalkorDB supports Redis ACL for user authentication and authorization.

#### Create User

Interactive user creation with command permissions:

```bash
just falkordb::create-user
```

This prompts for:

- Username
- Password (empty generates random)
- Allowed commands (multi-select)
- Denied commands (multi-select, optional)
- Graph pattern (`*` for all graphs)

Or with arguments:

```bash
just falkordb::create-user myuser "" "GRAPH.QUERY GRAPH.RO_QUERY GRAPH.LIST" "" "app_*"
```

#### List Users

```bash
just falkordb::list-users
```

#### Get User Details

```bash
just falkordb::get-user myuser
```

#### Delete User

```bash
just falkordb::delete-user myuser
```

### Redis CLI

Connect directly using redis-cli:

```bash
PASSWORD=$(just falkordb::get-password)
redis-cli -h falkordb.falkordb.svc.cluster.local -p 6379 -a "$PASSWORD"
```

### Cypher Queries

FalkorDB uses OpenCypher query language via Redis commands:

```bash
# Create a node
redis-cli -a "$PASSWORD" GRAPH.QUERY mygraph "CREATE (:Person {name: 'Alice', age: 30})"

# Create a relationship
redis-cli -a "$PASSWORD" GRAPH.QUERY mygraph \
  "MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'}) CREATE (a)-[:KNOWS]->(b)"

# Query the graph
redis-cli -a "$PASSWORD" GRAPH.QUERY mygraph \
  "MATCH (p:Person)-[:KNOWS]->(friend) RETURN p.name, friend.name"

# Delete a graph
redis-cli -a "$PASSWORD" GRAPH.DELETE mygraph
```

### Python Client

```python
from falkordb import FalkorDB

db = FalkorDB(
    host='falkordb.falkordb.svc.cluster.local',
    port=6379,
    password='<password>'
)
graph = db.select_graph('knowledge')

# Create nodes
graph.query("CREATE (:Concept {name: 'Machine Learning'})")
graph.query("CREATE (:Concept {name: 'Neural Networks'})")

# Create relationship
graph.query("""
    MATCH (a:Concept {name: 'Neural Networks'}), (b:Concept {name: 'Machine Learning'})
    CREATE (a)-[:PART_OF]->(b)
""")

# Query
result = graph.query("MATCH (c:Concept) RETURN c.name")
for record in result.result_set:
    print(record)
```

## Configuration

### Environment Variables

| Variable               | Default     | Description             |
| ---------------------- | ----------- | ----------------------- |
| `FALKORDB_NAMESPACE`   | `falkordb`  | Kubernetes namespace    |
| `FALKORDB_VERSION`     | `v4.14.8`   | FalkorDB image version  |
| `FALKORDB_STORAGE_SIZE`| `8Gi`       | Persistent volume size  |

### Pod Security Standards

The namespace is configured with:

- `enforce=baseline` - Required for FalkorDB (runs as root)
- `warn=restricted` - Shows warnings for restricted violations

## Cognee Integration

FalkorDB can serve as both graph and vector store for [Cognee](https://github.com/topoteretes/cognee), enabling knowledge graph construction and RAG without separate vector database.

### Configuration

```bash
# .env for Cognee
GRAPH_DATABASE_PROVIDER=falkordb
GRAPH_DATABASE_URL=falkordb.falkordb.svc.cluster.local
GRAPH_DATABASE_PORT=6379

VECTOR_DB_PROVIDER=falkordb
VECTOR_DB_URL=falkordb.falkordb.svc.cluster.local
VECTOR_DB_PORT=6379
```

### Usage with Cognee

```python
import cognee

# Add documents
await cognee.add("documents/", dataset_name="knowledge_base")

# Generate knowledge graph (automatic)
await cognee.cognify()

# Search with RAG
results = await cognee.search("What is the relationship between X and Y?")
```

## Management

### Uninstall

```bash
just falkordb::uninstall
```

### Cleanup Vault Secrets

```bash
just falkordb::cleanup
```

### Available Commands

```bash
just falkordb                    # List all commands
just falkordb::install           # Install FalkorDB
just falkordb::uninstall         # Uninstall FalkorDB
just falkordb::get-password      # Get password
just falkordb::health-check      # Check health
just falkordb::test              # Run graph operation tests
just falkordb::create-user       # Create user with ACL
just falkordb::list-users        # List all users
just falkordb::get-user          # Get user details
just falkordb::delete-user       # Delete a user
just falkordb::cleanup           # Clean up Vault secrets
```

## Troubleshooting

### Pod Not Starting

Check pod status and logs:

```bash
kubectl get pods -n falkordb
kubectl logs falkordb-0 -n falkordb
kubectl describe pod falkordb-0 -n falkordb
```

### Authentication Issues

Verify password is correctly configured:

```bash
# Check secret exists
kubectl get secret falkordb-password -n falkordb

# Test authentication from within cluster
kubectl exec falkordb-0 -n falkordb -- redis-cli -a "$PASSWORD" PING
```

### Connection Refused

Ensure service is running:

```bash
kubectl get svc -n falkordb
```

For external access, use telepresence or port-forward:

```bash
kubectl port-forward svc/falkordb -n falkordb 6379:6379
```

### Memory Issues

FalkorDB stores graphs in memory. Monitor usage:

```bash
kubectl top pod -n falkordb
```

If running out of memory, increase limits in `falkordb-values.gomplate.yaml`.

## References

- [FalkorDB Documentation](https://docs.falkordb.com/)
- [FalkorDB GitHub](https://github.com/FalkorDB/FalkorDB)
- [OpenCypher Query Language](https://opencypher.org/)
- [Cognee Documentation](https://docs.cognee.ai/)
