# Resource Managementplain

This document describes how to configure resource requests and limits for components in the buun-stack.

## Table of Contents

- [Overview](#overview)
- [QoS Classes](#qos-classes)
- [Using Goldilocks](#using-goldilocks)
- [Configuring Resources](#configuring-resources)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

Kubernetes uses resource requests and limits to:

- **Schedule pods** on nodes with sufficient resources
- **Ensure quality of service** through QoS classes
- **Prevent resource exhaustion** by limiting resource consumption

All critical components in buun-stack should have resource requests and limits configured.

## QoS Classes

Kubernetes assigns one of three QoS classes to each pod based on its resource configuration:

### Guaranteed QoS (Highest Priority)

**Requirements:**

- Every container must have CPU and memory requests
- Every container must have CPU and memory limits
- Requests and limits must be **equal** for both CPU and memory

**Characteristics:**

- Highest priority during resource contention
- Last to be evicted when node runs out of resources
- Predictable performance

**Example:**

```yaml
resources:
  requests:
    cpu: 200mplain
    memory: 1Gi
  limits:
    cpu: 200m       # Same as requests
    memory: 1Gi     # Same as requests
```

**Use for:** Critical data stores (PostgreSQL, Vault)

### Burstable QoS (Medium Priority)

**Requirements:**

- At least one container has requests or limits
- Does not meet Guaranteed QoS criteria
- Typically `requests < limits`

**Characteristics:**

- Medium priority during resource contention
- Can burst to limits when resources are available
- More resource-efficient than Guaranteed

**Example:**

```yaml
resources:
  requests:
    cpu: 50m
    memory: 128Mi
  limits:
    cpu: 100m       # Can burst up to this
    memory: 256Mi   # Can burst up to this
```

**Use for:** Operators, auxiliary services, variable workloads

### BestEffort QoS (Lowest Priority)

**Requirements:**

- No resource requests or limits configured

**Characteristics:**

- Lowest priority during resource contention
- First to be evicted when node runs out of resources
- **Not recommended for production**

## Using Goldilocks

Goldilocks uses Vertical Pod Autoscaler (VPA) to recommend resource settings based on actual usage.

### Setup

For installation and detailed setup instructions, see:

- [VPA Installation and Configuration](../vpa/README.md)
- [Goldilocks Installation and Configuration](../goldilocks/README.md)

Quick start:

```bash
# Install VPA
just vpa::install

# Install Goldilocks
just goldilocks::install

# Enable monitoring for a namespace
just goldilocks::enable-namespace <namespace>
```

Access the dashboard at your configured Goldilocks host (e.g., `https://goldilocks.example.com`).

### Using the Dashboard

- Navigate to the namespace
- Expand "Containers" section for each workload
- Review both "Guaranteed QoS" and "Burstable QoS" recommendations

### Limitations

Goldilocks only monitors **standard Kubernetes workloads** (Deployment, StatefulSet, DaemonSet). It **does not** automatically create VPAs for:

- Custom Resource Definitions (CRDs)
- Resources managed by operators (e.g., CloudNativePG Cluster)

For CRDs, use alternative methods:

- Check actual usage: `kubectl top pod <pod-name> -n <namespace>`
- Use Grafana dashboards: `Kubernetes / Compute Resources / Pod`
- Monitor over time and adjust based on observed patterns

### Working with Recommendations

#### Understanding Goldilocks Recommendations

**How Goldilocks works:**

- Goldilocks displays recommendations directly from **Vertical Pod Autoscaler (VPA)** resources
- VPA analyzes actual resource usage and calculates recommendations with **built-in headroom**
- Goldilocks shows VPA's `target` values for Guaranteed QoS and `lowerBound` values for Burstable QoS

**Important**: VPA recommendations **already include significant headroom** (typically 5-15x for CPU, 2-3x for memory compared to observed usage).

**How VPA calculates recommendations:**

- **Percentile-based**: 90th percentile for target, 50th for lower bound, 95th for upper bound
- **Safety margin**: 15% added to base calculation (configurable via `--recommendation-margin-fraction`)
- **Confidence multiplier**: Additional buffer when historical data is limited (decreases as data accumulates)
- **Minimum thresholds**: CPU 25m, Memory 250Mi
- **Data collection**: 8-day rolling window with weight decay (newer samples weighted higher)

Example from external-secrets:

- Actual usage: CPU 1m, Memory 77Mi
- VPA target recommendation: CPU 15m, Memory 164M (displayed as Goldilocks "Guaranteed QoS")
- VPA lowerBound recommendation: CPU 15m, Memory 105M (displayed as Goldilocks "Burstable QoS" request)
- Built-in headroom: 15x CPU, 2x Memory (includes percentile + safety margin + confidence multiplier)

#### For Standard Workloads (Supported by Goldilocks)

Review Goldilocks recommendations in the dashboard, then configure resources:

**Recommendation: Use VPA values as-is in most cases**

Given that VPA already includes:
- 90th percentile (covers 90% of usage patterns)
- 15% safety margin
- Confidence multiplier for recent workloads
- Minimum thresholds

**Additional headroom is typically NOT needed unless:**

1. **Unpredictable workload**: Traffic patterns significantly vary or are not captured in 8-day window
2. **Critical services**: Data stores (PostgreSQL, Vault) where stability is paramount
3. **Insufficient history**: Newly deployed services with < 8 days of metrics
4. **Known growth**: Expecting significant traffic increase in near future

**Recommended approach:**

- **Standard services (operators, auxiliary)**: Use VPA recommendations as-is, round to clean values
- **Critical services**: Use VPA + 1.5-2x for extra safety margin, or use Guaranteed QoS
- **New services**: Start with VPA + 1.5x, monitor, adjust after 1-2 weeks

**IMPORTANT:** Never configure resources **below** Goldilocks recommendations. Setting values lower than recommended will:
- Cause Goldilocks dashboard to flag the workload as under-resourced
- Potentially lead to performance issues or OOMKilled events
- Defeat the purpose of using VPA-based recommendations

When rounding values, always round **up** to the next clean value, not down.

**Example:**

Goldilocks recommendation: 50m CPU, 128Mi Memory

- Standard service: 50m CPU, 128Mi Memory (use as-is, rounded up if needed)
- Critical service: 100m CPU, 256Mi Memory (2x for extra safety)

Goldilocks recommendation: 15m CPU, 105M Memory

- Correct: 25m CPU, 128Mi Memory (rounded up to clean values)
- Incorrect: 10m CPU, 100Mi Memory (below recommendations, will be flagged)

#### For CRDs and Unsupported Workloads

Use Grafana to check actual resource usage:

1. **Navigate to Grafana dashboard**: `Kubernetes / Compute Resources / Pod`
2. **Select namespace and pod**
3. **Review usage over 7+ days** to identify peak values and usage patterns

**Apply headroom manually (since VPA is not available):**

Since you're working from raw metrics without VPA's automatic calculation, manually apply similar buffers:

- **Base calculation**: Use 90th percentile or observed peak values
- **Safety margin**: Add 15-20%
- **Confidence buffer**: Add 20-50% for services with < 1 week of data
- **Minimum thresholds**: CPU 25-50m, Memory 256Mi

**Recommended multipliers:**

- **Standard services**: 2-3x observed peak (approximates VPA calculation)
- **Critical services**: 3-5x observed peak (extra safety for data stores)
- **New services**: 5x observed peak, re-evaluate after 1-2 weeks

**Example:**

Grafana shows peak: 40m CPU, 200Mi Memory over 7 days

- Standard service: 100m CPU, 512Mi Memory (2.5x, rounded)
- Critical service: 200m CPU, 1Gi Memory (5x, rounded, Guaranteed QoS recommended)

**Note**: For CRDs, you're working from raw usage data and must manually apply the same statistical buffers that VPA provides automatically. Larger multipliers compensate for lack of percentile analysis and safety margins.

## Configuring Resources

### Helm-Managed Components

For components installed via Helm, configure resources in the values file.

#### Example: PostgreSQL Operator (CNPG)

**File:** `postgres/cnpg-values.yaml`

```yaml
resources:
    requests:
        cpu: 50m
        memory: 128Mi
    limits:
        cpu: 100m
        memory: 256Mi
```

**Apply:**

```bash
cd postgres
helm upgrade --install cnpg cnpg/cloudnative-pg --version ${CNPG_CHART_VERSION} \
    -n ${CNPG_NAMESPACE} -f cnpg-values.yaml
```

#### Example: Vault

**File:** `vault/vault-values.gomplate.yaml`

```yaml
server:
  resources:
    requests:
      cpu: 50m
      memory: 512Mi
    limits:
      cpu: 50m
      memory: 512Mi

injector:
  resources:
    requests:
      cpu: 50m
      memory: 128Mi
    limits:
      cpu: 50m
      memory: 128Mi

csi:
  enabled: true
  agent:
    resources:
      requests:
        cpu: 50m
        memory: 128Mi
      limits:
        cpu: 50m
        memory: 128Mi
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 50m
      memory: 128Mi
```

**Apply:**

```bash
cd vault
gomplate -f vault-values.gomplate.yaml -o vault-values.yaml
helm upgrade vault hashicorp/vault --version ${VAULT_CHART_VERSION} \
    -n vault -f vault-values.yaml
```

**Note:** After updating StatefulSet resources, delete the pod to apply changes:

```bash
kubectl delete pod vault-0 -n vault
# Unseal Vault after restart
kubectl exec -n vault vault-0 -- vault operator unseal <UNSEAL_KEY>
```

### CRD-Managed Components

For components managed by Custom Resource Definitions, patch the CRD directly.

#### Example: PostgreSQL Cluster (CloudNativePG)

**Update values file**

**File:** `postgres/postgres-cluster-values.gomplate.yaml`

```yaml
cluster:
  instances: 1

  # Resource configuration (Guaranteed QoS)
  resources:
    requests:
      cpu: 200m
      memory: 1Gi
    limits:
      cpu: 200m
      memory: 1Gi

  storage:
    size: {{ .Env.POSTGRES_STORAGE_SIZE }}
```

**Apply via justfile:**

```bash
just postgres::create-cluster
```

**Restart pod to apply changes:**

```bash
kubectl delete pod postgres-cluster-1 -n postgres
kubectl wait --for=condition=Ready pod/postgres-cluster-1 -n postgres --timeout=180s
```

**Data Safety:** PostgreSQL data is stored in PersistentVolumeClaim (PVC) and will be preserved during pod restart.

### Verification

After applying resource configurations:

**1. Check resource settings:**

```bash
# For standard workloads
kubectl get deployment <name> -n <namespace> -o jsonpath='{.spec.template.spec.containers[0].resources}' | jq

# For pods
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.spec.containers[0].resources}' | jq
```

**2. Verify QoS Class:**

```bash
kubectl get pod <pod-name> -n <namespace> -o jsonpath='{.status.qosClass}'
```

**3. Check actual usage:**

```bash
kubectl top pod <pod-name> -n <namespace>
```

## Best Practices

### Choosing QoS Class

| Component Type | Recommended QoS | Rationale |
|---------------|-----------------|-----------|
| **Data stores** (PostgreSQL, Vault) | Guaranteed | Critical services, data integrity, predictable performance |
| **Operators** (CNPG, etc.) | Burstable | Lightweight controllers, occasional spikes |
| **Auxiliary services** (Injectors, CSI providers) | Burstable | Support services, variable load |

### Setting Resource Values

**1. Start with actual usage:**

```bash
# Check current usage
kubectl top pod <pod-name> -n <namespace>

# Check historical usage in Grafana
# Dashboard: Kubernetes / Compute Resources / Pod
```

**2. Add appropriate headroom:**

| Scenario | Recommended Multiplier | Example |
|----------|----------------------|---------|
| Stable, predictable load | 2-3x current usage | Current: 40m → Set: 100m |
| Variable load | 5-10x current usage | Current: 40m → Set: 200m |
| Growth expected | 5-10x current usage | Current: 200Mi → Set: 1Gi |

**3. Use round numbers:**

- CPU: 50m, 100m, 200m, 500m, 1000m (1 core)
- Memory: 64Mi, 128Mi, 256Mi, 512Mi, 1Gi, 2Gi

**4. Monitor and adjust:**

- Check usage patterns after 1-2 weeks
- Adjust based on observed peak usage
- Iterate as workload changes

### Resource Configuration Examples

Based on actual deployments in buun-stack:

```yaml
# PostgreSQL Operator (Burstable)
resources:
  requests:
    cpu: 50m
    memory: 128Mi
  limits:
    cpu: 100m
    memory: 256Mi

# PostgreSQL Cluster (Guaranteed)
resources:
  requests:
    cpu: 200m
    memory: 1Gi
  limits:
    cpu: 200m
    memory: 1Gi

# Vault Server (Guaranteed)
resources:
  requests:
    cpu: 50m
    memory: 512Mi
  limits:
    cpu: 50m
    memory: 512Mi

# Vault Agent Injector (Guaranteed)
resources:
  requests:
    cpu: 50m
    memory: 128Mi
  limits:
    cpu: 50m
    memory: 128Mi
```

## Troubleshooting

### Pod Stuck in Pending State

**Symptom:**

```plain
NAME       READY   STATUS    RESTARTS   AGE
my-pod     0/1     Pending   0          5m
```

**Check events:**

```bash
kubectl describe pod <pod-name> -n <namespace> | tail -20
```

**Common causes:**

#### Insufficient resources

```plain
FailedScheduling: 0/1 nodes are available: 1 Insufficient cpu/memory
```

**Solution:** Reduce resource requests or add more nodes

#### Pod anti-affinity

```plain
FailedScheduling: 0/1 nodes are available: 1 node(s) didn't match pod anti-affinity rules
```

**Solution:** Delete old pod to allow new pod to schedule

```bash
kubectl delete pod <old-pod-name> -n <namespace>
```

### OOMKilled (Out of Memory)

**Symptom:**

```plain
NAME       READY   STATUS      RESTARTS   AGE
my-pod     0/1     OOMKilled   1          5m
```

**Solution:**

#### Check memory limit is sufficient

```bash
kubectl top pod <pod-name> -n <namespace>
```

#### Increase memory limits

```yaml
resources:
  limits:
    memory: 2Gi  # Increase from 1Gi
```

### Helm Stuck in pending-upgrade

**Symptom:**

```bash
helm status <release> -n <namespace>
# STATUS: pending-upgrade
```

**Solution:**

```bash
# Remove pending release secret
kubectl get secrets -n <namespace> -l owner=helm,name=<release> --sort-by=.metadata.creationTimestamp
kubectl delete secret sh.helm.release.v1.<release>.v<pending-version> -n <namespace>

# Verify status is back to deployed
helm status <release> -n <namespace>

# Re-run upgrade
helm upgrade <release> <chart> -n <namespace> -f values.yaml
```

### VPA Not Providing Recommendations

**Symptom:**

- VPA shows "NoPodsMatched" or "ConfigUnsupported"
- Goldilocks shows empty containers section

**Cause:**
VPA cannot monitor Custom Resource Definitions (CRDs) directly

**Solution:**
Use alternative monitoring methods:

1. kubectl top pod
2. Grafana dashboards
3. Prometheus queries

For CRDs, configure resources manually based on observed usage patterns.

## References

- [Kubernetes Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Kubernetes QoS Classes](https://kubernetes.io/docs/tasks/configure-pod-container/quality-service-pod/)
- [Goldilocks Documentation](https://goldilocks.docs.fairwinds.com/)
- [CloudNativePG Resource Management](https://cloudnative-pg.io/documentation/current/resource_management/)
