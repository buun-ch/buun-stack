# Prometheus

Comprehensive monitoring and observability stack for Kubernetes:

- **Prometheus Operator**: Manages Prometheus instances via CRDs
- **Prometheus**: Time-series database and metrics collection
- **Grafana**: Visualization and dashboarding
- **Alertmanager**: Alert routing and management
- **Node Exporter**: Hardware and OS metrics
- **Kube State Metrics**: Kubernetes cluster state metrics
- **Namespace-based monitoring**: Explicit control via labels
- **OIDC authentication**: Optional Keycloak integration for Grafana

## Prerequisites

- Kubernetes cluster (k3s)
- External Secrets Operator (optional, for Vault integration)
- Vault (optional, for credential storage)
- Keycloak (optional, for Grafana OIDC authentication)

## Installation

```bash
just prometheus::install
```

You will be prompted for:

1. **Grafana host (FQDN)**: e.g., `grafana.example.com`
2. **Grafana admin password**: Auto-generated if not provided

### What Gets Installed

- Prometheus Operator and CRDs
- Prometheus server with namespace selector
- Grafana with ingress
- Alertmanager
- Node Exporter (DaemonSet)
- Kube State Metrics
- Default ServiceMonitors for Kubernetes components

The stack uses the official [kube-prometheus-stack Helm chart](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack).

## Access

### Grafana

Access Grafana at `https://your-grafana-host/`

**Default Credentials**:

- Username: `admin`
- Password: Retrieved via `just prometheus::admin-password`

### Prometheus

Prometheus Web UI is accessible internally within the cluster. For external access, set up port forwarding:

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
```

Then access at `http://localhost:9090`

### Alertmanager

Alertmanager is accessible internally within the cluster. For external access, set up port forwarding:

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-alertmanager 9093:9093
```

Then access at `http://localhost:9093`

## Configuration

Environment variables (set in `.env.local` or override):

```bash
PROMETHEUS_NAMESPACE=monitoring                      # Kubernetes namespace
PROMETHEUS_CHART_VERSION=79.4.0                      # Helm chart version
GRAFANA_HOST=grafana.example.com                     # Grafana FQDN
PROMETHEUS_HOST=prometheus.example.com               # Prometheus FQDN (optional)
ALERTMANAGER_HOST=alertmanager.example.com           # Alertmanager FQDN (optional)
GRAFANA_ADMIN_PASSWORD=                              # Grafana admin password
GRAFANA_OIDC_ENABLED=false                           # Enable Keycloak OIDC
GRAFANA_OIDC_CLIENT_SECRET=                          # Keycloak client secret
KEYCLOAK_NAMESPACE=keycloak                          # Keycloak namespace
KEYCLOAK_REALM=                                      # Keycloak realm
KEYCLOAK_HOST=                                       # Keycloak host
```

## Features

### Namespace-Based Monitoring Control

By default, Prometheus only monitors namespaces with the label `buun.channel/enable-monitoring=true`. This provides explicit control over which resources are monitored.

**Enable monitoring for a namespace**:

```bash
kubectl label namespace <namespace> buun.channel/enable-monitoring=true
```

**Disable monitoring for a namespace**:

```bash
kubectl label namespace <namespace> buun.channel/enable-monitoring-
```

The monitoring namespace is automatically labeled during installation.

### ServiceMonitor and PodMonitor

Prometheus Operator uses `ServiceMonitor` and `PodMonitor` CRDs to configure metric scraping.

**Requirements for automatic discovery**:

1. ServiceMonitor/PodMonitor must be in a namespace with label `buun.channel/enable-monitoring=true`
2. ServiceMonitor/PodMonitor must have label `release=kube-prometheus-stack`

**Example ServiceMonitor**:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-service
  namespace: my-namespace
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: my-service
  endpoints:
    - port: metrics
      path: /metrics
      interval: 30s
```

**Example PodMonitor**:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: my-pods
  namespace: my-namespace
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: my-app
  podMetricsEndpoints:
    - port: metrics
      path: /metrics
      interval: 30s
```

### Metric Relabeling

Use `metricRelabelings` to transform metric names and labels before storing in Prometheus.

**Example: Rename metrics**:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: keycloak
  namespace: keycloak
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: keycloak
  endpoints:
    - port: management
      path: /metrics
      interval: 30s
      metricRelabelings:
        - sourceLabels: [__name__]
          regex: 'vendor_(.*)'
          targetLabel: __name__
          replacement: 'keycloak_$1'
