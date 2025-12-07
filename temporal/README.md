# Temporal

Durable workflow execution platform for building reliable distributed applications:

- **Durable Execution**: Workflows survive process and infrastructure failures
- **Language Support**: SDKs for Go, Java, Python, TypeScript, .NET, PHP
- **Visibility**: Query and observe workflow state via Web UI and APIs
- **Scalability**: Horizontally scalable architecture
- **Multi-tenancy**: Namespace-based isolation for workflows

## Prerequisites

- Kubernetes cluster (k3s)
- PostgreSQL cluster (CloudNativePG)
- Keycloak installed and configured
- Vault for secrets management
- External Secrets Operator (optional, for Vault integration)

## Installation

```bash
just temporal::install
```

You will be prompted for:

- **Temporal host (FQDN)**: e.g., `temporal.example.com`
- **Keycloak host (FQDN)**: e.g., `auth.example.com`
- **Enable Prometheus monitoring**: If kube-prometheus-stack is installed

### What Gets Installed

- Temporal Server (frontend, history, matching, worker services)
- Temporal Web UI with Keycloak OIDC authentication
- Temporal Admin Tools for cluster management
- PostgreSQL databases (`temporal`, `temporal_visibility`)
- Keycloak OAuth client (confidential client)
- Vault secrets (if External Secrets Operator is available)

## Configuration

Environment variables (set in `.env.local` or override):

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `TEMPORAL_NAMESPACE` | `temporal` | Kubernetes namespace |
| `TEMPORAL_CHART_VERSION` | `0.52.0` | Helm chart version |
| `TEMPORAL_HOST` | (prompt) | External hostname (FQDN) |
| `TEMPORAL_OIDC_CLIENT_ID` | `temporal` | Keycloak client ID |
| `KEYCLOAK_HOST` | (prompt) | Keycloak hostname (FQDN) |
| `KEYCLOAK_REALM` | `buunstack` | Keycloak realm |
| `MONITORING_ENABLED` | (prompt) | Enable Prometheus ServiceMonitor |

## Architecture

```plain
External Users
      |
Cloudflare Tunnel (HTTPS)
      |
Traefik Ingress (HTTPS)
      |
Temporal Web UI (HTTP inside cluster)
  |-- OAuth --> Keycloak (authentication)
      |
Temporal Server
  |-- Frontend Service (gRPC :7233)
  |   |-- Client connections
  |   |-- Workflow/Activity APIs
  |
  |-- History Service
  |   |-- Workflow state management
  |   |-- Event sourcing
  |
  |-- Matching Service
  |   |-- Task queue management
  |   |-- Worker polling
  |
  |-- Worker Service
  |   |-- System workflows
  |   |-- Archival
      |
PostgreSQL (temporal, temporal_visibility)
```

**Key Components**:

- **Frontend**: Entry point for all client requests (gRPC API)
- **History**: Maintains workflow execution history and state
- **Matching**: Routes tasks to appropriate workers
- **Worker**: Executes internal system workflows
- **Web UI**: Browser-based workflow monitoring and management
- **Admin Tools**: CLI tools for cluster administration

## Usage

### Access Web UI

1. Navigate to `https://your-temporal-host/`
2. Authenticate via Keycloak SSO
3. Select a namespace to view workflows

### Temporal CLI Setup (Local Development)

