# JupyterHub user policy for Vault access

# Read access to shared jupyter resources
path "secret/data/jupyter/shared/*" {
    capabilities = ["read", "list"]
}

# Full access to user-specific paths
path "secret/data/jupyter/users/{{identity.entity.aliases.auth_jwt_*.metadata.username}}/*" {
    capabilities = ["create", "update", "read", "delete", "list"]
}

# Allow users to list their own directory
path "secret/metadata/jupyter/users/{{identity.entity.aliases.auth_jwt_*.metadata.username}}/*" {
    capabilities = ["list", "read", "delete"]
}

# Allow users to list jupyter root to navigate
path "secret/metadata/jupyter/*" {
    capabilities = ["list"]
}
