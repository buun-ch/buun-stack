# CH-UI

[CH-UI](https://github.com/caioricciuti/ch-ui) is a modern, feature-rich web interface for ClickHouse databases.

## TL;DR

```bash
helm install ch-ui ./charts/ch-ui \
  --set clickhouse.url="http://clickhouse:8123" \
  --set clickhouse.auth.password="your-password"
```

## Introduction

This chart bootstraps a [CH-UI](https://github.com/caioricciuti/ch-ui) deployment on a [Kubernetes](https://kubernetes.io) cluster using the [Helm](https://helm.sh) package manager.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+
- PV provisioner support in the underlying infrastructure (if persistence is needed)
- ClickHouse server accessible from the cluster

## Installing the Chart

To install the chart with the release name `ch-ui`:

```bash
helm install ch-ui ./charts/ch-ui
```

The command deploys CH-UI on the Kubernetes cluster in the default configuration. The [Parameters](#parameters) section lists the parameters that can be configured during installation.

> **Tip**: List all releases using `helm list`

## Uninstalling the Chart

To uninstall/delete the `ch-ui` deployment:

```bash
helm delete ch-ui
```

The command removes all the Kubernetes components associated with the chart and deletes the release.

## Parameters

### Global parameters

| Name                      | Description                                     | Value |
| ------------------------- | ----------------------------------------------- | ----- |
| `nameOverride`            | String to partially override ch-ui.fullname    | `""`  |
| `fullnameOverride`        | String to fully override ch-ui.fullname        | `""`  |
| `imagePullSecrets`        | Global Docker registry secret names as an array | `[]`  |

### Common parameters

| Name                                        | Description                                                                                                     | Value                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `replicaCount`                              | Number of CH-UI replicas to deploy                                                                             | `1`                          |
| `image.repository`                          | CH-UI image repository                                                                                         | `ghcr.io/caioricciuti/ch-ui` |
| `image.pullPolicy`                          | CH-UI image pull policy                                                                                        | `IfNotPresent`               |
| `image.tag`                                 | CH-UI image tag (immutable tags are recommended)                                                               | `""`                         |
| `serviceAccount.create`                     | Specifies whether a ServiceAccount should be created                                                           | `true`                       |
| `serviceAccount.automount`                  | Automatically mount a ServiceAccount's API credentials?                                                        | `true`                       |
| `serviceAccount.annotations`                | Annotations to add to the service account                                                                      | `{}`                         |
| `serviceAccount.name`                       | The name of the ServiceAccount to use                                                                          | `""`                         |
| `podAnnotations`                            | Annotations for CH-UI pods                                                                                     | `{}`                         |
| `podLabels`                                 | Extra labels for CH-UI pods                                                                                    | `{}`                         |
| `podSecurityContext`                        | Set CH-UI pod's Security Context                                                                               | `{}`                         |
| `securityContext`                           | Set CH-UI container's Security Context                                                                         | `{}`                         |

### CH-UI Configuration parameters

| Name                                        | Description                                                                                                     | Value                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `clickhouse.url`                            | ClickHouse server URL                                                                                          | `"http://clickhouse:8123"`   |
| `clickhouse.auth.username`                  | ClickHouse username                                                                                             | `"default"`                  |
| `clickhouse.auth.password`                  | ClickHouse password (ignored if existingSecret is set)                                                         | `""`                         |
| `clickhouse.auth.existingSecret`            | Name of existing Secret containing ClickHouse password                                                         | `""`                         |
| `clickhouse.auth.secretKeys.password`       | Key in the existing Secret containing the password                                                             | `"clickhouse-password"`      |
| `clickhouse.useAdvanced`                    | Enable advanced mode                                                                                           | `false`                      |
| `clickhouse.requestTimeout`                 | Request timeout in milliseconds                                                                                | `30000`                      |
| `clickhouse.basePath`                       | Base path for the application                                                                                  | `"/"`                        |

### Exposure parameters

| Name                                        | Description                                                                                                     | Value                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `service.type`                              | CH-UI service type                                                                                             | `ClusterIP`                  |
| `service.port`                              | CH-UI service HTTP port                                                                                        | `80`                         |
| `service.targetPort`                        | CH-UI container port                                                                                           | `5521`                       |
| `ingress.enabled`                           | Enable ingress record generation for CH-UI                                                                    | `false`                      |
| `ingress.className`                         | IngressClass that will be be used to implement the Ingress (Kubernetes 1.18+)                                  | `""`                         |
| `ingress.annotations`                       | Additional annotations for the Ingress resource                                                                | `{}`                         |
| `ingress.hosts[0].host`                     | Default host for the ingress record                                                                            | `ch-ui.local`                |
| `ingress.hosts[0].paths[0].path`            | Default path for the default host                                                                              | `/`                          |
| `ingress.hosts[0].paths[0].pathType`        | Ingress path type                                                                                              | `ImplementationSpecific`     |
| `ingress.tls`                               | Enable TLS configuration for the host defined at `ingress.hosts[0].host` parameter                             | `[]`                         |

### Resource parameters

| Name                                        | Description                                                                                                     | Value                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `resources.limits.cpu`                      | The CPU limits for the CH-UI containers                                                                        | `500m`                       |
| `resources.limits.memory`                   | The memory limits for the CH-UI containers                                                                     | `512Mi`                      |
| `resources.requests.cpu`                    | The requested CPU for the CH-UI containers                                                                     | `100m`                       |
| `resources.requests.memory`                 | The requested memory for the CH-UI containers                                                                  | `128Mi`                      |
| `livenessProbe.httpGet.path`                | Path for liveness probe                                                                                        | `/`                          |
| `livenessProbe.httpGet.port`                | Port for liveness probe                                                                                        | `http`                       |
| `livenessProbe.initialDelaySeconds`         | Initial delay seconds for liveness probe                                                                       | `30`                         |
| `livenessProbe.timeoutSeconds`              | Timeout seconds for liveness probe                                                                             | `5`                          |
| `readinessProbe.httpGet.path`               | Path for readiness probe                                                                                       | `/`                          |
| `readinessProbe.httpGet.port`               | Port for readiness probe                                                                                       | `http`                       |
| `readinessProbe.initialDelaySeconds`        | Initial delay seconds for readiness probe                                                                      | `5`                          |
| `readinessProbe.timeoutSeconds`             | Timeout seconds for readiness probe                                                                            | `5`                          |
| `autoscaling.enabled`                       | Enable Horizontal POD autoscaling for CH-UI                                                                   | `false`                      |
| `autoscaling.minReplicas`                   | Minimum number of CH-UI replicas                                                                               | `1`                          |
| `autoscaling.maxReplicas`                   | Maximum number of CH-UI replicas                                                                               | `3`                          |
| `autoscaling.targetCPUUtilizationPercentage`| Target CPU utilization percentage                                                                              | `80`                         |

### Additional parameters

| Name                                        | Description                                                                                                     | Value                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `extraEnvVars`                              | Array with extra environment variables to add to CH-UI containers                                              | `[]`                         |
| `extraEnvVarsCM`                            | Name of existing ConfigMap containing extra env vars for CH-UI containers                                      | `""`                         |
| `extraEnvVarsSecret`                        | Name of existing Secret containing extra env vars for CH-UI containers                                         | `""`                         |
| `volumes`                                   | Optionally specify extra list of additional volumes for the CH-UI pod(s)                                       | `[]`                         |
| `volumeMounts`                              | Optionally specify extra list of additional volumeMounts for the CH-UI container(s)                            | `[]`                         |
| `nodeSelector`                              | Node labels for pod assignment                                                                                 | `{}`                         |
| `tolerations`                               | Tolerations for pod assignment                                                                                 | `[]`                         |
| `affinity`                                  | Affinity for pod assignment                                                                                    | `{}`                         |

## Configuration and installation details

### Using an existing Secret

Instead of passing the ClickHouse password directly, you can use an existing Kubernetes Secret:

1. Create a Secret with your ClickHouse password:

```bash
kubectl create secret generic clickhouse-secret \
  --from-literal=clickhouse-password="your-password"
```

2. Install the chart using the existing Secret:

```bash
helm install ch-ui ./charts/ch-ui \
  --set clickhouse.auth.existingSecret="clickhouse-secret" \
  --set clickhouse.auth.secretKeys.password="clickhouse-password"
```

### Exposing CH-UI

#### Using Ingress

To expose CH-UI using an Ingress:

```bash
helm install ch-ui ./charts/ch-ui \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host="ch-ui.example.com" \
  --set ingress.className="nginx"
```

#### Using LoadBalancer

To expose CH-UI using a LoadBalancer service:

```bash
helm install ch-ui ./charts/ch-ui \
  --set service.type=LoadBalancer
```

#### Using NodePort

To expose CH-UI using a NodePort service:

```bash
helm install ch-ui ./charts/ch-ui \
  --set service.type=NodePort
```

### Adding extra environment variables

You can add extra environment variables using `extraEnvVars`:

```bash
helm install ch-ui ./charts/ch-ui \
  --set extraEnvVars[0].name=LOG_LEVEL \
  --set extraEnvVars[0].value=debug
```

Or by referencing an existing ConfigMap or Secret:

```bash
helm install ch-ui ./charts/ch-ui \
  --set extraEnvVarsCM=my-configmap \
  --set extraEnvVarsSecret=my-secret
```

## Examples

### Basic installation with password

```bash
helm install ch-ui ./charts/ch-ui \
  --set clickhouse.url="http://my-clickhouse:8123" \
  --set clickhouse.auth.username="admin" \
  --set clickhouse.auth.password="secretpassword"
```

### Installation with external ClickHouse and Ingress

```bash
helm install ch-ui ./charts/ch-ui \
  --set clickhouse.url="http://clickhouse.example.com:8123" \
  --set clickhouse.auth.existingSecret="clickhouse-credentials" \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host="ch-ui.example.com" \
  --set ingress.tls[0].secretName="ch-ui-tls" \
  --set ingress.tls[0].hosts[0]="ch-ui.example.com"
```

### Installation with resource limits

```bash
helm install ch-ui ./charts/ch-ui \
  --set resources.requests.memory="256Mi" \
  --set resources.requests.cpu="250m" \
  --set resources.limits.memory="1Gi" \
  --set resources.limits.cpu="1"
```

## Troubleshooting

### CH-UI cannot connect to ClickHouse

1. Verify that the ClickHouse URL is correct and accessible from within the cluster:

```bash
kubectl run -it --rm debug --image=busybox --restart=Never -- wget -O- http://clickhouse:8123
```

2. Check the CH-UI logs:

```bash
kubectl logs -l app.kubernetes.io/name=ch-ui
```

3. Verify the credentials are correct by checking the Secret:

```bash
kubectl get secret ch-ui-secret -o jsonpath='{.data.clickhouse-password}' | base64 -d
```

### CH-UI is not accessible

1. Check the service is running:

```bash
kubectl get svc -l app.kubernetes.io/name=ch-ui
```

2. For Ingress issues, check the Ingress controller logs and ensure the Ingress resource is created:

```bash
kubectl get ingress
kubectl describe ingress ch-ui
```
