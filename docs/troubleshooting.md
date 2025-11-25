# Troubleshooting

This document provides solutions to common issues encountered when working with buun-stack.

## Table of Contents

- [Vault Issues](#vault-issues)

## Vault Issues

### Vault is Sealed

#### Symptom

When running `just vault::get` or other Vault-related recipes, you encounter this error:

```plain
Error authenticating: Error making API request.

URL: PUT https://vault.example.com/v1/auth/oidc/oidc/auth_url
Code: 503. Errors:

* Vault is sealed
```

#### Cause

Vault automatically seals itself when:

- The Vault pod is restarted
- The node where Vault is running is restarted
- The machine is rebooted
- Vault encounters certain error conditions

When sealed, Vault cannot decrypt its data and all operations are blocked.

#### Solution

Unseal Vault using your unseal key:

**Option 1: Using the Web UI**

1. Navigate to your Vault host (e.g., `https://vault.example.com`)
2. Enter your unseal key in the web interface
3. Click "Unseal"

**Option 2: Using just recipe (Recommended)**

```bash
just vault::unseal
```

This recipe will prompt for the unseal key interactively. You can also set the `VAULT_UNSEAL_KEY` environment variable to avoid entering it repeatedly:

```bash
# Set in .env.local
VAULT_UNSEAL_KEY=your-unseal-key-here

# Or use 1Password reference
VAULT_UNSEAL_KEY=op://vault/unseal/key
```

**Option 3: Using kubectl**

```bash
# Get the unseal key from your secure storage
UNSEAL_KEY="your-unseal-key-here"

# Unseal Vault
kubectl exec -n vault vault-0 -- vault operator unseal "${UNSEAL_KEY}"
```

After unsealing, restart the External Secrets Operator to ensure it reconnects properly:

```bash
kubectl rollout restart -n external-secrets deploy/external-secrets
```

#### Prevention

**Important**: Store your Vault unseal key and root token securely. You will need them whenever Vault is sealed.

Recommended storage locations:

- Password manager (1Password, Bitwarden, etc.)
- Secure note in your organization's secret management system
- Encrypted file on secure storage

**Never commit unseal keys to version control.**

#### Verification

After unsealing, verify Vault is operational:

```bash
# Check Vault status
kubectl exec -n vault vault-0 -- vault status

# Test secret access
just vault::get test/path field
```

## References

- [Vault Documentation](https://developer.hashicorp.com/vault/docs)
