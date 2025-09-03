# User-specific policy for {username}
path "secret/data/jupyter/users/{username}/*" {
    capabilities = ["create", "update", "read", "delete", "list"]
}

path "secret/metadata/jupyter/users/{username}/*" {
    capabilities = ["list", "read", "delete", "update"]
}

path "secret/metadata/jupyter/users/{username}" {
    capabilities = ["list"]
}

# Read access to shared resources
path "secret/data/jupyter/shared/*" {
    capabilities = ["read", "list"]
}

path "secret/metadata/jupyter/shared" {
    capabilities = ["list"]
}

# Token management capabilities
path "auth/token/lookup-self" {
    capabilities = ["read"]
}

path "auth/token/renew-self" {
    capabilities = ["update"]
}