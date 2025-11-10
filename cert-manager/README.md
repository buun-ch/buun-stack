# cert-manager Module

cert-manager is a Kubernetes add-on that automates the management and issuance of TLS certificates from various sources. It provides a common API for certificate issuers and ensures certificates are valid and up to date.

## Features

- **Automatic Certificate Renewal**: Automatically renews certificates before they expire
- **Multiple Issuers**: Supports Let's Encrypt, HashiCorp Vault, Venafi, self-signed, and more
- **Kubernetes Native**: Uses Custom Resource Definitions (CRDs) for certificate management
- **Webhook Integration**: Provides admission webhooks for validating and mutating certificate resources

## Prerequisites

- Kubernetes cluster (installed via `just k8s::install`)
- kubectl configured with cluster admin permissions

## Installation

### Basic Installation

```bash
# Install cert-manager with default settings
just cert-manager::install
```

### Environment Variables

Key environment variables (set via `.env.local` or environment):

```bash
CERT_MANAGER_NAMESPACE=cert-manager       # Namespace for cert-manager
CERT_MANAGER_CHART_VERSION=v1.19.1        # cert-manager Helm chart version
```

## Usage

### Check Status

```bash
# View status of cert-manager components
just cert-manager::status
```

### Create a Self-Signed Issuer

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
    name: selfsigned-issuer
spec:
    selfSigned: {}
```

Apply the resource:

```bash
kubectl apply -f issuer.yaml
```

### Create a Certificate

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
    name: example-cert
    namespace: default
spec:
    secretName: example-cert-tls
    issuerRef:
        name: selfsigned-issuer
        kind: ClusterIssuer
    dnsNames:
        - example.com
        - www.example.com
```

Apply the resource:

```bash
kubectl apply -f certificate.yaml
```

### View Certificates

```bash
# List all certificates
kubectl get certificates -A

# Describe a specific certificate
kubectl describe certificate example-cert -n default
```

## Components

cert-manager installs three main components:

1. **cert-manager**: Main controller managing Certificate resources
2. **cert-manager-webhook**: Admission webhook for validating and mutating cert-manager resources
3. **cert-manager-cainjector**: Injects CA bundles into webhooks and API services

## Used By

cert-manager is required by:
- **KServe**: For webhook TLS certificates

## Upgrade

```bash
# Upgrade cert-manager to a new version
just cert-manager::upgrade
```

## Uninstall

```bash
# Remove cert-manager
just cert-manager::uninstall
```

This will:
- Uninstall cert-manager Helm release
- Delete cert-manager CRDs
- Delete namespace

**Warning**: Uninstalling will remove all Certificate, Issuer, and ClusterIssuer resources.

## Troubleshooting

### Check Controller Logs

```bash
kubectl logs -n cert-manager -l app=cert-manager
```

### Check Webhook Logs

```bash
kubectl logs -n cert-manager -l app=webhook
```

### Verify CRDs

```bash
kubectl get crd | grep cert-manager.io
```

### Check Certificate Status

```bash
kubectl get certificate -A
kubectl describe certificate <name> -n <namespace>
```

Common issues:
- **Certificate not ready**: Check issuer configuration and logs
- **Webhook errors**: Ensure cert-manager webhook is running and healthy
- **DNS validation failures**: For ACME issuers, ensure DNS records are correct

## References

- [cert-manager Documentation](https://cert-manager.io/docs/)
- [cert-manager GitHub](https://github.com/cert-manager/cert-manager)
- [Helm Chart Configuration](https://artifacthub.io/packages/helm/cert-manager/cert-manager)
- [Supported Issuers](https://cert-manager.io/docs/configuration/)
