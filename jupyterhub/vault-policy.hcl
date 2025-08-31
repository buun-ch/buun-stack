# JupyterHub user policy for Vault access

# Read access to shared jupyter resources
path "secret/data/jupyter/shared/*" {
    capabilities = ["read", "list"]
}

# Allow users to list shared directory
path "secret/metadata/jupyter/shared" {
    capabilities = ["list"]
}

# Full access to user-specific paths
path "secret/data/jupyter/users/{{identity.entity.aliases.auth_jwt_*.metadata.username}}/*" {
    capabilities = ["create", "update", "read", "delete", "list"]
}

# Allow users to list their own directory
path "secret/metadata/jupyter/users/{{identity.entity.aliases.auth_jwt_*.metadata.username}}/*" {
    capabilities = ["list", "read", "delete"]
}

# Allow users to list only their own user directory for navigation
path "secret/metadata/jupyter/users/{{identity.entity.aliases.auth_jwt_*.metadata.username}}" {
    capabilities = ["list"]
}
