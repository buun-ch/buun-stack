# NVIDIA Device Plugin for Kubernetes

Enables GPU support in Kubernetes clusters by exposing NVIDIA GPUs as schedulable resources.

## Overview

This module deploys the NVIDIA device plugin using the official Helm chart with:

- **NVIDIA Device Plugin** - Exposes GPUs as `nvidia.com/gpu` resources
- **Node Feature Discovery (NFD)** - Automatically detects GPU hardware on nodes
- **GPU Feature Discovery (GFD)** - Discovers and labels GPU capabilities
- **k3s Integration** - Automatic nvidia runtime detection for k3s clusters

## Prerequisites

### Host System Requirements

The following components must be installed on each GPU node **before** deploying the device plugin:

#### 1. NVIDIA GPU Driver

Install the appropriate NVIDIA GPU driver for your system.

**Arch Linux:**

```bash
# Install NVIDIA driver
sudo pacman -S nvidia nvidia-utils
```

**Ubuntu/Debian:**

```bash
# Install NVIDIA driver
sudo apt-get update
sudo apt-get install -y nvidia-driver-<version>
```

Verify driver installation:

```bash
nvidia-smi
```

#### 2. NVIDIA Container Toolkit

The NVIDIA Container Toolkit allows containers to access GPU devices.

**Arch Linux:**

```bash
# Install NVIDIA Container Toolkit
sudo pacman -S nvidia-container-toolkit

# Configure containerd runtime
sudo nvidia-ctk runtime configure --runtime=containerd

# Restart containerd
sudo systemctl restart containerd
```

**Ubuntu/Debian:**

```bash
# Add NVIDIA repository
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install NVIDIA Container Toolkit
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Configure containerd runtime
sudo nvidia-ctk runtime configure --runtime=containerd

# Restart containerd
sudo systemctl restart containerd
```

#### 3. k3s Runtime Configuration

**Important**: k3s automatically detects the nvidia runtime if NVIDIA Container Toolkit is installed. **No manual configuration is required**.

After installing NVIDIA Container Toolkit and restarting k3s, verify automatic detection:

```bash
# Restart k3s to detect nvidia runtime
sudo systemctl restart k3s

# Verify nvidia runtime is detected
sudo grep nvidia /var/lib/rancher/k3s/agent/etc/containerd/config.toml
```

Expected output:

```toml
[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.'nvidia']
[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.'nvidia'.options]
  BinaryName = "/usr/bin/nvidia-container-runtime"
[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.'nvidia-cdi']
[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.'nvidia-cdi'.options]
  BinaryName = "/usr/bin/nvidia-container-runtime.cdi"
```

**Note**: Do **NOT** create `/var/lib/rancher/k3s/agent/etc/containerd/config.toml.tmpl` manually, as this can break k3s networking. k3s handles runtime detection automatically.

## Installation

### Deploy NVIDIA Device Plugin

```bash
just nvidia-device-plugin::install
```

This installs:

- NVIDIA Device Plugin DaemonSet
- Node Feature Discovery (NFD) for GPU hardware detection
- GPU Feature Discovery (GFD) for GPU capability labeling

### Verify Installation

```bash
just nvidia-device-plugin::verify
```

Expected output:

```plain
=== GPU Resources per Node ===
node1: 1 GPUs

=== Device Plugin Pods ===
NAME                                               READY   STATUS    RESTARTS   AGE
nvidia-device-plugin-xxxxx                         1/1     Running   0          1m
nvidia-device-plugin-gpu-feature-discovery-xxxxx   1/1     Running   0          1m
```

### Test GPU Access

```bash
just nvidia-device-plugin::test
```

This creates a test pod that runs `nvidia-smi` and displays GPU information.

Expected output:

```plain
=== GPU Test Output ===
+-----------------------------------------------------------------------------------------+
| NVIDIA-SMI 580.105.08             Driver Version: 580.105.08     CUDA Version: 13.0     |
+-----------------------------------------+------------------------+----------------------+
| GPU  Name                 Persistence-M | Bus-Id          Disp.A | Volatile Uncorr. ECC |
...
```

