# vLLM

High-throughput LLM serving engine with production-ready features:

- **High Performance**: PagedAttention for efficient memory management and high throughput
- **OpenAI-Compatible API**: Drop-in replacement for OpenAI API endpoints
- **Multi-Model Support**: Deploy multiple models with automatic load balancing
- **GPU Optimization**: Optimized for NVIDIA GPUs with tensor parallelism support
- **Distributed Inference**: Scale across multiple GPUs and replicas

## Prerequisites

NVIDIA Device Plugin is required for GPU support:

```bash
just nvidia-device-plugin::install
```

See [nvidia-device-plugin/README.md](../nvidia-device-plugin/README.md) for host system requirements.

## Configuration Overview

vLLM uses a configuration file (`models.yaml`) to define which models to deploy. Each model runs as a separate Deployment with its own GPU allocation. The router automatically load balances requests across all models.

## Installation

### Step 1: Create Model Configuration

Copy the example configuration and customize:

```bash
cp vllm/models.example.yaml vllm/models.yaml
```

Edit `vllm/models.yaml` to configure your models:

```yaml
# Llama 3.2 3B (requires HuggingFace token)
- name: llama3
  modelURL: meta-llama/Llama-3.2-3B-Instruct
  replicaCount: 1
  requestCPU: 6
  requestMemory: 16Gi
  requestGPU: 1
  pvcStorage: 50Gi

# Qwen 2.5 7B (no token required)
- name: qwen
  modelURL: Qwen/Qwen2.5-7B-Instruct
  replicaCount: 1
  requestCPU: 8
  requestMemory: 32Gi
  requestGPU: 1
  pvcStorage: 50Gi
```

### Step 2: Set HuggingFace Token (for gated models)

For gated models (Gemma, Llama, Mistral), store your HuggingFace token in Vault:

```bash
just vllm::set-hf-token
```

The token is stored in Vault and synced to Kubernetes via External Secrets Operator.

**Note**: Before using gated models, you must accept the model's license on HuggingFace:

- Gemma 3: https://huggingface.co/google/gemma-3-4b-it
- Llama 3: https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct

### Step 3: Install vLLM

```bash
just vllm::install
```

You will be prompted for:

- **API Key**: Optional API key for securing the vLLM endpoint

## Model Management

### List Configured Models

```bash
just vllm::list-models
```

### Add a Model Interactively

```bash
just vllm::add-model
```

This guides you through:

1. Model name (API identifier)
2. HuggingFace model URL
3. Resource allocation (GPUs, memory, storage)

### Remove a Model

```bash
just vllm::remove-model
```

### Apply Changes

After modifying `models.yaml`:

```bash
just vllm::upgrade
```

## Model Configuration Reference

Each model entry in `models.yaml` supports:

| Field           | Required | Default | Description                            |
| --------------- | -------- | ------- | -------------------------------------- |
| `name`          | Yes      | -       | Model identifier used in API requests  |
| `modelURL`      | Yes      | -       | HuggingFace model identifier           |
| `replicaCount`  | No       | `1`     | Number of replicas for this model      |
| `requestCPU`    | No       | `6`     | CPU cores per replica                  |
| `requestMemory` | No       | `16Gi`  | Memory per replica                     |
| `requestGPU`    | No       | `1`     | GPUs per replica                       |
| `limitMemory`   | No       | -       | Memory limit per replica               |
| `pvcStorage`    | No       | `50Gi`  | Storage for model cache                |
| `vllmConfig`    | No       | -       | vLLM engine options (see below)        |

### vllmConfig Options

```yaml
vllmConfig:
  maxModelLen: 8192           # Maximum context length
  dtype: bfloat16             # Data type (auto, bfloat16, float16)
  tensorParallelSize: 2       # GPUs for tensor parallelism
  gpuMemoryUtilization: 0.95  # GPU memory fraction (0.0-1.0)
```

## Environment Variables

| Variable                    | Default            | Description                         |
| --------------------------- | ------------------ | ----------------------------------- |
| `VLLM_NAMESPACE`            | `vllm`             | Kubernetes namespace                |
| `VLLM_CHART_VERSION`        | `0.1.8`            | Helm chart version                  |
| `VLLM_HELM_TIMEOUT`         | `30m`              | Helm install/upgrade timeout        |
| `VLLM_MODEL_IMAGE`          | `vllm/vllm-openai` | Container image repository          |
| `VLLM_MODEL_TAG`            | `latest`           | Container image tag                 |
| `VLLM_STORAGE_CLASS`        | ``                 | Storage class (empty for default)   |
| `VLLM_HF_TOKEN`             | (prompt)           | HuggingFace token for gated models  |
| `VLLM_API_KEY`              | (prompt)           | API key for securing vLLM endpoint  |
| `VLLM_ROUTER_ENABLED`       | `true`             | Enable load balancing router        |
| `VLLM_ROUTER_REPLICAS`      | `1`                | Number of router replicas           |
| `VLLM_ROUTER_REQUEST_CPU`   | `100m`             | Router CPU request                  |
| `VLLM_ROUTER_REQUEST_MEMORY`| `256Mi`            | Router memory request               |
| `VLLM_ROUTER_LIMIT_MEMORY`  | `768Mi`            | Router memory limit                 |

