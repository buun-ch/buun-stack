set dotenv-filename := ".env.local"

export PATH := "./node_modules/.bin:" + env_var('PATH')

[private]
default:
    @just --list --unsorted --list-submodules

mod airflow
mod cert-manager
mod ch-ui
mod clickhouse
mod dagster
mod datahub
mod env
mod external-secrets
mod falkordb
mod goldilocks
mod keycloak
mod jupyterhub
mod k8s
mod kserve
mod langfuse
mod lakekeeper
mod librechat
mod litellm
mod loki
mod longhorn
mod meilisearch
mod memgraph
mod metabase
mod mlflow
mod minio
mod nats
mod nvidia-device-plugin
mod fairwinds-polaris
mod oauth2-proxy
mod ollama
mod postgres
mod prometheus
mod qdrant
mod querybook
mod redis-operator
mod security
mod superset
mod tempo
mod temporal
mod trino
mod utils
mod vault
mod vpa

import? "custom.just"
