# Ollama

Local LLM inference server for running open-source models:

- **Local Inference**: Run LLMs locally without external API dependencies
- **GPU Acceleration**: NVIDIA GPU support with automatic runtime configuration
- **Model Library**: Access to thousands of open-source models (Llama, Qwen, DeepSeek, Mistral, etc.)
- **OpenAI-Compatible API**: Drop-in replacement for OpenAI API endpoints
- **Persistent Storage**: Models stored persistently across restarts

## Prerequisites

For GPU support, ensure NVIDIA Device Plugin is installed:

```bash
just nvidia-device-plugin::install
```

See [nvidia-device-plugin/README.md](../nvidia-device-plugin/README.md) for host system requirements.

## Installation

```bash
just ollama::install
```

During installation, you will be prompted for:

- **GPU support**: Enable/disable NVIDIA GPU acceleration
- **Models to pull**: Comma-separated list of models to download (e.g., `qwen3:8b,deepseek-r1:8b`)

### Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `OLLAMA_NAMESPACE` | `ollama` | Kubernetes namespace |
| `OLLAMA_CHART_VERSION` | `1.35.0` | Helm chart version |
| `OLLAMA_GPU_ENABLED` | (prompt) | Enable GPU support (`true`/`false`) |
| `OLLAMA_GPU_TYPE` | `nvidia` | GPU type (`nvidia` or `amd`) |
| `OLLAMA_GPU_COUNT` | `1` | Number of GPUs to allocate |
| `OLLAMA_MODELS` | (prompt) | Comma-separated list of models |
| `OLLAMA_STORAGE_SIZE` | `30Gi` | Persistent volume size for models |

### Example with Environment Variables

```bash
OLLAMA_GPU_ENABLED=true OLLAMA_MODELS="qwen3:8b,llama3.2:3b" just ollama::install
```

## Model Management

### List Models

```bash
just ollama::list
```

### Pull a Model

```bash
just ollama::pull qwen3:8b
```

### Run Interactive Chat

```bash
just ollama::run qwen3:8b
```

### Check Status

```bash
just ollama::status
```

### View Logs

```bash
just ollama::logs
```

Browse available models at [ollama.com/library](https://ollama.com/library).

## API Usage

Ollama exposes an OpenAI-compatible API at `http://ollama.ollama.svc.cluster.local:11434`.

### OpenAI-Compatible Endpoint

```bash
curl http://ollama.ollama.svc.cluster.local:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3:8b",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Native Ollama API

```bash
# Generate completion
curl http://ollama.ollama.svc.cluster.local:11434/api/generate \
  -d '{"model": "qwen3:8b", "prompt": "Hello!"}'

# Chat completion
curl http://ollama.ollama.svc.cluster.local:11434/api/chat \
  -d '{"model": "qwen3:8b", "messages": [{"role": "user", "content": "Hello!"}]}'

# List models
curl http://ollama.ollama.svc.cluster.local:11434/api/tags
```

### Python Client

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://ollama.ollama.svc.cluster.local:11434/v1",
    api_key="ollama"  # Required but ignored
)

response = client.chat.completions.create(
    model="qwen3:8b",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

## GPU Verification

Check if GPU is being used:

```bash
kubectl exec -n ollama deploy/ollama -- ollama ps
```

Expected output with GPU:

```text
NAME        ID              SIZE      PROCESSOR    CONTEXT    UNTIL
qwen3:8b    500a1f067a9f    6.0 GB    100% GPU     4096       4 minutes from now
```

If `PROCESSOR` shows `100% CPU`, see Troubleshooting section.

## Integration with LibreChat

Ollama integrates with [LibreChat](../librechat/README.md) for a web-based chat interface:

```bash
just librechat::install
```

LibreChat automatically connects to Ollama using the internal Kubernetes service URL.

## GPU Time-Slicing

To share a single GPU across multiple pods, enable time-slicing in NVIDIA Device Plugin:

```bash
GPU_TIME_SLICING_REPLICAS=4 just nvidia-device-plugin::install
```

This allows up to 4 pods to share the same GPU (e.g., Ollama + JupyterHub notebooks).

## Upgrade

```bash
just ollama::upgrade
```

## Uninstall

```bash
just ollama::uninstall
```

This removes the Helm release and namespace. Pulled models are deleted with the PVC.

## Troubleshooting

### Model Running on CPU Instead of GPU

**Symptom**: `ollama ps` shows `100% CPU` instead of `100% GPU`

**Cause**: Missing `runtimeClassName: nvidia` in pod spec

**Solution**: Ensure `OLLAMA_GPU_ENABLED=true` and upgrade:

```bash
OLLAMA_GPU_ENABLED=true just ollama::upgrade
```

The Helm values include `runtimeClassName: nvidia` when GPU is enabled.

### GPU Not Detected in Pod

**Check GPU devices in pod**:

```bash
kubectl exec -n ollama deploy/ollama -- ls -la /dev/nvidia*
```

If no devices are found:

1. Verify NVIDIA Device Plugin is running:

   ```bash
   just nvidia-device-plugin::verify
   ```

2. Check RuntimeClass exists:

   ```bash
   kubectl get runtimeclass nvidia
   ```

3. Restart Ollama to pick up GPU:

   ```bash
   kubectl rollout restart deployment/ollama -n ollama
   ```

### Model Download Slow or Failing

**Check pod logs**:

```bash
just ollama::logs
```

**Increase storage if needed** by setting `OLLAMA_STORAGE_SIZE`:

```bash
OLLAMA_STORAGE_SIZE=50Gi just ollama::upgrade
```

### Out of Memory Errors

**Symptom**: Model fails to load with OOM error

**Solutions**:

1. Use a smaller quantized model (e.g., `qwen3:8b` instead of `qwen3:14b`)
2. Reduce context size in your API requests
3. Upgrade to a GPU with more VRAM

## References

- [Ollama Website](https://ollama.com/)
- [Ollama Model Library](https://ollama.com/library)
- [Ollama GitHub](https://github.com/ollama/ollama)
- [Ollama Helm Chart](https://github.com/otwld/ollama-helm)
- [OpenAI API Compatibility](https://ollama.com/blog/openai-compatibility)
