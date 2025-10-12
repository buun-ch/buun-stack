# Qdrant

High-performance vector database for AI/ML applications:

- **Vector Search**: Fast similarity search with multiple distance metrics (Cosine, Euclidean, Dot Product)
- **Rich Filtering**: Combine vector similarity with payload-based filtering
- **Scalable**: Horizontal scaling for large-scale vector collections
- **RESTful API**: Simple HTTP API for vector operations
- **Secure Authentication**: API key-based authentication with Vault integration
- **High Availability**: Built-in replication and fault tolerance

## Installation

```bash
just qdrant::install
```

During installation, you will be prompted for:

- **Qdrant host (FQDN)**: The domain name for accessing Qdrant (e.g., `qdrant.yourdomain.com`)

The installation automatically:

- Generates API keys (read-write and read-only)
- Stores keys in Vault (if External Secrets is available) or Kubernetes Secrets
- Configures Traefik ingress with TLS

## Access

Access Qdrant at `https://qdrant.yourdomain.com` using the API keys.

### Get API Keys

```bash
# Get read-write API key
just qdrant::get-api-key

# Get read-only API key
just qdrant::get-readonly-api-key
```

## Testing & Health Check

Qdrant includes built-in testing recipes that use telepresence to access the service from your local machine.

### Prerequisites

Ensure telepresence is connected:

```bash
telepresence connect
```

### Health Check

```bash
just qdrant::health-check
```

Checks if Qdrant is running and responding to requests.

### Vector Operations Test

```bash
just qdrant::test
```

Runs a complete test suite that:

1. Creates a test collection with 4-dimensional vectors
2. Adds sample points (cities with vector embeddings)
3. Performs similarity search
4. Cleans up the test collection

Example output:

```
Testing Qdrant at http://qdrant.qdrant.svc.cluster.local:6333
Using collection: test_collection_1760245249

1. Creating collection...
{
  "result": true,
  "status": "ok"
}

2. Adding test points...
{
  "result": {
    "operation_id": 0,
    "status": "completed"
  },
  "status": "ok"
}

3. Searching for similar vectors...
{
  "result": [
    {
      "id": 2,
      "score": 0.99,
      "payload": {"city": "London"}
    }
  ],
  "status": "ok"
}

Test completed successfully!
```

## Using Qdrant

### REST API

Qdrant provides a RESTful API for all operations. Here are some common examples:

#### Create a Collection

```bash
curl -X PUT "https://qdrant.yourdomain.com/collections/my_collection" \
  -H "api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    }
  }'
```

#### Insert Vectors

```bash
curl -X PUT "https://qdrant.yourdomain.com/collections/my_collection/points" \
  -H "api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "points": [
      {
        "id": 1,
        "vector": [0.1, 0.2, ...],
        "payload": {"text": "example document"}
      }
    ]
  }'
```

#### Search Similar Vectors

```bash
curl -X POST "https://qdrant.yourdomain.com/collections/my_collection/points/search" \
  -H "api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.15, 0.25, ...],
    "limit": 10
  }'
```

### Python Client

```python
from qdrant_client import QdrantClient

# Connect to Qdrant
client = QdrantClient(
    url="https://qdrant.yourdomain.com",
    api_key="YOUR_API_KEY"
)

# Create collection
client.create_collection(
    collection_name="my_collection",
    vectors_config={"size": 384, "distance": "Cosine"}
)

# Insert vectors
client.upsert(
    collection_name="my_collection",
    points=[
        {
            "id": 1,
            "vector": [0.1, 0.2, ...],
            "payload": {"text": "example document"}
        }
    ]
)

# Search
results = client.search(
    collection_name="my_collection",
    query_vector=[0.15, 0.25, ...],
    limit=10
)
```

### JupyterHub Integration

Store your API key securely in Vault using the buunstack package:

```python
from buunstack import SecretStore

secrets = SecretStore()
secrets.put('qdrant', api_key='YOUR_API_KEY')

# Later, retrieve it
api_key = secrets.get('qdrant', field='api_key')
```

## Use Cases

### Vector Embeddings Search

Store and search document, image, or audio embeddings for:

- Semantic search
- Recommendation systems
- Duplicate detection
- Content-based filtering

### RAG (Retrieval-Augmented Generation)

Use Qdrant as the vector store for LLM applications:

- Store document chunks with embeddings
- Retrieve relevant context for LLM prompts
- Build knowledge bases with semantic search

### Similarity Matching

Find similar items based on learned representations:

- Image similarity search
- Product recommendations
- Anomaly detection
- Clustering and classification

## Cleanup

To remove all Qdrant resources and secrets from Vault:

```bash
just qdrant::cleanup
```

This will prompt for confirmation before deleting the Vault secrets.

## Uninstallation

```bash
just qdrant::uninstall
```

This will:

- Uninstall the Qdrant Helm release
- Delete API keys secrets
- Remove the Qdrant namespace

## Documentation

For more information, see the official Qdrant documentation:

- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [REST API Reference](https://qdrant.tech/documentation/api-reference/)
- [Python Client](https://github.com/qdrant/qdrant-client)
