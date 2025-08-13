set dotenv-filename := ".env.local"

[private]
default:
    @just --list --unsorted --list-submodules

mod env
mod k8s

import? "custom.just"
