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
mod goldilocks
mod keycloak
mod jupyterhub
mod k8s
mod kserve
mod lakekeeper
mod longhorn
mod metabase
mod mlflow
mod minio
mod fairwinds-polaris
mod oauth2-proxy
mod postgres
mod prometheus
mod qdrant
mod querybook
mod superset
mod trino
mod utils
mod vault
mod vpa

import? "custom.just"
