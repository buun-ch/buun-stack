# Redis Operator

Kubernetes operator for managing Redis instances with support for multiple deployment modes:

- **Redis Standalone**: Single Redis instance for development or simple use cases
- **Redis Cluster**: Distributed Redis cluster with automatic sharding
- **Redis Replication**: Master-replica setup for high availability
- **Redis Sentinel**: Automatic failover management for Redis replication

## Prerequisites

- Kubernetes cluster (k3s)
- Longhorn storage class (for persistent storage)
- Prometheus (optional, for monitoring)

## Installation

```bash
just redis-operator::install
```

This command will:

1. Add OT-CONTAINER-KIT Helm repository
2. Create namespace with baseline Pod Security Standard
3. Install Redis Operator via Helm
4. Deploy ServiceMonitor if Prometheus is available

### Verify Installation

```bash
just redis-operator::status
```

### Available CRDs

After installation, the following Custom Resource Definitions are available:

- `redis.redis.redis.opstreelabs.in` - Redis standalone instances
- `rediscluster.redis.redis.opstreelabs.in` - Redis clusters
- `redisreplication.redis.redis.opstreelabs.in` - Redis replications
- `redissentinel.redis.redis.opstreelabs.in` - Redis sentinels

## Configuration

Environment variables (set in `.env.local` or override):

```bash
REDIS_OPERATOR_NAMESPACE=redis      # Kubernetes namespace for operator
REDIS_OPERATOR_VERSION=0.22.2       # Helm chart version
PROMETHEUS_NAMESPACE=monitoring     # Prometheus namespace (for ServiceMonitor)
```

## Creating Redis Instances

### Redis Standalone

```bash
just redis-operator::create-sample-standalone <namespace> <name>

# Examples:
just redis-operator::create-sample-standalone default my-redis
just redis-operator::create-sample-standalone  # Interactive mode
```

Creates a single Redis instance with:

- 1Gi persistent storage
- Redis Exporter for metrics
- Resource limits (500m CPU, 512Mi memory)

### Redis Cluster

```bash
just redis-operator::create-sample-cluster <namespace> <name>

# Examples:
just redis-operator::create-sample-cluster default my-cluster
```

Creates a Redis cluster with:

- 3 leader nodes + 3 follower nodes
- Automatic sharding
- 1Gi persistent storage per node

### Redis Replication

```bash
just redis-operator::create-sample-replication <namespace> <name>

# Examples:
just redis-operator::create-sample-replication default my-replication
```

Creates a master-replica setup with:

- 1 master + 2 replicas
- Automatic failover (when used with Sentinel)
- 1Gi persistent storage per node

### List All Instances

```bash
just redis-operator::list
```

### Delete Instance

```bash
just redis-operator::delete-instance <kind> <namespace> <name>

# Examples:
just redis-operator::delete-instance redis default my-redis
just redis-operator::delete-instance  # Interactive mode
```

## Pod Security Standards

The Redis Operator namespace uses **baseline** Pod Security Standard enforcement with **restricted** warnings:

```bash
pod-security.kubernetes.io/enforce=baseline
pod-security.kubernetes.io/warn=restricted
```

### Security Configuration for Redis Instances

All Redis instances created by the sample recipes include proper security context:

```yaml
spec:
  podSecurityContext:
    runAsUser: 1000
    fsGroup: 1000
```

This configuration:

- Runs Redis as non-root user (UID 1000)
- Sets volume ownership to GID 1000 for persistent storage access

### Custom Redis Instances

When creating custom Redis instances, always include `podSecurityContext` to avoid permission errors:

```yaml
apiVersion: redis.redis.opstreelabs.in/v1beta2
kind: Redis
metadata:
  name: my-redis
  namespace: default
spec:
  podSecurityContext:
    runAsUser: 1000
    fsGroup: 1000
  kubernetesConfig:
    image: quay.io/opstree/redis:v7.0.12
    # ... rest of configuration
```

## Monitoring

### Prometheus Integration

If Prometheus (kube-prometheus-stack) is installed, the Redis Operator installation automatically:

1. Labels the namespace with `buun.channel/enable-monitoring=true`
2. Creates a ServiceMonitor for operator metrics

### Redis Exporter

All sample instances include Redis Exporter sidecar for metrics:

```yaml
redisExporter:
  enabled: true
  image: quay.io/opstree/redis-exporter:v1.44.0
```

Metrics are exposed on port 9121 at `/metrics`.

### Creating ServiceMonitor for Redis Instances

To monitor Redis instances, create a ServiceMonitor in the instance namespace:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: redis-metrics
  namespace: default
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: my-redis
  endpoints:
    - port: redis-exporter
      path: /metrics
      interval: 30s
```

Ensure the namespace has the monitoring label:

```bash
kubectl label namespace default buun.channel/enable-monitoring=true
```

## Troubleshooting

### Verify Redis Connectivity

```bash
kubectl exec -it <pod-name> -n <namespace> -c redis -- redis-cli ping
# Expected output: PONG
```

## Management

### Upgrade Operator

```bash
just redis-operator::upgrade
```

### Uninstall Operator

```bash
just redis-operator::uninstall
```

This will remove:

- Helm release
- ServiceMonitor
- Namespace

**Note**: This does not delete Redis instances in other namespaces. Delete them manually before uninstalling the operator.

## References

- [Redis Operator GitHub](https://github.com/OT-CONTAINER-KIT/redis-operator)
- [Redis Operator Documentation](https://ot-redis-operator.netlify.app/)
- [OT-CONTAINER-KIT Helm Charts](https://github.com/OT-CONTAINER-KIT/helm-charts)
- [Redis Documentation](https://redis.io/docs/)
- [Redis Exporter](https://github.com/oliver006/redis_exporter)
