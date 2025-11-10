# Vertical Pod Autoscaler (VPA)

Kubernetes resource monitoring and recommendation system:

- **Monitoring-only mode**: Observes workloads without automatic scaling
- **Prometheus integration**: Metrics collection via Prometheus instead of metrics-server
- **Resource recommendations**: Generates CPU and memory suggestions based on actual usage
- **Goldilocks integration**: Works with Goldilocks dashboard for visualization
- **Non-intrusive**: Does not modify running workloads

## Important Note

**This VPA installation is configured for monitoring and recommendation only**:

- ✅ **Recommender**: Enabled - Analyzes workload metrics and generates recommendations
- ❌ **Updater**: Disabled - Does NOT automatically apply recommendations to pods
- ❌ **Admission Controller**: Disabled - Does NOT modify pod resources at creation time

This configuration ensures VPA observes your workloads without affecting them. You can review recommendations and manually adjust resource settings.

## Prerequisites

- Kubernetes cluster (k3s)
- Prometheus (kube-prometheus-stack) installed

VPA requires Prometheus to collect historical metrics data. Install Prometheus first:

```bash
just prometheus::install
```

## Installation

```bash
just vpa::install
```

The installation will automatically detect Prometheus and configure VPA to use it as the metrics source.

## Configuration

Environment variables (set in `.env.local` or override):

```bash
VPA_NAMESPACE=vpa                                                   # VPA namespace
PROMETHEUS_NAMESPACE=monitoring                                     # Prometheus namespace
PROMETHEUS_ADDRESS=http://kube-prometheus-stack-prometheus.monitoring.svc:9090  # Prometheus URL
```

## Usage

### View VPA Status

```bash
just vpa::status
```

### View Recommender Logs

```bash
just vpa::logs-recommender
```

### View VPA Resources

List all VPA resources across namespaces:

```bash
kubectl get vpa -A
```

View specific VPA recommendations:

```bash
kubectl describe vpa <vpa-name> -n <namespace>
```

Get recommendation in JSON format:

```bash
kubectl get vpa <vpa-name> -n <namespace> -o jsonpath='{.status.recommendation}' | jq
```

### Manual VPA Resource Creation

Create a VPA resource for monitoring:

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: my-app-vpa
  namespace: default
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  updatePolicy:
    updateMode: "Off"  # Monitoring only
```

Apply with:

```bash
kubectl apply -f vpa-resource.yaml
```

## Integration with Goldilocks

VPA alone provides raw recommendations through kubectl commands. For a user-friendly dashboard experience, use Goldilocks:

```bash
# Install Goldilocks
just goldilocks::install

# Enable monitoring for specific namespaces
just goldilocks::enable-namespace <namespace>
```

Goldilocks automatically creates VPA resources for all workloads in labeled namespaces and presents recommendations in a web dashboard.

## Enabling Automatic Scaling

If you want to enable automatic pod resource updates, modify `values.gomplate.yaml`:

```yaml
updater:
  enabled: true
  replicaCount: 1
  resources:
    requests:
      cpu: 50m
      memory: 500Mi
    limits:
      cpu: 200m
      memory: 1Gi
  podMonitor:
    enabled: true

admissionController:
  enabled: true
  replicaCount: 1
  generateCertificate: true
  mutatingWebhookConfiguration:
    failurePolicy: Ignore
  resources:
    requests:
      cpu: 50m
      memory: 200Mi
    limits:
      cpu: 200m
      memory: 500Mi
```

Then reinstall:

```bash
just vpa::install
```

⚠️ **Warning**: Enabling updater and admission controller will cause VPA to automatically modify pod resources. Test thoroughly before enabling in production.

## VPA Update Modes

VPA supports three update modes (configured in VPA resource):

- **Off** (Monitoring only - Current configuration): Generates recommendations but does not apply them
- **Initial**: Applies recommendations only when pods are created
- **Auto**: Automatically applies recommendations by evicting and recreating pods

## Management

### Uninstall

```bash
just vpa::uninstall
```

This removes:

- Helm release
- VPA CRDs
- Namespace

## Troubleshooting

### Recommender Not Starting

Check Prometheus connectivity:

```bash
just vpa::logs-recommender
```

Verify Prometheus is running:

```bash
kubectl get pods -n monitoring -l app.kubernetes.io/name=prometheus
```

### No Recommendations Generated

VPA requires workload metrics over time:

- Minimum: A few minutes of runtime
- Recommended: 24+ hours for accurate recommendations

Verify workload is running and generating metrics:

```bash
kubectl get pods -n <namespace>
kubectl top pods -n <namespace>
```

### VPA Resource Not Created

For Goldilocks-managed VPA resources, ensure:

1. Namespace has label: `goldilocks.fairwinds.com/enabled=true`
2. Workload is managed by a controller (Deployment, StatefulSet, etc.)
3. Goldilocks controller is running: `kubectl get pods -n goldilocks`

### Check VPA Components

```bash
kubectl get pods -n vpa
```

Should show:

- `vpa-recommender-*`: Running

## References

- [Kubernetes VPA Documentation](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler)
- [Fairwinds VPA Helm Chart](https://github.com/FairwindsOps/charts/tree/master/stable/vpa)
- [VPA Design Proposals](https://github.com/kubernetes/design-proposals-archive/blob/main/autoscaling/vertical-pod-autoscaler.md)
