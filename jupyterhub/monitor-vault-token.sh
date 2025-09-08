#!/bin/bash

# JupyterHub Vault Token Monitor Script
# Usage: ./monitor-vault-token.sh [pod-name]

set -euo pipefail

NAMESPACE="jupyter"
POD_NAME=${1:-$(kubectl get pods -n ${NAMESPACE} -l app.kubernetes.io/component=hub -o jsonpath='{.items[0].metadata.name}')}

echo "🔍 Monitoring Vault Agent for JupyterHub Pod: ${POD_NAME}"
echo "=================================================="

# Check if pod exists and is running
if ! kubectl get pod ${POD_NAME} -n ${NAMESPACE} >/dev/null 2>&1; then
  echo "❌ Pod ${POD_NAME} not found in namespace ${NAMESPACE}"
  exit 1
fi

echo "📊 Pod Status:"
kubectl get pod ${POD_NAME} -n ${NAMESPACE}
echo ""

echo "📄 Vault Secrets Directory:"
kubectl exec -n ${NAMESPACE} ${POD_NAME} -c hub -- ls -la /vault/secrets/ 2>/dev/null || echo "❌ Cannot access /vault/secrets/"
echo ""

echo "🔐 Current Token Info:"
kubectl exec -n ${NAMESPACE} ${POD_NAME} -c hub -- sh -c '
    if [ -f /vault/secrets/vault-token ]; then
        echo "Token file exists ($(wc -c < /vault/secrets/vault-token) bytes)"
        echo "Last modified: $(stat -c %y /vault/secrets/vault-token 2>/dev/null || stat -f %Sm /vault/secrets/vault-token)"

        # Test token validity
        if command -v curl >/dev/null 2>&1; then
            echo ""
            echo "Token validation:"
            RESPONSE=$(curl -s -w "%{http_code}" -H "X-Vault-Token: $(cat /vault/secrets/vault-token)" $VAULT_ADDR/v1/auth/token/lookup-self)
            HTTP_CODE="${RESPONSE: -3}"
            if [ "$HTTP_CODE" = "200" ]; then
                echo "✅ Token is valid"
                echo "$RESPONSE" | head -c -3 | grep -E "(ttl|expire_time|renewable)" | head -3
            else
                echo "❌ Token validation failed (HTTP $HTTP_CODE)"
            fi
        fi
    else
        echo "❌ Token file not found"
    fi
' 2>/dev/null || echo "❌ Cannot check token info"

echo ""
echo "📋 Recent Vault Agent Logs:"
kubectl logs -n ${NAMESPACE} ${POD_NAME} -c vault-agent --tail=10 2>/dev/null || echo "❌ Cannot access vault-agent logs"

echo ""
echo "📋 Token Renewal Log (if exists):"
kubectl exec -n ${NAMESPACE} ${POD_NAME} -c hub -- sh -c '
    if [ -f /vault/secrets/renewal.log ]; then
        echo "Recent renewal events:"
        tail -10 /vault/secrets/renewal.log
    else
        echo "No renewal log file found yet"
    fi
' 2>/dev/null || echo "❌ Cannot check renewal logs"

echo ""
echo "🔄 To monitor token renewals in real-time, run:"
echo "  kubectl logs -n ${NAMESPACE} ${POD_NAME} -c vault-agent -f | grep 'renewed auth token'"
echo ""
echo "🔍 To check token info periodically, run:"
echo "  watch -n 30 \"kubectl exec -n ${NAMESPACE} ${POD_NAME} -c hub -- sh -c 'curl -s -H \\\"X-Vault-Token: \\\$(cat /vault/secrets/vault-token)\\\" \\\$VAULT_ADDR/v1/auth/token/lookup-self | grep -E \\\"(ttl|expire_time)\\\"'\""

