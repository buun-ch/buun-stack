set dotenv-filename := ".env.local"

export PATH := "./node_modules/.bin:" + env_var('PATH')

[private]
default:
    @just --list --unsorted --list-submodules

mod airflow
mod ch-ui
mod clickhouse
mod dagster
mod datahub
mod env
mod external-secrets
mod keycloak
mod jupyterhub
mod k8s
mod lakekeeper
mod longhorn
mod metabase
mod minio
mod oauth2-proxy
mod postgres
mod qdrant
mod trino
mod utils
mod vault

import? "custom.just"
