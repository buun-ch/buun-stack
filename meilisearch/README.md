# Meilisearch

Meilisearch is a lightning-fast, typo-tolerant search engine designed for a great search experience. It provides instant search results with features like typo tolerance, filtering, and faceted search.

## Table of Contents

- [Installation](#installation)
- [Prerequisites](#prerequisites)
- [Connection Information](#connection-information)
- [Usage](#usage)
- [Configuration](#configuration)
- [API Keys](#api-keys)
- [Management](#management)

## Installation

Install Meilisearch with interactive configuration:

```bash
just meilisearch::install
```

This will:

- Create the `meilisearch` namespace with Pod Security Standards (restricted)
- Generate and store a master key in Vault (or Kubernetes Secret)
- Deploy Meilisearch using the official Helm chart
- Optionally enable Prometheus monitoring

## Prerequisites

- Kubernetes cluster with Longhorn storage
- For secret management: Vault and External Secrets Operator (optional but recommended)
- For monitoring: kube-prometheus-stack (optional)

## Connection Information

| Property | Value                                       |
| -------- | ------------------------------------------- |
| Host     | `meilisearch.meilisearch.svc.cluster.local` |
| Port     | `7700`                                      |
| Protocol | HTTP REST API                               |

Meilisearch is deployed as an internal-only service without Ingress. Access is available only within the cluster.

## Usage

### Get Master Key

```bash
just meilisearch::get-master-key
```

### Get API Keys

```bash
# Default Admin API Key (for document operations)
just meilisearch::get-admin-key

# Default Search API Key (for search only)
just meilisearch::get-search-key

# List all API keys
just meilisearch::list-keys
```

### Health Check

```bash
just meilisearch::health-check
```

### Test Operations

Run a basic test that creates an index, adds documents, searches, and cleans up:

```bash
just meilisearch::test
```

### Index Management

```bash
# List all indexes
just meilisearch::list-indexes

# Create an index (interactive)
just meilisearch::create-index

# Create an index with parameters
just meilisearch::create-index products
just meilisearch::create-index products product_id  # Custom primary key

# Delete an index (interactive selection)
just meilisearch::delete-index

# Delete a specific index
just meilisearch::delete-index products
```

### REST API Examples

```bash
MEILISEARCH_URL="http://meilisearch.meilisearch.svc.cluster.local:7700"
ADMIN_KEY=$(just meilisearch::get-admin-key)
SEARCH_KEY=$(just meilisearch::get-search-key)

# Add documents
curl -X POST "${MEILISEARCH_URL}/indexes/products/documents" \
  -H "Authorization: Bearer ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d '[
    {"id": 1, "name": "iPhone 15", "category": "Electronics"},
    {"id": 2, "name": "MacBook Pro", "category": "Electronics"},
    {"id": 3, "name": "AirPods", "category": "Electronics"}
  ]'

# Search documents
curl -X POST "${MEILISEARCH_URL}/indexes/products/search" \
  -H "Authorization: Bearer ${SEARCH_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"q": "iphone"}'
```

### Python Client

```python
import meilisearch

client = meilisearch.Client(
    'http://meilisearch.meilisearch.svc.cluster.local:7700',
    '<admin-api-key>'
)

# Create an index
index = client.index('products')

# Add documents
documents = [
    {'id': 1, 'name': 'iPhone 15', 'category': 'Electronics'},
    {'id': 2, 'name': 'MacBook Pro', 'category': 'Electronics'},
]
index.add_documents(documents)

# Search
results = index.search('iphone')
print(results['hits'])
```

## Configuration

### Environment Variables

| Variable                   | Default       | Description                          |
| -------------------------- | ------------- | ------------------------------------ |
| `MEILISEARCH_NAMESPACE`    | `meilisearch` | Kubernetes namespace                 |
| `MEILISEARCH_VERSION`      | `0.19.0`      | Helm chart version                   |
| `MEILISEARCH_ENV`          | `production`  | Environment (production/development) |
| `MEILISEARCH_STORAGE_SIZE` | `10Gi`        | Persistent volume size               |

### Pod Security Standards

The namespace is configured with restricted Pod Security Standards:

- `enforce=restricted` - Enforces restricted security policy
- `warn=restricted` - Shows warnings for violations

All pods run with:

- `runAsNonRoot: true` - Prevents running as root
- `allowPrivilegeEscalation: false` - Blocks privilege escalation
- `seccompProfile.type: RuntimeDefault` - Enables seccomp filtering
- `capabilities.drop: [ALL]` - Drops all Linux capabilities
- `readOnlyRootFilesystem: true` - Read-only root filesystem

## API Keys

Meilisearch uses API keys for authentication in production mode.

### Key Types

| Key Type       | Purpose              | Actions                   |
| -------------- | -------------------- | ------------------------- |
| Master Key     | Key management only  | Create/delete API keys    |
| Admin API Key  | Backend operations   | All except key management |
| Search API Key | Frontend search      | Search only               |
| Custom Keys    | Specific use cases   | Configurable              |

### Create Custom API Key

```bash
# Interactive mode
just meilisearch::create-key

# With parameters
just meilisearch::create-key "my-app-key" "My app search" "search" "products"
just meilisearch::create-key "admin-key" "Full access" "*" "*"
```

### Delete API Key

```bash
# Interactive selection
just meilisearch::delete-key

# By key UID
just meilisearch::delete-key "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### Available Actions

| Action         | Description              |
| -------------- | ------------------------ |
| `*`            | All actions              |
| `search`       | Search documents         |
| `documents.*`  | All document operations  |
| `indexes.*`    | All index operations     |
| `tasks.*`      | All task operations      |
| `settings.*`   | All settings operations  |
| `keys.*`       | All key operations       |

## Management

### Uninstall

```bash
# Keep PVC and data
just meilisearch::uninstall

# Delete everything including PVC and namespace
just meilisearch::uninstall true
```

### Cleanup Vault Secrets

```bash
just meilisearch::cleanup
```

### Available Commands

```bash
just meilisearch                    # List all commands
just meilisearch::install           # Install Meilisearch
just meilisearch::uninstall         # Uninstall (keep data)
just meilisearch::uninstall true    # Uninstall (delete all)
just meilisearch::get-master-key    # Get master key
just meilisearch::get-admin-key     # Get default admin API key
just meilisearch::get-search-key    # Get default search API key
just meilisearch::list-keys         # List all API keys
just meilisearch::create-key        # Create custom API key
just meilisearch::delete-key        # Delete API key
just meilisearch::list-indexes      # List all indexes
just meilisearch::create-index      # Create an index
just meilisearch::delete-index      # Delete an index
just meilisearch::health-check      # Check health (requires telepresence)
just meilisearch::version           # Get version info
just meilisearch::stats             # Get statistics
just meilisearch::test              # Run operation tests
just meilisearch::cleanup           # Clean up Vault secrets
```

## References

- [Meilisearch Documentation](https://www.meilisearch.com/docs)
- [Meilisearch GitHub](https://github.com/meilisearch/meilisearch)
- [Meilisearch Helm Chart](https://github.com/meilisearch/meilisearch-kubernetes)
- [Meilisearch Python SDK](https://github.com/meilisearch/meilisearch-python)
- [Meilisearch JavaScript SDK](https://github.com/meilisearch/meilisearch-js)
- [Tenant Tokens](https://www.meilisearch.com/docs/learn/security/multitenancy_tenant_tokens)
