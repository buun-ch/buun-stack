set dotenv-filename := ".env.local"

export PATH := "./node_modules/.bin:" + env_var('PATH')

[private]
default:
    @just --list --unsorted --list-submodules

mod env
mod external-secrets
mod keycloak
mod jupyterhub
mod k8s
mod longhorn
mod minio
mod postgres
mod utils
mod vault

import? "custom.just"
