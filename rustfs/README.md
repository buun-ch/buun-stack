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
> backend) until RustFS is stable.

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

# Public access (bucket policy via mc anonymous)
just rustfs::set-public-download my-bucket/public
just rustfs::show-public-access my-bucket
just rustfs::remove-public-access my-bucket/public

# Backup / restore (mc mirror)
just rustfs::backup
just rustfs::restore
```

## MinIO Client (mc) Setup

RustFS is S3-compatible, so the MinIO Client (`mc`) works for standard S3
operations (bucket policies included). Only the MinIO-specific `mc admin ...`
commands are unsupported — see [Notes](#notes).

### Install mc

```bash
# macOS
brew install minio-mc

# Linux
curl https://dl.min.io/client/mc/release/linux-amd64/mc --create-dirs -o $HOME/bin/mc
chmod +x $HOME/bin/mc
```

### Configure mc Alias

#### For Regular Users (Recommended)

Do not use the root credentials for day-to-day work. Create a dedicated access
key through the RustFS Web Console instead:

1. **Login to RustFS Console**: Navigate to `https://your-rustfs-console-host/`
2. **Authenticate with Key login**: use `rustfsadmin` and the output of
   `just rustfs::root-secret-key` (see [Web Console login](#web-console-login))
3. **Create Access Key**:
   - Go to **Access Keys** and click **Create access key**
   - Copy the **Access Key** and **Secret Key** (shown only once!)
   - Optionally restrict the key to specific buckets
   - Save these credentials securely

4. **Configure mc alias**:

```bash
mc alias set myrustfs https://your-rustfs-host <ACCESS_KEY> <SECRET_KEY>
```

`your-rustfs-host` is the `RUSTFS_HOST` value in `.env.local` (the S3 API
endpoint, not the Console host).

**Note**: Access Keys created via the Console are not stored anywhere by the
system. Save them immediately when created.

#### Root Credentials (Admin Only)

The Just recipes in this module (`create-bucket`, `set-public-download`, ...)
use the root credentials internally over a port-forward. If you need the same
for a one-off admin task:

```bash
# Terminal 1
kubectl -n rustfs port-forward svc/rustfs 19100:9000

# Terminal 2
mc alias set rustfs-admin http://localhost:19100 \
    "$(just rustfs::root-access-key)" \
    "$(just rustfs::root-secret-key)"
```

Remove the alias when done (`mc alias remove rustfs-admin`).

### Common mc Commands

```bash
# List buckets
mc ls myrustfs

# Create bucket
mc mb myrustfs/mybucket

# Upload file
mc cp myfile.txt myrustfs/mybucket/

# Download file
mc cp myrustfs/mybucket/myfile.txt ./

# Remove file
mc rm myrustfs/mybucket/myfile.txt

# List files in bucket
mc ls myrustfs/mybucket

# Copy directory recursively
mc cp --recursive mydir/ myrustfs/mybucket/mydir/

# Mirror local directory to bucket
mc mirror localdir/ myrustfs/mybucket/
```

## Public Access

RustFS supports S3 bucket policies, so anonymous (public) read access can be
granted to a bucket or a prefix for serving static content such as thumbnails
or images.

### Set Public Download Access

Enable public read access for a bucket or prefix:

```bash
# Set public access for entire bucket
just rustfs::set-public-download mybucket

# Set public access for specific prefix only
just rustfs::set-public-download mybucket/public
```

After setting public access, objects can be fetched without authentication
through the S3 API Ingress:

```text
https://your-rustfs-host/mybucket/public/image.png
```

No Ingress change is required — the S3 API is already exposed at the root path
of `RUSTFS_HOST`.

### Check Public Access Status

View current anonymous access policy:

```bash
just rustfs::show-public-access mybucket
```

Possible values:

- `none`: No anonymous access (default)
- `download`: Public read access
- `upload`: Public write access
- `public`: Public read and write access
- `custom`: Custom policy applied

### Remove Public Access

Revoke anonymous access:

```bash
just rustfs::remove-public-access mybucket/public
```

### Using mc Commands

The recipes above run `mc anonymous` against a port-forward. With an alias
configured as in [MinIO Client (mc) Setup](#minio-client-mc-setup) you can also
run it directly:

```bash
# Set public download (read-only)
mc anonymous set download myrustfs/mybucket/public

# Set public upload (write-only)
mc anonymous set upload myrustfs/mybucket/uploads

# Set full public access (read and write)
mc anonymous set public myrustfs/mybucket

# Remove public access
mc anonymous set none myrustfs/mybucket

# Check current policy
mc anonymous get myrustfs/mybucket

# Show the effective policy as JSON
mc anonymous get-json myrustfs/mybucket

# Apply a custom bucket policy (e.g. s3:GetObject only, no listing)
mc anonymous set-json policy.json myrustfs/mybucket
```

### Presigned URLs (Temporary Access)

For temporary access to private objects, use presigned URLs instead of making
the bucket public:

```bash
# Generate a download URL valid for 7 days
mc share download myrustfs/mybucket/private-file.pdf --expire=168h

# Generate an upload URL valid for 1 hour
mc share upload myrustfs/mybucket/uploads/ --expire=1h
```

> **Note**: Anonymous access policies are per-bucket settings stored in RustFS
> and are **not** included in `just rustfs::backup`. Re-apply them with
> `just rustfs::set-public-download` after a `just rustfs::restore` on a rebuilt
> cluster.

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