The Temporal gRPC endpoint is only accessible within the cluster network. Use [Telepresence](https://www.telepresence.io/) to connect from your local machine.

#### Step 1: Connect to the Cluster

```bash
telepresence connect
```

#### Step 2: Configure Temporal CLI

Set environment variables (add to `.bashrc`, `.zshrc`, or use direnv):

```bash
export TEMPORAL_ADDRESS="temporal-frontend.temporal:7233"
export TEMPORAL_NAMESPACE="default"
```

Or create a named environment for multiple clusters:

```bash
# Configure named environment
temporal env set --env buun -k address -v temporal-frontend.temporal:7233
temporal env set --env buun -k namespace -v default

# Use with commands
temporal workflow list --env buun
```

#### Step 3: Verify Connection

```bash
# Check telepresence status
telepresence status

# Test Temporal connection
temporal operator namespace list
```

#### CLI Examples

```bash
# List workflows
temporal workflow list

# Describe a workflow
temporal workflow describe --workflow-id my-workflow-id

# Query workflow state
temporal workflow query --workflow-id my-workflow-id --type my-query

# Signal a workflow
temporal workflow signal --workflow-id my-workflow-id --name my-signal

# Terminate a workflow
temporal workflow terminate --workflow-id my-workflow-id --reason "manual termination"
```

### Create a Temporal Namespace

Before running workflows, create a namespace:

```bash
just temporal::create-temporal-namespace default
```

With custom retention period:

```bash
just temporal::create-temporal-namespace myapp 7d
```

### List Temporal Namespaces

```bash
just temporal::list-temporal-namespaces
```

### Cluster Health Check

```bash
just temporal::cluster-info
```

### Connect Workers

Workers connect to the Temporal Frontend service. From within the cluster:

```text
temporal-frontend.temporal:7233
```

Example Python worker:

```python
from temporalio.client import Client
from temporalio.worker import Worker

async def main():
    client = await Client.connect("temporal-frontend.temporal:7233")

    worker = Worker(
        client,
        task_queue="my-task-queue",
        workflows=[MyWorkflow],
        activities=[my_activity],
    )
    await worker.run()
```

Example Go worker:

```go
import (
    "go.temporal.io/sdk/client"
    "go.temporal.io/sdk/worker"
)

func main() {
    c, _ := client.Dial(client.Options{
        HostPort: "temporal-frontend.temporal:7233",
    })
    defer c.Close()

    w := worker.New(c, "my-task-queue", worker.Options{})
    w.RegisterWorkflow(MyWorkflow)
    w.RegisterActivity(MyActivity)
    w.Run(worker.InterruptCh())
}
```

## Authentication

### Web UI (OIDC)

- Users authenticate via Keycloak
- Standard OIDC flow with Authorization Code grant
- Configured via environment variables in the Web UI deployment

### gRPC API

- By default, no authentication is required for gRPC connections within the cluster
- For production, configure mTLS or JWT-based authorization

## Management

### Upgrade Temporal

```bash
just temporal::upgrade
```

### Uninstall

```bash
just temporal::uninstall
```

This removes:

- Helm release and all Kubernetes resources
- Namespace
- Keycloak client

**Note**: The following resources are NOT deleted:

- PostgreSQL databases (`temporal`, `temporal_visibility`)
- Vault secrets

### Full Cleanup

To remove everything including databases and Vault secrets:

```bash
just temporal::uninstall true
```

Or manually:

```bash
just temporal::delete-postgres-user-and-db
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n temporal
```

Expected pods:

- `temporal-frontend-*` - Frontend service
- `temporal-history-*` - History service
- `temporal-matching-*` - Matching service
- `temporal-worker-*` - Worker service
- `temporal-web-*` - Web UI
- `temporal-admintools-*` - Admin tools

### View Logs

```bash
# Frontend logs
kubectl logs -n temporal deployment/temporal-frontend --tail=100

# History logs
kubectl logs -n temporal deployment/temporal-history --tail=100

# Web UI logs
kubectl logs -n temporal deployment/temporal-web --tail=100
```

### Database Connection Issues

Check PostgreSQL connectivity:

```bash
kubectl exec -n temporal deployment/temporal-admintools -- \
  psql -h postgres-cluster-rw.postgres -U temporal -d temporal -c "SELECT 1"
```

### Schema Issues

If schema initialization fails, check the schema job:

```bash
kubectl logs -n temporal -l app.kubernetes.io/component=schema --all-containers
```

### Service Discovery Issues

Verify services are running:

```bash
kubectl get svc -n temporal
```

Test frontend connectivity from admin tools:

```bash
kubectl exec -n temporal deployment/temporal-admintools -- \
  tctl cluster health
```

### Web UI Login Issues

Verify Keycloak client configuration:

```bash
just keycloak::get-client buunstack temporal
```

Check Web UI environment variables:

```bash
kubectl get deployment temporal-web -n temporal -o jsonpath='{.spec.template.spec.containers[0].env}' | jq
```

## Configuration Files

| File | Description |
| ---- | ----------- |
| `temporal-values.gomplate.yaml` | Helm values template |
| `postgres-external-secret.gomplate.yaml` | PostgreSQL credentials ExternalSecret |
| `keycloak-auth-external-secret.gomplate.yaml` | Keycloak OIDC credentials ExternalSecret |

## Security Considerations

- **Pod Security Standards**: Namespace configured with **baseline** enforcement
- **Server Security**: Temporal server components run with restricted-compliant security contexts

### Why Not Restricted?

The namespace cannot use `restricted` Pod Security Standards due to the Temporal Web UI image (`temporalio/ui`):

- The image writes configuration files to `./config/docker.yaml` at startup
- The container's filesystem is owned by root (UID 0)
- When running as non-root user (UID 1000), the container cannot write to these paths
- Error: `unable to create open ./config/docker.yaml: permission denied`

The Temporal server components (frontend, history, matching, worker) **do** meet `restricted` requirements and run with full security hardening. Only the Web UI component requires `baseline`.

### Server Security Context

Temporal server components (frontend, history, matching, worker) run with:

- `runAsNonRoot: true`
- `runAsUser: 1000`
- `allowPrivilegeEscalation: false`
- `seccompProfile.type: RuntimeDefault`
- `capabilities.drop: [ALL]`

## References

- [Temporal Documentation](https://docs.temporal.io/)
- [Temporal GitHub](https://github.com/temporalio/temporal)
- [Temporal Helm Charts](https://github.com/temporalio/helm-charts)
