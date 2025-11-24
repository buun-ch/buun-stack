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
- Vault encounters certain error conditions

When sealed, Vault cannot decrypt its data and all operations are blocked.

#### Solution

Unseal Vault using your unseal key:

**Option 1: Using the Web UI**

1. Navigate to your Vault host (e.g., `https://vault.example.com`)
2. Enter your unseal key in the web interface
3. Click "Unseal"

**Option 2: Using kubectl**

```bash
# Get the unseal key from your secure storage
UNSEAL_KEY="your-unseal-key-here"

# Unseal Vault
kubectl exec -n vault vault-0 -- vault operator unseal "${UNSEAL_KEY}"
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
