# JupyterHub Minimal Admin Policy
# Provides only necessary permissions for JupyterHub operations

# Read Keycloak credentials for OIDC authentication
path "secret/data/keycloak/admin" {
  capabilities = ["read"]
}

# Full access to user secrets namespace for notebook users
path "secret/data/jupyter/*" {
  capabilities = ["create", "read", "update", "delete", "list", "patch"]
}

# List secrets for user management
path "secret/metadata/jupyter/*" {
  capabilities = ["list"]
}

# Token creation and management for user-specific tokens
path "auth/token/create" {
  capabilities = ["create", "update"]
}

# Create orphan tokens (requires sudo for policy override)
path "auth/token/create-orphan" {
  capabilities = ["create", "update", "sudo"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Create user-specific policies dynamically
path "sys/policies/acl/jupyter-user-*" {
  capabilities = ["create", "read", "update", "delete"]
}

# Read user policies to allow token creation with these policies
path "sys/policies/acl/*" {
  capabilities = ["read", "list"]
}

# System capabilities check
path "sys/capabilities-self" {
  capabilities = ["read"]
}