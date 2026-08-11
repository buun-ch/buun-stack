# Coder workspace image for buun-stack.
#
# Everything is installed outside /home/coder because the workspace template
# mounts a PersistentVolumeClaim there, which would mask anything baked into
# the home directory. CLI tools live in /opt/mise, Python tooling in /opt/venv,
# and PATH is set with ENV so it reaches the agent and every child process
# without depending on shell startup files.
FROM codercom/enterprise-base:ubuntu

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

USER root

RUN apt-get update --yes && \
    apt-get install --yes --no-install-recommends \
    ca-certificates \
    gnupg \
    htop \
    less \
    neovim \
    postgresql-client \
    redis-tools \
    tmux \
    tree \
    unzip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ClickHouse client is not in the Ubuntu archive
RUN curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' | \
    gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] https://packages.clickhouse.com/deb stable main" \
    > /etc/apt/sources.list.d/clickhouse.list && \
    apt-get update --yes && \
    apt-get install --yes --no-install-recommends clickhouse-client && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV MISE_DATA_DIR=/opt/mise \
    MISE_CONFIG_DIR=/opt/mise/config \
    MISE_STATE_DIR=/opt/mise/state \
    MISE_CACHE_DIR=/tmp/mise-cache \
    MISE_YES=1
ENV PATH="/opt/venv/bin:/opt/mise/shims:${PATH}"

RUN curl -fsSL https://mise.run | MISE_INSTALL_PATH=/usr/local/bin/mise sh

# Versions shared with buun-stack's own mise.toml are pinned to the same value
# so that recipes behave identically inside and outside a workspace.
ARG DUCKDB_VERSION=1.5.4
ARG GOMPLATE_VERSION=5.2.0
ARG HELM_VERSION=4.2.3
ARG JUST_VERSION=1.56.0
ARG UV_VERSION=0.11.21
ARG VAULT_VERSION=2.0.2

RUN mise use -g -y \
    "duckdb@${DUCKDB_VERSION}" \
    "gomplate@${GOMPLATE_VERSION}" \
    "helm@${HELM_VERSION}" \
    "just@${JUST_VERSION}" \
    "uv@${UV_VERSION}" \
    "vault@${VAULT_VERSION}" \
    bat@latest \
    delta@latest \
    fzf@latest \
    gh@latest \
    jq@latest \
    k9s@latest \
    kubectl@latest \
    kubectx@latest \
    lazygit@latest \
    mc@latest \
    ripgrep@latest \
    stern@latest \
    yq@latest && \
    mise reshim && \
    rm -rf /tmp/mise-cache

# NATS CLI is not in the mise registry
ARG NATS_CLI_VERSION=0.3.1
RUN arch="$(dpkg --print-architecture)" && \
    curl -fsSL "https://github.com/nats-io/natscli/releases/download/v${NATS_CLI_VERSION}/nats-${NATS_CLI_VERSION}-linux-${arch}.zip" \
    -o /tmp/nats.zip && \
    unzip -q -j /tmp/nats.zip "*/nats" -d /usr/local/bin && \
    chmod 755 /usr/local/bin/nats && \
    rm -f /tmp/nats.zip

# Python tooling. dbt-duckdb pulls in dbt-core; duckdb/pyarrow/polars are here
# so that ad-hoc analysis works without creating a virtualenv first.
#
# The uv-managed interpreter has to live outside root's home: the venv
# references it by absolute path, and the workspace runs as `coder`.
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python
RUN uv python install 3.12 && \
    uv venv --python 3.12 /opt/venv && \
    VIRTUAL_ENV=/opt/venv uv pip install --no-cache \
    dbt-duckdb \
    duckdb \
    ipython \
    polars \
    psycopg2-binary \
    pyarrow

# DuckDB extensions are installed into the user's home at runtime, which is the
# PVC. Pre-populating them here would be masked by the mount, so the agent's
# startup script installs them on first boot instead.

RUN chmod -R a+rX /opt/mise /opt/uv /opt/venv

USER coder
