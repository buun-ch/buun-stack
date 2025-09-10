# Merge pyspark-notebook into pytorch-notebook:cuda12-python-3.12
# https://github.com/jupyter/docker-stacks/tree/main/images/pytorch-notebook
# https://github.com/jupyter/docker-stacks/tree/main/images/pyspark-notebook
# https://github.com/jupyter/docker-stacks/blob/main/images/pyspark-notebook/setup_spark.py

FROM quay.io/jupyter/pytorch-notebook:x86_64-cuda12-python-3.12.10

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
    'chromadb' \
    'clickhouse-connect' \
    'csvkit' \
    'dalex' \
    'datafusion' \
    'dbt' \
    'dlt' \
    'duckdb' \
    'faiss' \
    'gitpython' \
    'grpcio-status' \
    'grpcio' \
    'hvac' \
    'keras' \
    'langchain' \
    'langchain-ai21' \
    'langchain-anthropic' \
    'langchain-aws' \
    'langchain-azure-dynamic-sessions' \
    'langchain-chroma' \
    'langchain-community' \
    'langchain-experimental' \
    'langchain-fireworks' \
    'langchain-google-genai' \
    'langchain-groq' \
    'langchain-mistralai' \
    'langchain-mongodb' \
    'langchain-nomic' \
    'langchain-openai' \
    'langchain-prompty' \
    'langchain-qdrant' \
    'langchain-robocorp' \
    'langchain-text-splitters' \
    'langchain-together' \
    'langchain-voyageai' \
    'langgraph' \
    'langgraph-checkpoint' \
    'langgraph-sdk' \
    'langsmith' \
    'litellm' \
    'nest-asyncio' \
    'openai' \
    'openai-agents' \
    'pandas=2.2.2' \
    'pandas-profiling' \
    'pillow' \
    'polars' \
    'psycopg2' \
    'pyarrow' \
    'qdrant-client' \
    'rapidfuzz' \
    'tensorflow' \
    'transformers' \
    'unstructured' \
    && \
    mamba clean --all -f -y && \
    fix-permissions "${CONDA_DIR}" && \
    fix-permissions "/home/${NB_USER}"

# RUN pip install pyspark[connect,ml,mllib,pandas-on-spark,sql]==4.0.0.dev2
# RUN pip install pyspark[connect,ml,mllib,pandas-on-spark,sql]==3.5.4

RUN pip install \
    agno \
    apache-airflow \
    apache-airflow-client \
    fastembed \
    feature-engine \
    jupyter-ai \
    jupyter-ai-magics[all] \
    kreuzberg \
    langchain-huggingface \
    langchain-perplexity \
    langfuse \
    pydantic-ai \
    ragas \
    smolagents \
    tavily-python \
    tweet-preprocessor

# Install PyTorch with pip (https://pytorch.org/get-started/locally/)
# langchain-openai must be updated to avoid pydantic v2 error
# https://github.com/run-llama/llama_index/issues/16540https://github.com/run-llama/llama_index/issues/16540
# hadolint ignore=DL3013
RUN pip install --no-cache-dir --extra-index-url=https://pypi.nvidia.com --index-url 'https://download.pytorch.org/whl/cu124' \
    'torch' \
    'torchaudio' \
    'torchvision' && \
    pip install --upgrade langchain-openai && \
    fix-permissions "${CONDA_DIR}" && \
    fix-permissions "/home/${NB_USER}"

# Install buunstack package
COPY *.whl /opt/
RUN pip install /opt/*.whl && \
    fix-permissions "${CONDA_DIR}" && \
    fix-permissions "/home/${NB_USER}"

WORKDIR "${HOME}"
EXPOSE 4040
