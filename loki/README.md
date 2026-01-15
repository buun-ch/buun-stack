# Grafana Loki

Log aggregation system for Kubernetes using Grafana Loki (SingleBinary mode):

- **Log Storage**: Efficient storage and retrieval of application logs
- **Label-Based**: Prometheus-like label approach for log organization
- **Grafana Integration**: Native datasource for log visualization
- **LogQL**: Powerful query language for log analysis
- **Promtail**: DaemonSet agent for collecting container logs

## Prerequisites

- Kubernetes cluster (k3s)
- kube-prometheus-stack (required for ServiceMonitor and Grafana)

## Installation

```bash
# 1. Install kube-prometheus-stack first (required)
just prometheus::install

# 2. Install Loki and Promtail
just loki::install

# 3. Add Loki datasource to Grafana
just prometheus::add-loki-datasource
```

### What Gets Installed

#### Loki

- Loki SingleBinary (StatefulSet)
- Persistent volume for log storage
- Service for log ingestion and queries
- ServiceMonitor for Prometheus metrics

#### Promtail

- Promtail DaemonSet on all nodes
- Collects container logs from `/var/log/pods`
- Automatic label extraction (namespace, pod, container)

The stack uses the official Helm charts:

- [grafana/loki](https://github.com/grafana/loki/tree/main/production/helm/loki)
- [grafana/promtail](https://github.com/grafana/helm-charts/tree/main/charts/promtail)

## Configuration

Environment variables (set in `.env.local` or override):

```bash
LOKI_NAMESPACE=monitoring          # Kubernetes namespace
LOKI_CHART_VERSION=6.49.0          # Loki Helm chart version
PROMTAIL_CHART_VERSION=6.17.1      # Promtail Helm chart version
LOKI_RETENTION=168h                # Log retention period (default: 7 days)
LOKI_STORAGE_SIZE=10Gi             # Storage size for logs
```

## Access

### Grafana

Access logs through Grafana:

1. Go to **Explore**
2. Select **Loki** datasource
3. Use **Label browser** or **LogQL** to query logs

## LogQL Examples

Query logs in Grafana using LogQL:

```bash
# All logs from a namespace
{namespace="default"}

# Logs from a specific pod
{namespace="monitoring", pod="loki-0"}

# Filter by container
{namespace="keycloak", container="keycloak"}

# Search for text pattern
{namespace="default"} |= "error"

# Case-insensitive search
{namespace="default"} |~ "(?i)error"

# Exclude pattern
{namespace="default"} != "debug"

# JSON log parsing
{namespace="default"} | json | level="error"

# Line format transformation
{namespace="default"} | json | line_format "{{.level}} - {{.message}}"

# Count errors per minute
count_over_time({namespace="default"} |= "error" [1m])

# Rate of log lines
rate({namespace="default"}[5m])
```

## Management

### Add Loki Datasource to Grafana

```bash
just prometheus::add-loki-datasource
```

### Remove Loki Datasource from Grafana

```bash
just prometheus::remove-loki-datasource
```

### Reinstall Promtail Only

```bash
just loki::install-promtail
```

### Uninstall Promtail Only

```bash
just loki::uninstall-promtail
```

### Uninstall All (Loki + Promtail)

```bash
just loki::uninstall
```

## Integration with Tempo

Loki and Tempo can be integrated to correlate logs with traces:

- **Logs to Traces**: Click on a trace ID in logs to jump to Tempo
- **Traces to Logs**: View related logs from trace spans

The Grafana datasource configuration automatically enables this integration when both Loki and Tempo are installed.

### Derived Fields

The Loki datasource is configured with a derived field to extract trace IDs:

- Matches: `"traceId":"(\w+)"`
- Links to: Tempo datasource

To use this feature, ensure your application logs include trace IDs in JSON format.

## Troubleshooting

### Logs Not Appearing in Grafana

#### Check Promtail is running

```bash
kubectl get pods -n monitoring -l app.kubernetes.io/name=promtail
```

#### Check Promtail logs

```bash
kubectl logs -n monitoring -l app.kubernetes.io/name=promtail -f
```

Look for errors connecting to Loki.

#### Verify Loki is receiving logs

```bash
kubectl logs -n monitoring -l app.kubernetes.io/name=loki -f
```

#### Check Loki API

### ServiceMonitor Not Working

#### Check namespace label

```bash
kubectl get namespace monitoring --show-labels
```

Should have `buun.channel/enable-monitoring=true`.

## References

- [Grafana Loki Documentation](https://grafana.com/docs/loki/latest/)
- [Loki Helm Chart](https://github.com/grafana/loki/tree/main/production/helm/loki)
- [Promtail Documentation](https://grafana.com/docs/loki/latest/send-data/promtail/)
- [LogQL Documentation](https://grafana.com/docs/loki/latest/query/)
