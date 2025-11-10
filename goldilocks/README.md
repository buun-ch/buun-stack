# Goldilocks

Kubernetes resource recommendation dashboard powered by VPA:

- **Visual dashboard**: User-friendly web interface for VPA recommendations
- **Automatic VPA management**: Creates and manages VPA resources per namespace
- **Multi-workload view**: See all workload recommendations in one place
- **Quality of Service guidance**: Recommendations for Guaranteed, Burstable, and BestEffort QoS classes
- **OAuth2 authentication**: Keycloak integration for secure access
- **Namespace-based monitoring**: Explicit opt-in via labels

## Prerequisites

- Kubernetes cluster (k3s)
- VPA (Vertical Pod Autoscaler) installed
- Keycloak (for OAuth2 authentication)

Install VPA first:

```bash
just vpa::install
```

## Installation

```bash
just goldilocks::install
```

You will be prompted for:

1. **Goldilocks host (FQDN)**: e.g., `goldilocks.example.com`
2. **OAuth2 Proxy setup**: Optional Keycloak authentication

### What Gets Installed

- Goldilocks controller (creates VPA resources)
- Goldilocks dashboard (web UI)
- OAuth2 Proxy (for authentication)
- IngressRoute (Traefik ingress)

## Access

Access the dashboard at `https://your-goldilocks-host/`

Authentication is handled via OAuth2 Proxy with Keycloak.

## Configuration

Environment variables (set in `.env.local` or override):

```bash
GOLDILOCKS_NAMESPACE=goldilocks        # Goldilocks namespace
GOLDILOCKS_HOST=goldilocks.example.com # Dashboard FQDN
VPA_NAMESPACE=vpa                      # VPA namespace
KEYCLOAK_REALM=buunstack               # Keycloak realm
```

## Usage

### Enable Monitoring for a Namespace

Goldilocks uses namespace labels to determine which namespaces to monitor:

```bash
just goldilocks::enable-namespace <namespace>
```

Or directly with kubectl:

```bash
kubectl label namespace <namespace> goldilocks.fairwinds.com/enabled=true
```

### Disable Monitoring for a Namespace

```bash
just goldilocks::disable-namespace <namespace>
```

### View Monitored Namespaces

```bash
kubectl get namespaces -l goldilocks.fairwinds.com/enabled=true
```

### Check Status

```bash
just goldilocks::status
```

### View Logs

```bash
just goldilocks::logs-controller    # Controller logs
just goldilocks::logs-dashboard     # Dashboard logs
```

## Dashboard Features

### Recommendation Views

The dashboard shows recommendations for three Quality of Service (QoS) classes:

1. **Guaranteed QoS**: Requests = Limits (highest priority, no overcommit)
2. **Burstable QoS**: Requests < Limits (allows bursting, some overcommit)
3. **BestEffort QoS**: No requests/limits (lowest priority, full overcommit)

### Workload Information

For each workload, the dashboard displays:

- Current resource settings (requests and limits)
- VPA recommendations (based on actual usage)
- Quality of Service class
- Container-level breakdowns

### Applying Recommendations

Goldilocks is read-only and does not modify workloads. To apply recommendations:

1. Review recommendations in the dashboard
2. Manually update your Deployment/StatefulSet manifests
3. Apply changes via kubectl or your CI/CD pipeline

## OAuth2 Proxy Management

### Setup OAuth2 Proxy

If not configured during installation:

```bash
just goldilocks::setup-oauth2-proxy
```

### Remove OAuth2 Proxy

To disable authentication:

```bash
just goldilocks::remove-oauth2-proxy
```

Note: This will make the dashboard publicly accessible. Use port-forward instead:

```bash
just goldilocks::port-forward
```

Then access at `http://localhost:8080`

## Examples

### Monitor Application Namespaces

Enable monitoring for common application namespaces:

```bash
just goldilocks::enable-namespace dagster
just goldilocks::enable-namespace trino
just goldilocks::enable-namespace metabase
just goldilocks::enable-namespace jupyterhub
```

### Bulk Enable Monitoring

Enable monitoring for multiple namespaces at once:

```bash
for ns in dagster trino metabase superset querybook; do
  kubectl label namespace $ns goldilocks.fairwinds.com/enabled=true --overwrite
done
```

### Verify VPA Resources Created

After enabling a namespace, Goldilocks automatically creates VPA resources:

```bash
kubectl get vpa -n <namespace>
```

Each workload (Deployment, StatefulSet, etc.) should have a corresponding VPA resource.

## Management

### Port Forward to Dashboard

For local access without OAuth2 Proxy:

```bash
just goldilocks::port-forward
```

Access at `http://localhost:8080`

### Uninstall

```bash
just goldilocks::uninstall
```

This removes:

- OAuth2 Proxy
- Helm release
- VPA resources created by Goldilocks
- Namespace

Note: VPA installation itself is not removed. Uninstall separately if needed:

```bash
just vpa::uninstall
```

## Troubleshooting

### Dashboard Shows "No namespaces are labelled"

No namespaces have monitoring enabled. Label at least one namespace:

```bash
just goldilocks::enable-namespace default
```

### No Recommendations Displayed

VPA needs time to collect metrics and generate recommendations:

- Wait 5-10 minutes after enabling a namespace
- Ensure workloads are actively running
- Verify VPA resources exist: `kubectl get vpa -n <namespace>`
- Check VPA recommender logs: `just vpa::logs-recommender`

### VPA Resources Not Created

Verify Goldilocks controller is running:

```bash
kubectl get pods -n goldilocks -l app.kubernetes.io/component=controller
```

Check controller logs:

```bash
just goldilocks::logs-controller
```

Ensure namespace has the correct label:

```bash
kubectl get namespace <namespace> --show-labels
```

### OAuth2 Proxy Authentication Issues

Verify Keycloak client exists:

```bash
just keycloak::list-clients | grep goldilocks
```

Check OAuth2 Proxy logs:

```bash
kubectl logs -n goldilocks -l app=goldilocks-oauth2-proxy
```

### Dashboard Not Accessible

Check IngressRoute:

```bash
kubectl get ingressroute -n goldilocks
```

Verify OAuth2 Proxy is running:

```bash
kubectl get pods -n goldilocks -l app=goldilocks-oauth2-proxy
```

## References

- [Goldilocks Documentation](https://goldilocks.docs.fairwinds.com/)
- [Goldilocks GitHub Repository](https://github.com/FairwindsOps/goldilocks)
- [Fairwinds Goldilocks Helm Chart](https://github.com/FairwindsOps/charts/tree/master/stable/goldilocks)
- [Kubernetes VPA Documentation](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler)
