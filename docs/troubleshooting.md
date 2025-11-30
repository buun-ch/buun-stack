# Troubleshooting

This document provides solutions to common issues encountered when working with buun-stack.

## Table of Contents

- [Longhorn Issues](#longhorn-issues)
- [Vault Issues](#vault-issues)

## Longhorn Issues

### EXT4 Errors on Machine Shutdown

#### Symptom

When shutting down the machine, you see errors like:

```plain
EXT4-fs (sdf): failed to convert unwritten extents to written extents -- potential data loss!  (inode 393220, error -30)
```

Or similar I/O errors in kernel logs:

```plain
blk_update_request: I/O error, dev sdf, sector XXXXX op 0x1:(WRITE) flags 0x0 phys_seg 1 prio class 2
Buffer I/O error on dev dm-X, logical block XXXXX, lost sync page write
```

#### Cause

This occurs when the machine is shut down without properly detaching Longhorn volumes. The standard k3s shutdown procedure (`systemctl stop k3s` or `k3s-killall.sh`) does not gracefully handle Longhorn volume detachment.

When volumes are forcefully detached during shutdown:

- Dirty data may not be flushed to disk
- The filesystem encounters I/O errors trying to complete pending writes
- This can lead to data corruption or loss

Reference: <https://github.com/longhorn/longhorn/issues/7206>

#### Solution

Always use `just k8s::stop` before shutting down the machine:

```bash
# Gracefully stop k3s with proper Longhorn volume detachment
just k8s::stop

# Now you can safely shutdown the machine
sudo shutdown -h now
```

The `just k8s::stop` recipe performs the following steps:

1. **Drains the node** using `kubectl drain` to gracefully evict all pods
2. **Waits for Longhorn volumes** to be fully detached
3. **Stops k3s service** and cleans up container processes
4. **Terminates remaining containerd-shim processes**

#### Expected Warnings During Drain

During the drain process, you may see warnings like:

```plain
error when evicting pods/"instance-manager-..." -n "longhorn" (will retry after 5s): Cannot evict pod as it would violate the pod's disruption budget.
```

This is normal. Longhorn's instance-manager pods are protected by PodDisruptionBudget (PDB). The drain command will retry and eventually evict them with the `--force` option.

You may also see client-side throttling messages:

```plain
"Waited before sending request" delay="1.000769875s" reason="client-side throttling..."
```

This is also normal. The Kubernetes client automatically throttles requests when evicting many pods at once. These warnings do not indicate any problem.

#### Starting the Cluster After Reboot

After rebooting, start the cluster with:

```bash
just k8s::start
```

This will:

1. Start the k3s service
2. Wait for the node to be ready
3. Automatically uncordon the node (which was cordoned during drain)

#### Quick Reference

```bash
# Before shutdown
just k8s::stop
sudo shutdown -h now

# After reboot
just k8s::start
just vault::unseal  # If Vault is installed
```

## Vault Issues

### Vault is Sealed

#### Symptom

When running `just vault::get` or other Vault-related recipes, you encounter this error:

```plain
Error authenticating: Error making API request.

URL: PUT https://vault.example.com/v1/auth/oidc/oidc/auth_url
Code: 503. Errors:

* Vault is sealed
```

#### Cause

Vault automatically seals itself when:

- The Vault pod is restarted
- The node where Vault is running is restarted
- The machine is rebooted
- Vault encounters certain error conditions

When sealed, Vault cannot decrypt its data and all operations are blocked.

#### Solution

Unseal Vault using your unseal key:

**Option 1: Using the Web UI**

1. Navigate to your Vault host (e.g., `https://vault.example.com`)
2. Enter your unseal key in the web interface
3. Click "Unseal"

**Option 2: Using just recipe (Recommended)**

```bash
just vault::unseal
```

This recipe will prompt for the unseal key interactively. You can also set the `VAULT_UNSEAL_KEY` environment variable to avoid entering it repeatedly:

```bash
# Set in .env.local
VAULT_UNSEAL_KEY=your-unseal-key-here

# Or use 1Password reference
VAULT_UNSEAL_KEY=op://vault/unseal/key
```

**Option 3: Using kubectl**

```bash
# Get the unseal key from your secure storage
UNSEAL_KEY="your-unseal-key-here"

# Unseal Vault
kubectl exec -n vault vault-0 -- vault operator unseal "${UNSEAL_KEY}"
```

After unsealing, restart the External Secrets Operator to ensure it reconnects properly:

```bash
kubectl rollout restart -n external-secrets deploy/external-secrets
```

#### Prevention

**Important**: Store your Vault unseal key and root token securely. You will need them whenever Vault is sealed.

Recommended storage locations:

- Password manager (1Password, Bitwarden, etc.)
- Secure note in your organization's secret management system
- Encrypted file on secure storage

**Never commit unseal keys to version control.**

#### Verification

After unsealing, verify Vault is operational:

```bash
# Check Vault status
kubectl exec -n vault vault-0 -- vault status

# Test secret access
just vault::get test/path field
```

## References

- [Vault Documentation](https://developer.hashicorp.com/vault/docs)
