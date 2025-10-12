# DataHub

Modern data catalog and metadata management platform:

- Centralized data discovery and documentation
- Data lineage tracking and impact analysis
- Schema evolution monitoring
- OIDC integration with Keycloak for secure access
- Elasticsearch-powered search and indexing
- Kafka-based real-time metadata streaming
- PostgreSQL backend for metadata storage

## Installation

```bash
just datahub::install
```

## Resource Requirements

> **⚠️ Resource Requirements:** DataHub is resource-intensive, requiring approximately **4-5GB of RAM** and 1+ CPU cores across multiple components (Elasticsearch, Kafka, Zookeeper, and DataHub services). Deployment typically takes 15-20 minutes to complete. Ensure your cluster has sufficient resources before installation.

## Access

Access DataHub at `https://datahub.yourdomain.com` and use "Sign in with SSO" to authenticate via Keycloak.
