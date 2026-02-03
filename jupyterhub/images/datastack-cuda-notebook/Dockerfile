# Merge pyspark-notebook into pytorch-notebook:cuda12-python-3.12
# https://github.com/jupyter/docker-stacks/tree/main/images/pytorch-notebook
# https://github.com/jupyter/docker-stacks/tree/main/images/pyspark-notebook
# https://github.com/jupyter/docker-stacks/blob/main/images/pyspark-notebook/setup_spark.py

FROM quay.io/jupyter/pytorch-notebook:x86_64-cuda12-python-3.12

# Fix: https://github.com/hadolint/hadolint/wiki/DL4006
# Fix: https://github.com/koalaman/shellcheck/wiki/SC3014
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

USER root

# Spark dependencies
# Default values can be overridden at build time
# (ARGS are in lowercase to distinguish them from ENV)
ARG openjdk_version="17"

RUN apt-get update --yes && \
    apt-get install --yes --no-install-recommends \
    bash jq \
    "openjdk-${openjdk_version}-jre-headless" \
    ca-certificates-java \
    gnupg

# Install ClickHouse client
RUN curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' | \
    gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] https://packages.clickhouse.com/deb stable main" | \
    tee /etc/apt/sources.list.d/clickhouse.list && \
    apt-get update --yes && \
    apt-get install --yes --no-install-recommends clickhouse-client && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# If spark_version is not set, latest Spark will be installed
ARG spark_version
ARG hadoop_version="3"
# If scala_version is not set, Spark without Scala will be installed
ARG scala_version
# URL to use for Spark downloads
# You need to use https://archive.apache.org/dist/spark/ website if you want to download old Spark versions
# But it seems to be slower, that's why we use the recommended site for download
ARG spark_download_url="https://dlcdn.apache.org/spark/"

ENV SPARK_HOME=/usr/local/spark
ENV SPARK_OPTS="--driver-java-options=-Xms1024M --driver-java-options=-Xmx4096M --driver-java-options=-Dlog4j.logLevel=info"
ENV JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
ENV PATH="${PATH}:${SPARK_HOME}/bin:${JAVA_HOME}/bin"

COPY setup_spark.py /opt/setup-scripts/

# Setup Spark
RUN /opt/setup-scripts/setup_spark.py \
    --spark-version="${spark_version}" \
    --hadoop-version="${hadoop_version}" \
    --scala-version="${scala_version}" \
    --spark-download-url="${spark_download_url}"

# Configure IPython system-wide
COPY ipython_kernel_config.py "/etc/ipython/"
RUN fix-permissions "/etc/ipython/"

# macOS Rosetta virtualization creates junk directory which gets owned by root
RUN rm -rf "/home/${NB_USER}/.cache/"

USER ${NB_UID}

# Remove torch to fix `critical libmamba filesystem error` on executing `memba install`
RUN pip uninstall -y \
    'torch' \
    'torchaudio' \
    'torchvision'

# Install pyarrow
# NOTE: It's important to ensure compatibility between Pandas versions.
# The pandas version in this Dockerfile should match the version
# on which the Pandas API for Spark is built.
# To find the right version:
# 1. Check out the Spark branch you are on: <https://github.com/apache/spark>
# 2. Find the pandas version in the file `dev/infra/Dockerfile`.
RUN mamba install --yes \
    'aif360' \
    'avro' \
    'captum' \
    'chromadb' \
    'clickhouse-connect' \
    'csvkit' \
    'dagster' \
    'dalex' \
    'datafusion' \
    'dbt' \
    'duckdb' \
    'faiss' \
    'gitpython' \
    'grpcio-status' \
    'grpcio' \
    'hvac' \
    'ipywidgets' \
    'jupyter-collaboration' \
    'keras' \
    'langchain' \
    'langchain-chroma' \
    'langchain-community' \
    'langchain-openai' \
    'langchain-qdrant' \
    'langgraph' \
    'langgraph-checkpoint' \
    'langgraph-sdk' \
    'langsmith' \
    'litellm' \
    'nest-asyncio' \
    'openai' \
    'openai-agents' \
    'pandas=2.2.3' \
    'pandas-profiling' \
    'plotly' \
    'pillow' \
    'polars' \
    'psycopg2' \
    'pyarrow' \
    'pyiceberg' \
    'qdrant-client' \
    'ragas' \
    'rapidfuzz' \
    'seaborn' \
    'simple-salesforce' \
    'stable-baselines3' \
    'tensorflow' \
    'transformers' \
    'unstructured' \
    && \
    mamba clean --all -f -y && \
    fix-permissions "${CONDA_DIR}" && \
    fix-permissions "/home/${NB_USER}"

# URL to use for pip downloads
ARG pip_repository_url="https://pypi.org/simple/"

RUN --mount=type=cache,target=/home/${NB_USER}/.cache/pip pip install -i "${pip_repository_url}" \
    agno \
    dagster-dlt \
    falkordb \
    fastembed \
    feature-engine \
    'gymnasium[classic-control]' \
    'huggingface-hub>=1.3' \
    kreuzberg \
    langfuse \
    mlflow \
    pydantic-ai \
    smolagents \
    'statsmodels>=0.14.0' \
    tavily-python \
    tweet-preprocessor

RUN --mount=type=cache,target=/home/${NB_USER}/.cache/pip pip install -i "${pip_repository_url}" \
    'dlt[clickhouse,databricks,deltalake,dremio,duckdb,filesystem,parquet,postgres,pyiceberg,qdrant,redshift,s3,snowflake,sql-database,sqlalchemy,workspace]'

# jupyter-mcp-server as Jupyter Server Extension
# https://jupyter-mcp-server.datalayer.tech/setup/jupyter/local_mcp/
# Provides /mcp/v1 endpoint for Claude Code integration
RUN --mount=type=cache,target=/home/${NB_USER}/.cache/pip \
    pip install -i "${pip_repository_url}" \
        'jupyter-mcp-server' \
        'jupyter-mcp-tools' \
 && pip uninstall -y pycrdt datalayer_pycrdt \
 && pip install -i "${pip_repository_url}" 'datalayer_pycrdt' \
 && jupyter server extension enable jupyter_mcp_server

# Install PyTorch with CUDA 12.x support (https://pytorch.org/get-started/locally/)
# https://github.com/run-llama/llama_index/issues/16540
# hadolint ignore=DL3013
RUN pip install --no-cache-dir --index-url 'https://download.pytorch.org/whl/cu128' --upgrade \
    torch \
    torchaudio \
    torchvision

# Install buunstack package
COPY *.whl /opt/
RUN --mount=type=cache,target=/home/${NB_USER}/.cache/pip pip install -i "${pip_repository_url}" /opt/*.whl

WORKDIR "${HOME}"
EXPOSE 4040
