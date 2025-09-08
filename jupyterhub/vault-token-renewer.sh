#!/bin/sh
# Script to handle admin token retrieval and renewal

set -e

echo "Starting Vault token management..."

export VAULT_ADDR="${VAULT_ADDR}"

# Wait for ExternalSecret to create the secret
echo "Waiting for admin token from ExternalSecret..."
while [ ! -f /vault/admin-token/token ]; do
    echo "Waiting for /vault/admin-token/token..."
    sleep 5
done

# Read admin token from mounted secret
ADMIN_TOKEN=$(cat /vault/admin-token/token)

if [ -z "$ADMIN_TOKEN" ]; then
    echo "ERROR: No admin token found in mounted secret"
    exit 1
fi

echo "Admin token retrieved from ExternalSecret"
echo "$ADMIN_TOKEN" > /vault/secrets/vault-token

# Start token renewal loop
export VAULT_TOKEN="$ADMIN_TOKEN"
while true; do
    echo "$(date): Renewing admin token..."
    if vault token renew >/dev/null 2>&1; then
        echo "$(date): Token renewed successfully"
    else
        echo "$(date): Token renewal failed - trying to retrieve token again from ExternalSecret"
        # Re-read token from mounted secret
        ADMIN_TOKEN=$(cat /vault/admin-token/token 2>/dev/null || echo "")
        if [ -n "$ADMIN_TOKEN" ]; then
            echo "$ADMIN_TOKEN" > /vault/secrets/vault-token
            export VAULT_TOKEN="$ADMIN_TOKEN"
            echo "$(date): Token re-retrieved successfully from ExternalSecret"
        else
            echo "$(date): Failed to re-retrieve token from ExternalSecret"
        fi
    fi
    sleep 43200  # 12 hours
done