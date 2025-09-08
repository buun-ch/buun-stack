#!/bin/bash
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
echo "$ADMIN_TOKEN" >/vault/secrets/vault-token

# Calculate renewal interval (TTL/2, minimum 30 seconds)
# Use JUPYTERHUB_VAULT_TOKEN_TTL environment variable if available
if [ -n "${JUPYTERHUB_VAULT_TOKEN_TTL}" ]; then
    echo "Using TTL from environment variable: ${JUPYTERHUB_VAULT_TOKEN_TTL}"
    TTL_RAW="${JUPYTERHUB_VAULT_TOKEN_TTL}"
else
    echo "Looking up token TTL..."
    if vault token lookup >/dev/null 2>&1; then
        echo "Token is valid, using default 5m interval for now"
        TTL_RAW="300" # 5 minutes for testing
    else
        echo "Token lookup failed, using default TTL"
        TTL_RAW="86400"
    fi
fi

echo "Raw TTL: $TTL_RAW"

# Convert TTL format (e.g., "4m9s", "3600", "0") to seconds
convert_ttl_to_seconds() {
    local ttl="$1"

    # If already a number (seconds), return as-is
    if echo "$ttl" | grep -E '^[0-9]+$' >/dev/null; then
        echo "$ttl"
        return
    fi

    # If contains time units (e.g., "4m9s")
    local hours=0
    local minutes=0
    local seconds=0
    if echo "$ttl" | grep -E '[0-9]+h' >/dev/null; then
        hours=$(echo "$ttl" | sed -n 's/.*\([0-9]\+\)h.*/\1/p')
        seconds=$((seconds + hours * 3600))
    fi
    if echo "$ttl" | grep -E '[0-9]+m' >/dev/null; then
        minutes=$(echo "$ttl" | sed -n 's/.*\([0-9]\+\)m.*/\1/p')
        seconds=$((seconds + minutes * 60))
    fi
    if echo "$ttl" | grep -E '[0-9]+s' >/dev/null; then
        secs=$(echo "$ttl" | sed -n 's/.*\([0-9]\+\)s.*/\1/p')
        seconds=$((seconds + secs))
    fi
    echo "$seconds"
}

TTL_SECONDS=$(convert_ttl_to_seconds "$TTL_RAW")

if [ "$TTL_SECONDS" = "0" ]; then
    # If TTL is 0 (never expires), use default 12h interval
    RENEWAL_INTERVAL=43200
else
    # Renew at TTL/2, with minimum of 30 seconds
    RENEWAL_INTERVAL=$((TTL_SECONDS / 2))
    if [ "$RENEWAL_INTERVAL" -lt 30 ]; then
        RENEWAL_INTERVAL=30
    fi
fi

echo "Token TTL: ${TTL_SECONDS}s, renewal interval: ${RENEWAL_INTERVAL}s"

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
            echo "$ADMIN_TOKEN" >/vault/secrets/vault-token
            export VAULT_TOKEN="$ADMIN_TOKEN"
            echo "$(date): Token re-retrieved successfully from ExternalSecret"
        else
            echo "$(date): Failed to re-retrieve token from ExternalSecret"
        fi
    fi
    sleep $RENEWAL_INTERVAL
done
