# KServe + MLflow + JupyterHub: Iris Classification Example

This example demonstrates an end-to-end machine learning workflow using:

- **JupyterHub**: Interactive development, model training, and testing
- **MLflow**: Model tracking and registry
- **MinIO**: Artifact storage (S3-compatible)
- **KServe**: Model serving and inference

## Workflow Overview

1. **📓 Train & Register** (`01-train-and-register.ipynb`) - Train model in JupyterHub, register to MLflow
2. **🚀 Deploy** (`02-deploy-model.yaml`) - Deploy model with KServe InferenceService
3. **🧪 Test from Notebook** (`03-test-inference.ipynb`) - Test inference from JupyterHub (Recommended)
4. **🔧 Test from Pod** (`04-test-inference-job.yaml`) - Automated testing from Kubernetes Job

## Architecture

```plain
┌─────────────┐     ┌─────────┐     ┌────────┐     ┌─────────────────┐
│ JupyterHub  │────>│ MLflow  │────>│ MinIO  │<────│ KServe          │
│             │     │         │     │  (S3)  │     │ InferenceService│
│ 1. Train    │     │ Register│     │ Store  │     │ 2. Deploy       │
│    Model    │     │         │     │ Model  │     │    & Serve      │
└──────┬──────┘     └─────────┘     └────────┘     └──────────┬──────┘
       │                                                      │
       │ 3. Test from Notebook (Recommended)                  │
       └──────────────────────────────────────────────────────┘
                                                              │
                                                              │
                                          4. Test from Pod    │
                                             (Alternative)    │
                                                              v
                                                       ┌──────────────┐
                                                       │ Kubernetes   │
                                                       │ Test Job     │
                                                       └──────────────┘
```

## Prerequisites

Ensure the following components are installed:

```bash
# Check installations
kubectl get pods -n jupyterhub
kubectl get pods -n mlflow
kubectl get pods -n minio
kubectl get pods -n kserve
```

## Step 1: Train and Register Model in JupyterHub

1. **Access JupyterHub**:

   Access JupyterHub at the configured JUPYTERHUB_HOST

2. **Upload the Notebook**:
   - Upload `01-train-and-register.ipynb` to your JupyterHub workspace

3. **Set Environment Variables** (in the notebook or terminal):

   ```bash
   # MLflow authentication (required if MLflow has authentication enabled)
   export MLFLOW_TRACKING_USERNAME=your-username
   export MLFLOW_TRACKING_PASSWORD=your-password
   ```

   Note: MLFLOW_TRACKING_URI uses the default cluster-internal URL and does not need to be set.

4. **Run the Notebook**:
   - Execute all cells in `01-train-and-register.ipynb`
   - The model will be automatically registered to MLflow Model Registry

5. **Verify in MLflow UI**:

   - Access MLflow UI at the configured MLFLOW_HOST
   - Navigate to "Models" → "iris-classifier"
   - Click on the model version (e.g., "Version 1")
   - Note the **artifact_path** displayed (e.g., `mlflow-artifacts:/2/models/m-28620b840353444385fa8e62335decf5/artifacts`)

## Step 2: Deploy Model with KServe

1. **Get the Model Registry Path**:

   In MLflow UI, navigate to:
   - **Models** → **iris-classifier** → **Version 1**
   - Copy the **artifact_path** from the model details
   - Example: `mlflow-artifacts:/2/models/m-28620b840353444385fa8e62335decf5/artifacts`

   **Important**: Use the artifact_path from the **Model Registry** (contains `/models/`), NOT the run-based path from the experiment runs.

2. **Update the InferenceService YAML**:

   Use the helper command to convert the MLflow artifact path to KServe storageUri:

   ```bash
   just kserve::storage-uri "mlflow-artifacts:/2/models/m-28620b840353444385fa8e62335decf5/artifacts"
   # Output: s3://mlflow/2/models/m-28620b840353444385fa8e62335decf5/artifacts
   ```

   Edit `02-deploy-model.yaml` and replace the `storageUri` with the output:

   ```yaml
   storageUri: s3://mlflow/2/models/m-28620b840353444385fa8e62335decf5/artifacts
   ```

   **Note**: The default configuration uses `mlflow` format, which automatically installs dependencies from `requirements.txt`. This ensures compatibility but may take longer to start (initial container startup installs packages).

3. **Deploy the InferenceService**:

   ```bash
   kubectl apply -f 02-deploy-model.yaml
   ```

4. **Verify Deployment**:

   ```bash
   # Check InferenceService status
   kubectl get inferenceservice iris-classifier -n kserve

   # Wait for it to be ready (STATUS should show "Ready")
   # Note: First deployment may take 5-10 minutes due to dependency installation
   kubectl wait --for=condition=Ready inferenceservice/iris-classifier -n kserve --timeout=600s

   # Check the pods
   kubectl get pods -l serving.kserve.io/inferenceservice=iris-classifier -n kserve

   # Check logs if needed
   kubectl logs -l serving.kserve.io/inferenceservice=iris-classifier -n kserve -c kserve-container
   ```