## Configuration

Environment variables (set in `.env.local` or override):

```bash
NVIDIA_DEVICE_PLUGIN_NAMESPACE=nvidia-device-plugin  # Kubernetes namespace
NVIDIA_DEVICE_PLUGIN_VERSION=0.18.0                  # Helm chart version
```

## Usage

### Using GPUs in Pods

To use GPUs in your pods, specify two things:

1. **runtimeClassName**: `nvidia` - Uses NVIDIA Container Runtime
2. **resources.limits**: `nvidia.com/gpu: 1` - Requests GPU allocation

Example pod configuration:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: gpu-pod
spec:
  runtimeClassName: nvidia
  containers:
  - name: cuda-container
    image: nvcr.io/nvidia/cuda:12.2.0-base-ubuntu22.04
    command: ["nvidia-smi"]
    resources:
      limits:
        nvidia.com/gpu: 1
```

### Using GPUs in JupyterHub

Configure JupyterHub to allow GPU access for notebook servers:

```yaml
# jupyterhub values.yaml
singleuser:
  runtimeClassName: nvidia
  extraResource:
    limits:
      nvidia.com/gpu: "1"
```

After deploying JupyterHub with this configuration, users can access GPUs in their notebooks:

```python
import torch

# Check GPU availability
print(torch.cuda.is_available())  # True
print(torch.cuda.device_count())   # 1
print(torch.cuda.get_device_name(0))  # NVIDIA GeForce RTX 4070 Ti
```

### Multiple GPUs

To request multiple GPUs:

```yaml
resources:
  limits:
    nvidia.com/gpu: 2
```

### GPU Sharing (Time-Slicing)

The device plugin supports GPU time-slicing for sharing GPUs across multiple pods. See the [official documentation](https://github.com/NVIDIA/k8s-device-plugin#shared-access-to-gpus-with-cuda-time-slicing) for configuration details.

## Architecture

```plain
GPU Node (Arch Linux)
  ├─ NVIDIA Driver (nvidia, nvidia-utils)
  ├─ NVIDIA Container Toolkit (nvidia-container-runtime)
  └─ k3s with containerd
      ├─ Auto-detected nvidia runtime
      └─ NVIDIA Device Plugin (DaemonSet)
          ├─ Discovers GPUs on node
          ├─ Exposes nvidia.com/gpu resource
          └─ Manages GPU allocation to pods
              ↓
          User Pods (with runtimeClassName: nvidia)
              ├─ GPU device access (/dev/nvidia*)
              ├─ CUDA libraries mounted
              └─ nvidia-smi available
