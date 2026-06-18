# NFS Subdir External Provisioner

Dynamic provisioner that carves PVCs out of an existing NFS export. Provides
RWX (`ReadWriteMany`) volumes for workloads that need shared file access.

This is an **optional** module. Install only when you need NFS-backed PVCs.
For single-node RWO workloads, `local-path` (k3s default) is sufficient.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Installation](#installation)
- [Usage](#usage)
- [Uninstallation](#uninstallation)
- [References](#references)

## Prerequisites

- An NFS server reachable from all Kubernetes nodes
    - The export must permit read/write from the node IPs
    - The mount path should be empty or pre-organized for subdirectory creation
- `nfs-common` (Linux) / NFS client utilities installed on every node
    - Arch Linux: `pacman -S nfs-utils`
    - Debian/Ubuntu: `apt install nfs-common`
    - Red Hat family: `dnf install nfs-utils`

## Configuration

Set the following in `.env.local` (or via `just env::set`):

| Variable                 | Required | Default            | Description                                                                |
| ------------------------ | -------- | ------------------ | -------------------------------------------------------------------------- |
| `NFS_SERVER`             | yes      | —                  | NFS server IP or hostname                                                  |
| `NFS_PATH`               | yes      | —                  | Export path on the NFS server (e.g. `/export/k8s`)                         |
| `NFS_NAMESPACE`          | no       | `nfs-provisioner`  | Namespace for the provisioner                                              |
| `NFS_CHART_VERSION`      | no       | `4.0.18`           | Helm chart version                                                         |
| `NFS_STORAGE_CLASS_NAME` | no       | `nfs`              | StorageClass name created by the chart                                     |
| `NFS_RECLAIM_POLICY`     | no       | `Delete`           | `Delete` or `Retain`                                                       |
| `NFS_ARCHIVE_ON_DELETE`  | no       | `true`             | When `true`, deleted PVC dirs are renamed `archived-*` instead of removed  |
| `NFS_MOUNT_OPTIONS`      | no       | —                  | Comma-separated mount options (e.g. `nfsvers=4.1,hard`)                    |

If `NFS_SERVER` / `NFS_PATH` are unset, `just install` prompts interactively.

## Installation

```bash
just nfs-subdir-external-provisioner::install
```

This will:

1. Add the Helm repository
2. Create the namespace with `pod-security.kubernetes.io/enforce=baseline`
3. Render `values.yaml` from `values.gomplate.yaml`
4. Install the Helm chart
5. Create a StorageClass named `${NFS_STORAGE_CLASS_NAME}`

### Verify

```bash
just nfs-subdir-external-provisioner::test
```

Creates a 1Mi RWX PVC against the new StorageClass, waits for it to bind,
then deletes it.

## Usage

### Request an RWX volume

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
    name: shared-data
spec:
    accessModes: [ReadWriteMany]
    storageClassName: nfs
    resources:
        requests:
            storage: 10Gi
```

The provisioner creates a subdirectory on the NFS export named
`${namespace}-${pvc-name}-${pv-name}` and binds it to the PV.

### Pod Security Standards

The provisioner image runs as root and writes to the NFS export with the
ownership the server expects, so the namespace is labeled `baseline` rather
than `restricted`. If your NFS server is configured for non-root access
(e.g. `all_squash` with `anonuid`/`anongid`), you can attempt `restricted`
by editing `values.gomplate.yaml` to set `podSecurityContext` and
`securityContext` and re-running `install`.

## Uninstallation

```bash
just nfs-subdir-external-provisioner::uninstall
```

PVs and the underlying NFS data are **not** removed automatically:

- PVs with `reclaimPolicy: Retain` stay until you delete them manually
- With `archiveOnDelete: true`, deleted PVCs leave `archived-*` directories
  on the NFS export — clean those up on the NFS server if no longer needed

## References

- [Chart](https://github.com/kubernetes-sigs/nfs-subdir-external-provisioner/tree/master/charts/nfs-subdir-external-provisioner)
- [Provisioner](https://github.com/kubernetes-sigs/nfs-subdir-external-provisioner)
