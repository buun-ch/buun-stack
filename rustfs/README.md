# RustFS

S3-compatible object storage written in Rust, deployed as an **evaluation**
alternative to MinIO:

- **RustFS**: Apache-2.0, S3-compatible object storage server
- **Standalone mode**: single pod with one data PVC (`local-path`, RWO)
- **Root-credentials auth**: access key / secret key (no OIDC in this setup)
- **Web Console**: built-in browser UI for object/bucket management

> **Status: beta.** RustFS has not reached 1.0.0 GA yet (the maintainers target
> ~2026-07). This module exists to evaluate RustFS alongside MinIO; it is **not**
> recommended for production-critical workloads (e.g. the Lakekeeper/Iceberg
> backend) until RustFS is stable. See [PLAN-storage.md](../PLAN-storage.md).

## Prerequisites

- Kubernetes cluster (k3s)
- A working StorageClass on the cluster (`local-path` by default)
- External Secrets Operator (optional, for Vault integration)
- Vault (optional, for credential storage)

## Installation

```bash
just rustfs::install
```

You will be prompted for:

- **RustFS host (FQDN)**: e.g., `rustfs.example.com` (S3 API endpoint)
- **RustFS Console host (FQDN)**: e.g., `rustfs-console.example.com` (Web UI)

### What Gets Installed

- RustFS server in standalone mode (`deploymentType: deployment`, 1 replica)
- Root credentials in a Kubernetes Secret (and optionally Vault via ESO)
- Ingress for both the S3 API and the Console endpoints
- A persistent volume for data storage

The stack uses the community
[CloudPirates RustFS Helm Chart](https://artifacthub.io/packages/helm/cloudpirates-rustfs/rustfs)
(`oci://registry-1.docker.io/cloudpirates/rustfs`), which wraps the upstream
[RustFS](https://github.com/rustfs/rustfs) server image.

## Container Images

| Image  | Repository      | Default tag      |
|--------|-----------------|------------------|
| Server | `rustfs/rustfs` | `1.0.0-beta.8`   |

Pin a different tag with environment variables in `.env.local`:

```bash
RUSTFS_IMAGE_TAG       # default: 1.0.0-beta.8
RUSTFS_CHART_VERSION   # default: 0.9.1
RUSTFS_STORAGE_SIZE    # default: 50Gi
```

## Authentication

This module deploys RustFS with **root access-key / secret-key** auth only.
Applications connect with static S3 credentials (the standard usage pattern).

RustFS itself supports OIDC/STS (`AssumeRoleWithWebIdentity`, mapping JWT claims
to policy names), but the Helm chart does not expose it. OIDC is only needed for:

- Human SSO login to the **Web Console** via Keycloak, or
- Keyless app auth where a service exchanges an OIDC JWT for temporary credentials.

If those are needed later, inject the RustFS OIDC settings through
`config.extraEnvVars` in `rustfs-values.gomplate.yaml` and create a Keycloak
client (mirroring the `minio` module).

### Web Console login

Use **Key login** (not STS login):

- Access Key: `rustfsadmin`
- Secret Key: output of `just rustfs::root-secret-key`

STS login requires OIDC, which is not configured in this setup.

## Pod Security Standards

The `rustfs` namespace uses **restricted** Pod Security Standard enforcement.

```bash
pod-security.kubernetes.io/enforce=restricted
```

The chart renders `podSecurityContext` / `containerSecurityContext` verbatim, so
`seccompProfile: RuntimeDefault` is added in the values to satisfy restricted
enforcement. The chart's optional `setup` CLI pod runs with an empty
securityContext and would violate restricted — this module therefore does **not**
use the chart `setup` feature; buckets are created via the recipes below instead.

## Common Operations

```bash
# Credentials
just rustfs::root-access-key
just rustfs::root-secret-key

# Buckets (S3 API via a local mc against a port-forward)
just rustfs::create-bucket my-bucket
just rustfs::list-buckets

# Backup / restore (mc mirror)
just rustfs::backup
just rustfs::restore
```

## Notes

- **`mc` works for standard S3 operations** (mb / ls / cp / mirror / rm), which is
  what the recipes above use. **`mc admin ...` does NOT work** — those are
  MinIO-specific admin APIs; manage users/policies via the Web Console instead.
- **TLS / `config.tlsPath`**: the backend runs plain HTTP and TLS is terminated at
  the traefik ingress, so `config.tlsPath` is set to `""`. RustFS (>= beta.8)
  fatally exits at startup if `RUSTFS_TLS_PATH` is non-empty but no server
  certificates are present (`TLS ... but no server certificates were found`), so do
  not point it at an (empty) directory.
- First-boot logs show benign warnings while RustFS formats the empty data volume
  (`unformatted disk`, `config not found, start to init`, `/logs` permission →
  stdout fallback). These are expected and not errors.

## Uninstall

```bash
just rustfs::uninstall
```