```

This configuration converts `vendor_*` metrics to `keycloak_*` for better discoverability.

## OIDC Authentication

### Setup Keycloak OIDC for Grafana

```bash
just prometheus::setup-oidc
```

This will:

1. Create Keycloak client `grafana`
2. Create `grafana-admins` group in Keycloak
3. Update Grafana configuration to use Keycloak OIDC
4. Restart Grafana with new settings

**Grant admin access to a user**:

```bash
just keycloak::add-user-to-group <username> grafana-admins
```

Users in the `grafana-admins` group will have Grafana Admin role.

### Disable OIDC

```bash
just prometheus::disable-oidc
```

This will revert Grafana to local authentication.

## Management

### Get Grafana Admin Password

```bash
just prometheus::admin-password
```

### Upgrade Stack

```bash
# Update Helm values and upgrade
gomplate -f prometheus/values.gomplate.yaml -o prometheus/values.yaml
helm upgrade kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --version 79.4.0 \
  -n monitoring \
  -f prometheus/values.yaml
```

### Uninstall

```bash
just prometheus::uninstall
```

This will remove:

- Helm release
- All Prometheus Operator CRDs
- Namespace

## Monitoring Examples

### PostgreSQL (CloudNativePG)

Enable monitoring for PostgreSQL cluster:

```bash
just postgres::enable-monitoring
```

This creates a PodMonitor for the PostgreSQL cluster with proper labels.

### Keycloak

Enable monitoring for Keycloak:

```bash
just keycloak::enable-monitoring
```

This creates a ServiceMonitor that:

- Scrapes metrics from Keycloak management port (9000)
- Converts `vendor_*` metrics to `keycloak_*` for better discoverability

### Custom Services

For services not managed by buun-stack justfiles:

1. **Label the namespace**:

   ```bash
   kubectl label namespace <namespace> buun.channel/enable-monitoring=true
   ```

2. **Create ServiceMonitor with proper labels**:

   ```yaml
   apiVersion: monitoring.coreos.com/v1
   kind: ServiceMonitor
   metadata:
     name: my-service
     namespace: my-namespace
     labels:
       release: kube-prometheus-stack
   spec:
     selector:
       matchLabels:
         app: my-service
     endpoints:
       - port: metrics
         path: /metrics
         interval: 30s
   ```

3. **Verify target is discovered**:

   ```bash
   kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
   # Open http://localhost:9090/targets in browser
   ```

## Grafana Dashboards

The stack includes default dashboards for:

- Kubernetes cluster overview
- Node metrics
- Pod metrics
- Persistent volumes
- StatefulSets

**Import additional dashboards**:

1. Go to Grafana → Dashboards → Import
2. Enter dashboard ID from [Grafana Dashboard Library](https://grafana.com/grafana/dashboards/)
3. Select Prometheus data source
4. Click Import

**Popular dashboard IDs**:

- `15757` - Kubernetes / Views / Global
- `15758` - Kubernetes / Views / Namespaces
- `15759` - Kubernetes / Views / Pods
- `3662` - Prometheus 2.0 Stats
- `12006` - Kubernetes API Server

## Troubleshooting

### ServiceMonitor Not Discovered

**Check namespace label**:

```bash
kubectl get namespace <namespace> --show-labels
```

Should have `buun.channel/enable-monitoring=true`.

**Check ServiceMonitor labels**:

```bash
kubectl get servicemonitor <name> -n <namespace> --show-labels
```

Should have `release=kube-prometheus-stack`.

**Check Prometheus targets**:

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
# Open http://localhost:9090/targets
```

### Metrics Not Appearing in Grafana

**Refresh Grafana metrics list**:

1. Hard refresh browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows/Linux)
2. Wait a few minutes for Grafana's metric cache to update
3. Query metrics directly in Explore tab

**Verify metrics in Prometheus**:

```bash
kubectl port-forward -n monitoring svc/kube-prometheus-stack-prometheus 9090:9090
# Open http://localhost:9090/graph
# Query your metrics directly
```

**Check metricRelabelings**:

```bash
# View Prometheus scrape config
kubectl exec -n monitoring prometheus-kube-prometheus-stack-prometheus-0 -- \
  cat /etc/prometheus/config_out/prometheus.env.yaml | grep -A 20 "job_name: serviceMonitor/<namespace>/<name>"
```

### OIDC Authentication Issues

**Verify Keycloak client exists**:

```bash
just keycloak::list-clients
```

Should show `grafana` client.

**Check redirect URL**:

The redirect URL should be `https://your-grafana-host/login/generic_oauth`.

**Verify user is in grafana-admins group**:

```bash
just keycloak::add-user-to-group <username> grafana-admins
```

### Check Pod Status

```bash
kubectl get pods -n monitoring
```

### View Prometheus Logs

```bash
kubectl logs -n monitoring prometheus-kube-prometheus-stack-prometheus-0
```

### View Grafana Logs

```bash
kubectl logs -n monitoring deployment/kube-prometheus-stack-grafana
```

## References

- [kube-prometheus-stack Helm Chart](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack)
- [Prometheus Operator Documentation](https://prometheus-operator.dev/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [ServiceMonitor CRD](https://prometheus-operator.dev/docs/operator/api/#servicemonitor)
- [PodMonitor CRD](https://prometheus-operator.dev/docs/operator/api/#podmonitor)
- [Alertmanager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)
