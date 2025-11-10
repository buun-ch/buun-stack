# KServe

KServe is a standard Model Inference Platform on Kubernetes for Machine Learning and Generative AI. It provides a standardized way to deploy, serve, and manage ML models across different frameworks.

## Features

- **Multi-Framework Support**: TensorFlow, PyTorch, scikit-learn, XGBoost, Hugging Face, Triton, and more
- **Deployment Modes**:
    - **RawDeployment (Standard)**: Uses native Kubernetes Deployments without Knative
    - **Serverless (Knative)**: Auto-scaling with scale-to-zero capability
- **Model Storage**: Support for S3, GCS, Azure Blob, PVC, and more
- **Inference Protocols**: REST and gRPC
- **Advanced Features**: Canary deployments, traffic splitting, explainability, outlier detection

## Prerequisites

- Kubernetes cluster (installed via `just k8s::install`)
- Longhorn storage (installed via `just longhorn::install`)
- **cert-manager** (required, installed via `just cert-manager::install`)
- MinIO (optional, for S3-compatible model storage via `just minio::install`)
- Prometheus (optional, for monitoring via `just prometheus::install`)

## Installation

### Basic Installation

```bash
# Install cert-manager (required)
just cert-manager::install

# Install KServe with default settings (RawDeployment mode)
just kserve::install
```

During installation, you will be prompted for:

- **Prometheus Monitoring**: Whether to enable ServiceMonitor (if Prometheus is installed)

The domain for inference endpoints is configured via the `KSERVE_DOMAIN` environment variable (default: `cluster.local`).

### Environment Variables

Key environment variables (set via `.env.local` or environment):

```bash
KSERVE_NAMESPACE=kserve                    # Namespace for KServe
KSERVE_CHART_VERSION=v0.15.0               # KServe Helm chart version
KSERVE_DEPLOYMENT_MODE=RawDeployment       # Deployment mode (RawDeployment or Knative)
KSERVE_DOMAIN=cluster.local                # Base domain for inference endpoints
MONITORING_ENABLED=true                    # Enable Prometheus monitoring
MINIO_NAMESPACE=minio                      # MinIO namespace (if using MinIO)
```

### Domain Configuration

KServe uses the `KSERVE_DOMAIN` to construct URLs for inference endpoints.

**Internal Access Only (Default):**

```bash
KSERVE_DOMAIN=cluster.local
```

- InferenceServices are accessible only within the cluster
- URLs: `http://<service-name>.<namespace>.svc.cluster.local`
- No external Ingress configuration needed
- Recommended for development and testing

**External Access:**

```bash
KSERVE_DOMAIN=example.com
```

- InferenceServices are accessible from outside the cluster
- URLs: `https://<service-name>.<namespace>.example.com`
- Requires Traefik Ingress configuration
- DNS records must point to your cluster
- Recommended for production deployments

## Usage

### Check Status

```bash
# View status of KServe components
just kserve::status

# View controller logs
just kserve::logs
```

### Deploy a Model

Create an `InferenceService` resource:

```yaml
apiVersion: serving.kserve.io/v1beta1
kind: InferenceService
metadata:
    name: sklearn-iris
    namespace: default
spec:
    predictor:
        sklearn:
            storageUri: s3://models/sklearn/iris
```

Apply the resource:

```bash
kubectl apply -f inferenceservice.yaml
```

### Access Inference Endpoint

```bash
# Get inference service URL
kubectl get inferenceservice sklearn-iris
```

**For cluster.local (internal access):**

```bash
# From within the cluster
curl -X POST http://sklearn-iris.default.svc.cluster.local/v1/models/sklearn-iris:predict \
    -H "Content-Type: application/json" \
    -d '{"instances": [[6.8, 2.8, 4.8, 1.4]]}'
```

**For external domain:**

```bash
# From anywhere (requires DNS and Ingress configuration)
curl -X POST https://sklearn-iris.default.example.com/v1/models/sklearn-iris:predict \
    -H "Content-Type: application/json" \
    -d '{"instances": [[6.8, 2.8, 4.8, 1.4]]}'
```

## Storage Configuration

### Using MinIO (S3-compatible)

If MinIO is installed, KServe will automatically configure S3 credentials:

```bash
# Storage secret is created automatically during installation
kubectl get secret kserve-s3-credentials -n kserve
```

**External Secrets Integration:**

- When External Secrets Operator is available:
    - Credentials are retrieved directly from Vault at `minio/admin`
    - ExternalSecret resource syncs credentials to Kubernetes Secret
    - Secret includes KServe-specific annotations for S3 endpoint configuration
    - No duplicate storage needed - references existing MinIO credentials
- When External Secrets Operator is not available:
    - Credentials are retrieved from MinIO Secret
    - Kubernetes Secret is created directly with annotations
    - Credentials are also backed up to Vault at `kserve/storage` if available

Models can be stored in MinIO buckets:

```bash
# Create a bucket for models
just minio::create-bucket models

# Upload model files to MinIO
# Then reference in InferenceService: s3://models/path/to/model
```

### Using Other Storage

KServe supports various storage backends:

- **S3**: AWS S3 or compatible services
- **GCS**: Google Cloud Storage
- **Azure**: Azure Blob Storage
- **PVC**: Kubernetes Persistent Volume Claims
- **HTTP/HTTPS**: Direct URLs

## Supported Frameworks

The following serving runtimes are enabled by default:

- **scikit-learn**: sklearn models
- **XGBoost**: XGBoost models
- **MLServer**: Multi-framework server (sklearn, XGBoost, etc.)
- **Triton**: NVIDIA Triton Inference Server
- **TensorFlow**: TensorFlow models
- **PyTorch**: PyTorch models via TorchServe
- **Hugging Face**: Transformer models

## Advanced Configuration

### Custom Serving Runtimes

You can create custom `ClusterServingRuntime` or `ServingRuntime` resources for specialized model servers.

### Prometheus Monitoring

When monitoring is enabled, KServe controller metrics are exposed and scraped by Prometheus:

```bash
# View metrics in Grafana
# Metrics include: inference request rates, latencies, error rates
```

## Deployment Modes

### RawDeployment (Standard)

- Uses standard Kubernetes Deployments, Services, and Ingress
- No Knative dependency
- Simpler setup, more control over resources
- Manual scaling configuration required

### Serverless (Knative)

- Requires Knative Serving installation
- Auto-scaling with scale-to-zero
- Advanced traffic management
- Better resource utilization for sporadic workloads

## Examples

### Iris Classification with MLflow

A complete end-to-end example demonstrating model serving with KServe:

- Train an Iris classification model in JupyterHub
- Register the model to MLflow Model Registry
- Deploy the registered model with KServe InferenceService
- Test inference using v2 protocol from JupyterHub notebooks and Kubernetes Jobs

This example demonstrates:
- Converting MLflow artifact paths to KServe storageUri
- Using MLflow format runtime (with automatic dependency installation)
- Testing with both single and batch predictions
- Using v2 Open Inference Protocol

See: [`examples/kserve-mlflow-iris`](../examples/kserve-mlflow-iris/README.md)

## Uninstallation

```bash
# Remove KServe (keeps CRDs for safety)
just kserve::uninstall
```

This will:

- Uninstall KServe resources Helm chart
- Uninstall KServe CRDs
- Delete storage secrets
- Delete namespace

**Warning**: Uninstalling will remove all InferenceService resources.

## Troubleshooting

### Check Controller Logs

```bash
just kserve::logs
```

### View InferenceService Status

```bash
kubectl get inferenceservice -A
kubectl describe inferenceservice <name> -n <namespace>
```

### Check Predictor Pods

```bash
kubectl get pods -l serving.kserve.io/inferenceservice=<name>
kubectl logs <pod-name>
```

### Storage Issues

If models fail to download:

```bash
# Check storage initializer logs
kubectl logs <pod-name> -c storage-initializer

# Verify S3 credentials
kubectl get secret kserve-s3-credentials -n kserve -o yaml
```

## References

- [KServe Documentation](https://kserve.github.io/website/)
- [KServe GitHub](https://github.com/kserve/kserve)
- [KServe Examples](https://github.com/kserve/kserve/tree/master/docs/samples)
- [Supported ML Frameworks](https://kserve.github.io/website/latest/modelserving/v1beta1/serving_runtime/)