## Step 3: Test from JupyterHub (Recommended)

1. **Upload the Test Notebook**:
   - Upload `03-test-inference.ipynb` to your JupyterHub workspace

2. **Run the Notebook**:
   - Execute all cells in `03-test-inference.ipynb`
   - The notebook will:
     - Send prediction requests to the KServe endpoint
     - Test single and batch predictions
     - Display results with expected vs actual comparisons
     - Allow you to try custom inputs

3. **Expected Results**:

   ```plain
   Test Case 1: Typical Setosa
     Features: [5.1, 3.5, 1.4, 0.2]
     Expected: Iris Setosa
     Predicted: Iris Setosa
     Status: ✓ PASS
   ```

## Step 4: Test from Kubernetes Pod (Alternative)

After testing in JupyterHub, you can also test from Kubernetes Pods for automated testing or CI/CD integration.

### Option 1: Automated Test with Python (Recommended)

```bash
# Run the test job
kubectl apply -f 04-test-inference-job.yaml

# Check logs
kubectl logs job/test-iris-inference -n kserve

# Expected output:
# Test Case 1:
#   Input: [5.1, 3.5, 1.4, 0.2]
#   Expected: setosa
#   Predicted: setosa (class 0)
#   Status: ✓ PASS
```

### Option 2: Manual Test from a Pod

```bash
# Start a test pod
kubectl run test-pod --image=curlimages/curl --rm -it --restart=Never -- sh

# Inside the pod, run:
curl -X POST \
  http://iris-classifier-predictor.kserve.svc.cluster.local/v2/models/iris-classifier/infer \
  -H "Content-Type: application/json" \
  -d '{"inputs": [{"name": "input-0", "shape": [1, 4], "datatype": "FP64", "data": [[5.1, 3.5, 1.4, 0.2]]}]}'
```

## Model Prediction Examples

### Single Prediction (v2 Protocol)

```json
// Request
{
  "inputs": [
    {
      "name": "input-0",
      "shape": [1, 4],
      "datatype": "FP64",
      "data": [[5.1, 3.5, 1.4, 0.2]]  // Sepal length, Sepal width, Petal length, Petal width
    }
  ]
}

// Response
{
  "outputs": [
    {
      "name": "output-0",
      "shape": [1],
      "datatype": "INT64",
      "data": [0]  // 0=setosa, 1=versicolor, 2=virginica
    }
  ]
}
```

### Batch Prediction (v2 Protocol)

```json
// Request
{
  "inputs": [
    {
      "name": "input-0",
      "shape": [3, 4],
      "datatype": "FP64",
      "data": [
        [5.1, 3.5, 1.4, 0.2],  // Setosa
        [6.7, 3.0, 5.2, 2.3],  // Virginica
        [5.9, 3.0, 4.2, 1.5]   // Versicolor
      ]
    }
  ]
}

// Response
{
  "outputs": [
    {
      "name": "output-0",
      "shape": [3],
      "datatype": "INT64",
      "data": [0, 2, 1]
    }
  ]
}
```

## Troubleshooting

### InferenceService Not Ready

```bash
# Check events
kubectl describe inferenceservice iris-classifier -n kserve

# Check pod logs
kubectl logs -l serving.kserve.io/inferenceservice=iris-classifier -n kserve -c kserve-container
```

### S3/MinIO Connection Issues

```bash
# Verify S3 credentials secret
kubectl get secret kserve-s3-credentials -n kserve -o yaml

# Test MinIO access from a pod
kubectl run minio-test --image=amazon/aws-cli --rm -it --restart=Never -- \
  sh -c "AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin aws --endpoint-url=http://minio.minio.svc.cluster.local:9000 s3 ls s3://mlflow/"
```

### Model Not Found

```bash
# Verify the model exists in MinIO Console
# Access MinIO Console at the configured MINIO_HOST
# Navigate to mlflow bucket and verify the model path
# The path should be: EXPERIMENT_ID/models/MODEL_ID/artifacts/

# Example: 2/models/m-28620b840353444385fa8e62335decf5/artifacts/
```

### Prediction Errors

```bash
# Check model format and KServe runtime compatibility
kubectl logs -l serving.kserve.io/inferenceservice=iris-classifier -n kserve
```

## Cleanup

```bash
# Delete InferenceService
kubectl delete inferenceservice iris-classifier -n kserve

# Delete test job
kubectl delete job test-iris-inference -n kserve
```

## Next Steps

- Try different models (XGBoost, TensorFlow, PyTorch)
- Add model versioning and A/B testing
- Implement canary deployments
- Add monitoring and observability
- Scale the InferenceService based on load

## References

- [KServe Documentation](https://kserve.github.io/website/)
- [MLflow Documentation](https://mlflow.org/docs/latest/index.html)
- [KServe Model Serving](https://kserve.github.io/website/latest/modelserving/v1beta1/sklearn/v2/)
