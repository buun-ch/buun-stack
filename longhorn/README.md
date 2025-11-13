# Longhorn

Longhorn is a lightweight, reliable, and powerful distributed block storage system for Kubernetes.

## Table of Contents

- [Installation](#installation)
- [Resource Configuration](#resource-configuration)
- [OAuth2-Proxy Integration](#oauth2-proxy-integration)
- [References](#references)

## Installation

### Prerequisites

- Kubernetes cluster with sufficient resources
- Storage class support
- Open-iSCSI installed on nodes

### Install Longhorn

```bash
just longhorn::install
```

This command will:

1. Add Longhorn Helm repository
2. Install Longhorn via Helm with custom values
3. Configure storage class with single replica
4. Apply resource limits to all Longhorn components (via `patch-resources` recipe)

### Verify Installation

```bash
# Check Longhorn pods
kubectl get pods -n longhorn

# Check storage class
kubectl get storageclass
```

## Resource Configuration

### Why We Use Kubernetes Patch Instead of Helm Values

Longhorn Helm chart **does not support** configuring resource requests/limits for most components through `values.yaml`.

**Known Issues:**

- The `resources: {}` field exists in `values.yaml` but is **not used** in chart templates
- GitHub Issue: [#1502 - Add resource requests/limits to default deployment/controller rollouts](https://github.com/longhorn/longhorn/issues/1502)
- Related Issues:
    - [#3186 - Resources limits in chart values.yaml not work](https://github.com/longhorn/longhorn/issues/3186)
    - [Discussion #4446 - Resources section in helm chart values file isn't used?](https://github.com/longhorn/longhorn/discussions/4446)
    - [Discussion #8282 - How to adjust longhorn ui and other components minimum cpu and memory request with helm](https://github.com/longhorn/longhorn/discussions/8282)

**Pull Request Status:**

- PR [#10187 - Allow setting requests and limits for LonghornUI, LonghornDriver and LonghornManager](https://github.com/longhorn/longhorn/pull/10187) was opened in January 2025 but **closed without merging** in April 2025.

### Our Approach: Post-Install Patching

Since Helm values don't work, we apply resource configurations **after installation** using `kubectl patch`:

```bash
just longhorn::patch-resources
```

This recipe is automatically called by `just longhorn::install`.

### Resource Values

All resource values are based on **Goldilocks/VPA recommendations** and rounded to clean values following [resource management best practices](../docs/resource-management.md).

The `patch-resources` recipe configures resources for the following components:

- **CSI Components** (csi-attacher, csi-provisioner, csi-resizer, csi-snapshotter): Guaranteed QoS for stable CSI operations
- **Engine Image DaemonSet** (engine-image-ei-*): Guaranteed QoS
- **CSI Plugin DaemonSet** (longhorn-csi-plugin): 3 containers, Guaranteed QoS for critical CSI plugin
- **Driver Deployer** (longhorn-driver-deployer): Guaranteed QoS
- **Longhorn Manager DaemonSet** (longhorn-manager): Core component with Burstable QoS to allow CPU bursts during intensive storage operations. Includes 2 containers: main manager and pre-pull-share-manager-image
- **Longhorn UI** (longhorn-ui): Guaranteed QoS

For specific resource values, refer to the `patch-resources` recipe in [longhorn/justfile](justfile).

### Manual Resource Updates

If you need to update resource configurations:

1. **Edit the justfile:**

   ```bash
   vim longhorn/justfile
   # Modify the patch-resources recipe
   ```

2. **Apply changes:**

   ```bash
   just longhorn::patch-resources
   ```

3. **Verify:**

   ```bash
   kubectl get deployment <name> -n longhorn -o jsonpath='{.spec.template.spec.containers[0].resources}' | jq
   ```

### Future: When Helm Support is Added

If Longhorn adds Helm values support in future versions:

1. Move resource configurations from `patch-resources` recipe to `longhorn-values.yaml`
2. Remove or deprecate the `patch-resources` recipe
3. Update this documentation

Monitor these GitHub issues for updates:

- [#1502](https://github.com/longhorn/longhorn/issues/1502)
- [Discussion #8282](https://github.com/longhorn/longhorn/discussions/8282)

## OAuth2-Proxy Integration

Longhorn UI can be protected with OAuth2-Proxy for Keycloak authentication.

### Setup OAuth2-Proxy

```bash
just longhorn::oauth2-proxy-install
```

This will:

1. Prompt for Longhorn hostname (FQDN)
2. Create Keycloak client
3. Deploy OAuth2-Proxy with IngressRoute
4. Apply resource limits to OAuth2-Proxy based on VPA recommendations

**Resource Configuration:**

OAuth2-Proxy resources are configured in the gomplate template ([oauth2-proxy/oauth2-proxy-deployment.gomplate.yaml](../oauth2-proxy/oauth2-proxy-deployment.gomplate.yaml)) with Guaranteed QoS based on Goldilocks/VPA recommendations.

### Access Longhorn UI

After setup, access the Longhorn UI at:

```text
https://<LONGHORN_HOST>
```

You'll be redirected to Keycloak for authentication.

### Remove OAuth2-Proxy

```bash
just longhorn::oauth2-proxy-uninstall
```

## References

- [Longhorn Documentation](https://longhorn.io/docs/)
- [Longhorn GitHub Repository](https://github.com/longhorn/longhorn)
- [Longhorn Helm Chart](https://github.com/longhorn/charts)
- [Resource Management Best Practices](../docs/resource-management.md)
- [GitHub Issue #1502 - Resource requests/limits support](https://github.com/longhorn/longhorn/issues/1502)
