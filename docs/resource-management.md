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

#### For Standard Workloads (Supported by Goldilocks)

Review Goldilocks recommendations in the dashboard, then configure resources based on your testing status:

**With load testing:**

- Use Goldilocks recommended values with minimal headroom (1.5-2x)
- Round to clean values (50m, 100m, 200m, 512Mi, 1Gi, etc.)

**Without load testing:**

- Add more headroom to handle unexpected load (3-5x)
- Round to clean values

**Example:**

Goldilocks recommendation: 50m CPU, 128Mi Memory

- With load testing: 100m CPU, 256Mi Memory (2x, rounded)
- Without load testing: 200m CPU, 512Mi Memory (4x, rounded)

#### For CRDs and Unsupported Workloads

Use Grafana to check actual resource usage:

1. **Navigate to Grafana dashboard**: `Kubernetes / Compute Resources / Pod`
2. **Select namespace and pod**
3. **Review usage over 24+ hours** to identify peak values

Then apply the same approach:

**With load testing:**

- Use observed peak values with minimal headroom (1.5-2x)

**Without load testing:**

- Add significant headroom (3-5x) for safety

**Example:**

Grafana shows peak: 40m CPU, 207Mi Memory

- With load testing: 100m CPU, 512Mi Memory (2.5x/2.5x, rounded)
- Without load testing: 200m CPU, 1Gi Memory (5x/5x, rounded, Guaranteed QoS)

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