## Secret Management

vLLM secrets (HuggingFace token and API key) are stored securely:

- **With External Secrets Operator**: Secrets are stored in Vault and synced via ExternalSecret
- **Without External Secrets Operator**: Secrets are stored directly as Kubernetes Secrets

### API Key Management

```bash
# Set API key (stored in Vault if ESO available)
just vllm::set-api-key

# Get API key
just vllm::get-api-key

# Delete API key
just vllm::delete-api-key
```

### HuggingFace Token Management

```bash
# Set HuggingFace token (stored in Vault if ESO available)
just vllm::set-hf-token

# Get HuggingFace token
just vllm::get-hf-token

# Delete HuggingFace token
just vllm::delete-hf-token
```

## Operations

### Check Status

```bash
just vllm::status
```

### View Logs

```bash
# Select model interactively
just vllm::logs

# Specify model
just vllm::logs llama3

# Router logs
just vllm::router-logs
```

### List Models from API

```bash
just vllm::list-api-models
```

### Port Forward for Local Access

```bash
just vllm::port-forward
# Accessible at http://localhost:8000
```

### Test API

```bash
# Select model interactively
just vllm::test-completions

# Specify model
just vllm::test-completions llama3 "What is the capital of France?"
```

## API Usage

vLLM exposes an OpenAI-compatible API through the router service at `http://vllm-router.vllm.svc.cluster.local`.

### Chat Completions

```bash
curl http://vllm-router.vllm.svc.cluster.local/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Python Client

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://vllm-router.vllm.svc.cluster.local/v1",
    api_key="your-api-key"  # Or "EMPTY" if no API key is set
)

response = client.chat.completions.create(
    model="llama3",  # Use model name from models.yaml
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

## Multi-GPU Configuration

### Tensor Parallelism

For large models that don't fit in a single GPU:

```yaml
- name: llama3-70b
  modelURL: meta-llama/Llama-3.1-70B-Instruct
  requestGPU: 2
  requestMemory: 128Gi
  pvcStorage: 200Gi
  vllmConfig:
    tensorParallelSize: 2
    dtype: bfloat16
    gpuMemoryUtilization: 0.95
```

### Multiple Replicas

For higher throughput, increase replica count:

```yaml
- name: llama3
  modelURL: meta-llama/Llama-3.2-3B-Instruct
  replicaCount: 2  # Two replicas for load balancing
  requestGPU: 1
```

The router automatically load balances requests across replicas.

## Upgrade

```bash
just vllm::upgrade
```

## Uninstall

```bash
just vllm::uninstall
```

This removes the Helm release and namespace. Model caches are deleted with the PVCs.

## Troubleshooting

### Pod Stuck in Pending

Check if GPU resources are available:

```bash
kubectl describe node | grep -A 5 "nvidia.com/gpu"
```

### Model Download Fails

For gated models (Llama, Mistral), ensure HuggingFace token is set:

```bash
VLLM_HF_TOKEN=hf_xxxxx just vllm::upgrade
```

### Out of Memory Errors

Options to reduce memory usage:

1. Use a smaller model or quantized version
2. Add `vllmConfig.maxModelLen` to limit context length
3. Add `vllmConfig.gpuMemoryUtilization: 0.9` to reserve some GPU memory
4. Use tensor parallelism across multiple GPUs

### Slow Model Loading

Model loading can take several minutes for large models. Check logs:

```bash
just vllm::logs llama3
```

### Connection Refused

Ensure the router is running:

```bash
kubectl get pods -n vllm -l app.kubernetes.io/name=router
```

## Architecture

```plain
External Requests
      |
Router Service (Load Balancer)
      |
      +-- Model: llama3
      |     +-- Replica 1 (GPU) + PVC
      |     +-- Replica 2 (GPU) + PVC
      |
      +-- Model: qwen
      |     +-- Replica 1 (GPU) + PVC
      |
      +-- Model: mistral
            +-- Replica 1 (GPU) + PVC
```

## Configuration Files

| File                                       | Description                                  |
| ------------------------------------------ | -------------------------------------------- |
| `models.yaml`                              | Model definitions (user-created, gitignored) |
| `models.example.yaml`                      | Example model configuration                  |
| `values.gomplate.yaml`                     | Helm values template                         |
| `hf-token-external-secret.gomplate.yaml`   | ExternalSecret for HuggingFace token         |
| `api-key-external-secret.gomplate.yaml`    | ExternalSecret for API key                   |

## Security Considerations

- **Pod Security Standards**: Namespace uses **baseline** level (GPU access requires elevated privileges)
- **API Key**: Optional but recommended for securing the vLLM endpoint; stored in Vault when ESO is available
- **HuggingFace Token**: Stored in Vault (with ESO) or Kubernetes Secret (without ESO), not exposed in logs

## References

- [vLLM Documentation](https://docs.vllm.ai/)
- [vLLM GitHub](https://github.com/vllm-project/vllm)
- [vLLM Production Stack](https://github.com/vllm-project/production-stack)
- [Supported Models](https://docs.vllm.ai/en/latest/models/supported_models.html)
- [HuggingFace Model Hub](https://huggingface.co/models)
