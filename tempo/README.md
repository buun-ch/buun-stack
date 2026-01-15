# Grafana Tempo

Distributed tracing backend for Kubernetes using Grafana Tempo (single binary mode):

- **Trace Storage**: Efficient storage and retrieval of distributed traces
- **Multi-Protocol Support**: OTLP, Jaeger, Zipkin, OpenCensus receivers
- **Grafana Integration**: Native datasource for trace visualization
- **TraceQL**: Powerful query language for trace analysis
- **ServiceMonitor**: Prometheus metrics for Tempo itself

## Prerequisites

- Kubernetes cluster (k3s)
- kube-prometheus-stack (required for ServiceMonitor and Grafana)

## Installation

```bash
# 1. Install kube-prometheus-stack first (required)
just prometheus::install

# 2. Install Tempo
just tempo::install

# 3. Add Tempo datasource to Grafana
just prometheus::add-tempo-datasource
```

### What Gets Installed

- Tempo single binary (StatefulSet)
- Persistent volume for trace storage
- Service with all receiver endpoints
- ServiceMonitor for Prometheus metrics

The stack uses the official [grafana/tempo Helm chart](https://github.com/grafana/helm-charts/tree/main/charts/tempo).

## Access

### Grafana

Access traces through Grafana:

1. Go to **Explore**
2. Select **Tempo** datasource
3. Use **Search** or **TraceQL** tab

## Configuration

Environment variables (set in `.env.local` or override):

```bash
TEMPO_NAMESPACE=monitoring       # Kubernetes namespace
TEMPO_CHART_VERSION=1.24.3       # Helm chart version
TEMPO_RETENTION=168h             # Trace retention period (default: 7 days)
TEMPO_STORAGE_SIZE=10Gi          # Storage size for traces
```

## Endpoints

Applications can send traces to Tempo using the following endpoints:

| Protocol | Endpoint | Port |
| -------- | -------- | ---- |
| OTLP gRPC | `tempo.monitoring:4317` | 4317 |
| OTLP HTTP | `tempo.monitoring:4318` | 4318 |
| Jaeger gRPC | `tempo.monitoring:14250` | 14250 |
| Jaeger Thrift HTTP | `tempo.monitoring:14268` | 14268 |
| Jaeger Thrift Compact (UDP) | `tempo.monitoring:6831` | 6831 |
| Jaeger Thrift Binary (UDP) | `tempo.monitoring:6832` | 6832 |

### OpenTelemetry SDK Configuration

For applications using OpenTelemetry SDK:

```bash
# gRPC (recommended)
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo.monitoring:4317

# HTTP
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo.monitoring:4318
```

### Jaeger Client Configuration

For applications using Jaeger client:

```bash
JAEGER_AGENT_HOST=tempo.monitoring
JAEGER_AGENT_PORT=6831
```

## TraceQL Examples

Query traces in Grafana using TraceQL:

```bash
# All traces
{}

# Filter by service name
{resource.service.name="my-service"}

# Filter by span name
{name="HTTP GET"}

# Filter by attribute
{span.http.status_code=500}

# Combined filters
{resource.service.name="api-gateway" && span.http.status_code>=400}

# Duration filter (spans longer than 1 second)
{duration>1s}
```

## Management

### Add Tempo Datasource to Grafana

```bash
just prometheus::add-tempo-datasource
```

### Remove Tempo Datasource from Grafana

```bash
just prometheus::remove-tempo-datasource
```

### Uninstall

```bash
just tempo::uninstall
```

This will remove:

- Helm release
- Persistent volume claims

## Sending Test Traces

Send a test trace using curl:

```bash
kubectl run -n monitoring curl-test --rm -it --restart=Never \
  --image=curlimages/curl:latest \
  -- -s -X POST http://tempo.monitoring:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [{"key": "service.name", "value": {"stringValue": "test-service"}}]
      },
      "scopeSpans": [{
        "spans": [{
          "traceId": "5B8EFFF798038103D269B633813FC60C",
          "spanId": "EEE19B7EC3C1B174",
          "name": "test-operation",
          "kind": 1,
          "startTimeUnixNano": "'$(date +%s)'000000000",
          "endTimeUnixNano": "'$(date +%s)'500000000"
        }]
      }]
    }]
  }'
```

## Troubleshooting

### Traces Not Appearing in Grafana

#### Check time range

Ensure the time range in Grafana includes when traces were sent. Use **Last 15 minutes** or **Last 1 hour**.

#### Verify Tempo is receiving traces

```bash
kubectl logs -n monitoring -l app.kubernetes.io/name=tempo -f
```

Look for `msg="push"` entries indicating trace ingestion.

#### Check Tempo API directly

```bash
kubectl run -n monitoring curl-check --rm -it --restart=Never \
  --image=curlimages/curl:latest \
  -- -s "http://tempo.monitoring:3200/api/echo"
```

Should return `echo`.

### ServiceMonitor Not Working

#### Check ServiceMonitor exists

```bash
kubectl get servicemonitor -n monitoring tempo
```

#### Check namespace label

```bash
kubectl get namespace monitoring --show-labels
```

Should have `buun.channel/enable-monitoring=true`.

#### Check persistent volume

```bash
kubectl get pvc -n monitoring -l app.kubernetes.io/name=tempo
```

## References

- [Grafana Tempo Documentation](https://grafana.com/docs/tempo/latest/)
- [Tempo Helm Chart](https://github.com/grafana/helm-charts/tree/main/charts/tempo)
- [TraceQL Documentation](https://grafana.com/docs/tempo/latest/traceql/)
- [OpenTelemetry Protocol (OTLP)](https://opentelemetry.io/docs/specs/otlp/)
- [Jaeger Client Libraries](https://www.jaegertracing.io/docs/latest/client-libraries/)
