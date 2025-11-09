FROM burakince/mlflow:3.6.0

# Install mlflow-oidc-auth plugin with filesystem session support
RUN pip install --no-cache-dir \
    mlflow-oidc-auth[full]==5.6.1 \
    cachelib[filesystem]

# Keep the original entrypoint