```

**Key Components**:

- **NVIDIA Driver**: Kernel module for GPU hardware access
- **NVIDIA Container Toolkit**: Container runtime hooks for GPU access
- **k3s containerd**: Automatically detects nvidia runtime
- **Device Plugin**: Kubernetes plugin that advertises GPU resources
- **NFD**: Detects GPU hardware and labels nodes
- **GFD**: Discovers GPU capabilities and features

## Management

### Check GPU Resources

```bash
# View GPU resources per node
just nvidia-device-plugin::gpu-info
```

### Upgrade Device Plugin

```bash
# Update to latest version
just nvidia-device-plugin::install
```

### Uninstall

```bash
just nvidia-device-plugin::uninstall
```

This removes:

- NVIDIA Device Plugin DaemonSet
- Node Feature Discovery components
- GPU Feature Discovery components
- Helm release and namespace

**Note**: Host-level components (NVIDIA driver, Container Toolkit) are NOT removed and must be uninstalled manually if needed.

## Troubleshooting

### Check Device Plugin Pods

```bash
kubectl get pods -n nvidia-device-plugin
```

Expected pods:

- `nvidia-device-plugin-*` - Device plugin daemon (one per GPU node)
- `nvidia-device-plugin-gpu-feature-discovery-*` - GPU feature discovery (one per GPU node)
- `nvidia-device-plugin-node-feature-discovery-master-*` - NFD master
- `nvidia-device-plugin-node-feature-discovery-gc-*` - NFD garbage collector

### GPU Not Detected

**Symptom**: `just nvidia-device-plugin::verify` shows `0 GPUs`

**Possible Causes**:

1. **NVIDIA driver not installed**

   ```bash
   # Check if driver is loaded
   nvidia-smi
   ```

   If this fails, install NVIDIA driver on the host.

2. **NVIDIA Container Toolkit not installed**

   ```bash
   # Check if nvidia-container-runtime exists
   which nvidia-container-runtime
   ```

   If not found, install NVIDIA Container Toolkit.

3. **k3s did not detect nvidia runtime**

   ```bash
   # Check containerd config
   sudo grep nvidia /var/lib/rancher/k3s/agent/etc/containerd/config.toml
   ```

   If empty, restart k3s:

   ```bash
   sudo systemctl restart k3s
   ```

### Device Plugin Pod CrashLoopBackOff

**Symptom**: Device plugin pod shows `CrashLoopBackOff` status

**Check logs**:

```bash
kubectl logs -n nvidia-device-plugin <pod-name>
```

**Common errors**:

1. **"invalid device discovery strategy"**

   - Cause: NVIDIA Container Toolkit not configured properly
   - Solution: Run `sudo nvidia-ctk runtime configure --runtime=containerd` and restart containerd

2. **"failed to create containerd task"**

   - Cause: containerd cannot find nvidia runtime
   - Solution: Verify `/usr/bin/nvidia-container-runtime` exists and restart k3s

### Pod Cannot Access GPU

**Symptom**: Pod starts but `nvidia-smi` fails with "executable file not found"

**Cause**: Pod does not have `runtimeClassName: nvidia` specified

**Solution**: Add `runtimeClassName: nvidia` to pod spec:

```yaml
spec:
  runtimeClassName: nvidia  # Required!
  containers:
  - name: gpu-container
    resources:
      limits:
        nvidia.com/gpu: 1
```

### k3s Node NotReady After Configuration

**Symptom**: Node shows `NotReady` status with "cni plugin not initialized" error

**Cause**: Invalid `/var/lib/rancher/k3s/agent/etc/containerd/config.toml.tmpl` file

**Solution**: Remove the file and restart k3s:

```bash
sudo rm /var/lib/rancher/k3s/agent/etc/containerd/config.toml.tmpl
sudo systemctl restart k3s
```

k3s will automatically detect nvidia runtime without manual configuration.

### Check NVIDIA Runtime in Pods

```bash
# Run a test pod to verify GPU access
kubectl apply -f nvidia-device-plugin/gpu-test-pod.yaml

# Check logs
kubectl logs gpu-test

# Clean up
kubectl delete pod gpu-test
```

## Configuration Files

Key configuration files:

- `values.yaml` - Helm chart values with NFD and GFD enabled
- `gpu-test-pod.yaml` - Test pod for verifying GPU access
- `justfile` - Task recipes for installation and management

## Security Considerations

- **Privileged Access**: Device plugin pods run with privileged access to manage GPU devices
- **Host Path Mounts**: Pods mount `/dev` and other host paths for GPU access
- **Runtime Security**: NVIDIA runtime is isolated from default runc runtime
- **Resource Limits**: GPUs are allocated exclusively to pods (no overcommit by default)
- **Driver Compatibility**: Ensure NVIDIA driver version is compatible with CUDA version in containers

## References

- [NVIDIA Device Plugin GitHub](https://github.com/NVIDIA/k8s-device-plugin)
- [NVIDIA Container Toolkit Documentation](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
- [k3s Advanced Configuration](https://docs.k3s.io/advanced)
- [Kubernetes Device Plugins](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/device-plugins/)
- [Node Feature Discovery](https://github.com/kubernetes-sigs/node-feature-discovery)
