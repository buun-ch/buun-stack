# Fairwinds Polaris

Fairwinds Polaris is a Kubernetes security audit tool that validates cluster configurations against best practices.

## Features

- Dashboard for visualizing security audit results
- Checks for security, efficiency, and reliability issues
- Customizable security policies
- Support for exemptions
- Real-time cluster scanning

## Prerequisites

- Kubernetes cluster (k3s)
- Helm 3
- kubectl configured

## Installation

Install Fairwinds Polaris with interactive configuration:

```bash
just fairwinds-polaris::install
```

During installation, you will be prompted to:

1. **Enable Ingress?**
   - Yes: Expose via Ingress (requires FQDN)
   - No: Access via port-forward (recommended for development)

2. **Enable OAuth2 Proxy authentication?** (only if Ingress is enabled)
   - Yes: Keycloak SSO authentication
   - No: Public access without authentication

### Access Options

**Ingress (if enabled):**

- Without OAuth2 Proxy: Direct access via `https://fairwinds-polaris.yourdomain.com`
- With OAuth2 Proxy: Keycloak authentication required via `https://fairwinds-polaris.yourdomain.com`

**Port-forward (without Ingress):**

```bash
just fairwinds-polaris::port-forward
# Opens on http://localhost:8080
```

## Usage

### View Audit Results

Port-forward to dashboard:

```bash
just fairwinds-polaris::port-forward
```

Or fetch JSON results:

```bash
just fairwinds-polaris::audit
```

### Upgrade

```bash
just fairwinds-polaris::upgrade
```

### Uninstall

```bash
just fairwinds-polaris::uninstall
```

## Configuration

Configuration is managed through `values.gomplate.yaml`.

### Security Checks

Polaris performs the following security checks:

- **Security**
    - `hostIPCSet`: danger
    - `hostPIDSet`: danger
    - `notReadOnlyRootFilesystem`: warning
    - `privilegeEscalationAllowed`: danger
    - `runAsRootAllowed`: warning
    - `runAsPrivileged`: danger
    - `insecureCapabilities`: warning
    - `dangerousCapabilities`: danger

- **Efficiency**
    - `cpuRequestsMissing`: warning
    - `cpuLimitsMissing`: warning
    - `memoryRequestsMissing`: warning
    - `memoryLimitsMissing`: warning

- **Reliability**
    - `tagNotSpecified`: danger
    - `readinessProbeMissing`: warning
    - `livenessProbeMissing`: warning
    - `deploymentMissingReplicas`: ignore (disabled)

- **Network**
    - `hostNetworkSet`: warning
    - `hostPortSet`: warning
    - `missingNetworkPolicy`: warning

### Exemptions

System components are pre-configured with exemptions:

- kube-system controllers
- Monitoring tools (Prometheus, Grafana)
- Networking components (Flannel, Calico)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FAIRWINDS_POLARIS_NAMESPACE` | `fairwinds-polaris` | Kubernetes namespace |
| `FAIRWINDS_POLARIS_CHART_VERSION` | `5.19.0` | Helm chart version |
| `FAIRWINDS_POLARIS_HOST` | - | FQDN for Ingress (when enabled) |
| `FAIRWINDS_POLARIS_INGRESS_ENABLED` | `false` | Enable Ingress |
| `KEYCLOAK_REALM` | `buunstack` | Keycloak realm |
| `KEYCLOAK_HOST` | - | Keycloak host |

## Understanding Results

Polaris categorizes issues by severity:

- 🔴 **Danger**: Critical security issues
- 🟡 **Warning**: Important but not critical
- 🟢 **Success**: Passed all checks

### Score Calculation

Each check has a severity level that contributes to the overall score:

- Danger: -10 points
- Warning: -1 point
- Success: +1 point

## Best Practices

1. **Regular Scanning**: Run Polaris regularly to catch configuration drift
2. **Address Dangers First**: Focus on danger-level issues before warnings
3. **Review Exemptions**: Periodically review exempted resources
4. **CI/CD Integration**: Consider integrating Polaris into your deployment pipeline

## Troubleshooting

### Dashboard Not Accessible

Check if the service is running:

```bash
kubectl get pods -n polaris
kubectl get svc -n polaris
```

### Port-forward Fails

Ensure the dashboard service is ready:

```bash
kubectl get svc polaris-dashboard -n polaris
```

### Ingress Not Working

Check IngressRoute and OAuth2 Proxy:

```bash
kubectl get ingressroute -n polaris
kubectl get pods -n polaris | grep oauth2-proxy
```

## References

- [Polaris Documentation](https://polaris.docs.fairwinds.com/)
- [GitHub Repository](https://github.com/FairwindsOps/polaris)
- [Helm Chart](https://github.com/FairwindsOps/charts/tree/master/stable/polaris)
