set dotenv-filename := ".env.local"

export PATH := "./node_modules/.bin:" + env_var('PATH')

[private]
default:
    @just --list --unsorted --list-submodules

mod env
mod k8s
mod longhorn
mod utils
mod vault

import? "custom.just"
