# Container Registry and Image Building

This document explains how to use the local container registry in buun-stack and build/push container images using Docker or Podman.

## Overview

buun-stack includes a local container registry running inside the Kubernetes cluster. By building images on the remote server (where k3s runs) and pushing to `localhost:30500`, images become accessible both from inside and outside the cluster without requiring registry credentials in Kubernetes.

## Local Container Registry

The k3s built-in registry runs inside the cluster and is accessible at:

- **From the remote server**: `localhost:30500` (host network)
- **From within cluster**: `registry.kube-system.svc.cluster.local:5000`

Enable the registry during k3s installation by setting `K3S_ENABLE_REGISTRY=true`.

### Key Benefits

When you build and push images on the remote server using `localhost:30500`:

1. **No registry credentials needed**: Images pushed to `localhost:30500` are automatically available inside the cluster
2. **Unified image reference**: The same tag `localhost:30500/myapp:latest` works both outside and inside the cluster
3. **Fast deployment**: Images are local to the cluster, no external registry pull required

## Building and Pushing Images

### Using Docker

Connect to the remote Docker daemon and build/push images:

```bash
# Set remote Docker host
export DOCKER_HOST=ssh://remote

# Build image (executes on remote server)
docker build -t localhost:30500/myapp:latest .

# Push to local registry (accessible from remote server's localhost:30500)
docker push localhost:30500/myapp:latest

# Deploy to Kubernetes (no imagePullSecrets needed)
kubectl run myapp --image=localhost:30500/myapp:latest
```

**Requirements:**

- Docker daemon running on the remote server
- SSH access with key authentication
- User must be in the `docker` group on the remote server:

  ```bash
  # On remote server
  sudo usermod -aG docker $USER
  # Re-login or restart SSH session for group changes to take effect
  ```

### Using Podman

**Note**: buun-stack uses Cloudflare Tunnel by default. Podman does not support SSH ProxyCommand configurations (GitHub issues [#23831](https://github.com/containers/podman/issues/23831), [#8288](https://github.com/containers/podman/issues/8288)). Therefore, SSH port forwarding is required.

#### Server-side Setup

Enable Podman socket on the remote server:

```bash
# Rootless mode (recommended)
ssh remote
systemctl --user enable --now podman.socket

# Or root mode
ssh remote
sudo systemctl enable --now podman.socket
```

#### Using SSH Port Forwarding (Required for Cloudflare Tunnel)

Since Podman cannot use ProxyCommand, create an SSH tunnel to forward the Podman socket:

```bash
# 1. Create persistent SSH tunnel in background
#    -M: Enable SSH ControlMaster (connection multiplexing)
#    -S: Socket path for controlling the connection
#    -f: Go to background
#    -N: Don't execute remote command
#    -T: Disable pseudo-terminal
mkdir -p ~/.ssh/controlmasters
ssh -fNT -M -S ~/.ssh/controlmasters/remote \
    -L /tmp/podman.sock:/run/user/1000/podman/podman.sock remote

# 2. Set CONTAINER_HOST to use local socket
export CONTAINER_HOST=unix:///tmp/podman.sock

# 3. Build and push (executes on remote server)
podman build -t localhost:30500/myapp:latest .
podman push localhost:30500/myapp:latest

# 4. Deploy to Kubernetes (no imagePullSecrets needed)
kubectl run myapp --image=localhost:30500/myapp:latest
```

**Managing the SSH tunnel:**

```bash
# Check tunnel status
ssh -S ~/.ssh/controlmasters/remote -O check remote

# Close tunnel when done
ssh -S ~/.ssh/controlmasters/remote -O exit remote
```

The `-M` (ControlMaster) option keeps the SSH connection alive in the background, maintaining the tunnel until explicitly closed.

This method works with any SSH configuration including Cloudflare Tunnel ProxyCommand.

## How It Works

When you set `DOCKER_HOST=ssh://remote` or use Podman remote connection:

1. **Build executes remotely**: `docker/podman build` runs on the remote server
2. **Push to localhost:30500**: The registry is accessible from the remote server's host network
3. **Registry stores the image**: Image is stored inside the k3s cluster
4. **Kubernetes can pull**: Pods can reference `localhost:30500/myapp:latest` directly

**Important**: The image is pushed to the **remote server's** `localhost:30500`, which is the k3s registry. This is why the same image reference works both outside and inside the cluster.

## Using Images in Kubernetes

Since images are in the local registry, no `imagePullSecrets` are required:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myapp
spec:
  containers:
  - name: myapp
    image: localhost:30500/myapp:latest
    # No imagePullSecrets needed!
```

Or using kubectl:

```bash
kubectl run myapp --image=localhost:30500/myapp:latest
```

## buun-stack Module Builds

Some buun-stack modules include build recipes that support both Docker and Podman via the `DOCKER_CMD` environment variable:

```bash
# Use Podman for module builds
export DOCKER_CMD=podman
just mlflow::build-and-push-image
```

## Registry Authentication

The default registry configuration requires no authentication. If authentication is configured:

```bash
# Docker
docker login localhost:30500

# Podman
podman login localhost:30500
```

## Troubleshooting

### Verify Remote Connection

```bash
# Docker
docker -H ssh://remote info

# Podman with CONTAINER_HOST
podman --remote info

# Podman with connection
podman --connection remote info
```

### Check Registry Status

```bash
# From remote server
curl http://localhost:30500/v2/_catalog

# From within cluster
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://registry.kube-system.svc.cluster.local:5000/v2/_catalog
```

### Verify Podman Socket

```bash
ssh remote systemctl --user status podman.socket
```
