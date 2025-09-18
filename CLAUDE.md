# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

buun-stack is a Kubernetes development stack for self-hosted environments with enterprise-grade components (k3s, Vault, Keycloak, PostgreSQL, Longhorn) orchestrated through Just task runner recipes.

## Essential Commands

### Development Setup

```bash
mise install           # Install all required tools
just env::setup        # Interactive environment configuration
just                   # Show all available commands
```

### Just Task Runner Usage

- **Module Structure**: Justfiles are organized by modules (e.g., `just keycloak::admin-password`)
- **List All Recipes**: Run `just` to display all available recipes across modules
- **Module-Specific Help**: Run `just <module>` (e.g., `just keycloak`) to show recipes for that module
- **Execution Location**: ALWAYS run all recipes from the top directory (buun-stack root)

### Core Installation Sequence

```bash
just k8s::install              # Deploy k3s cluster
just longhorn::install         # Storage layer
just vault::install            # Secrets management
just postgres::install         # Database cluster
just keycloak::install         # Identity provider
just keycloak::create-realm    # Initialize realm
just vault::setup-oidc-auth    # Configure Vault OIDC
just k8s::setup-oidc-auth      # Enable k8s OIDC auth
```

### Common Operations

```bash
# User management
just keycloak::create-user                    # Interactive user creation
just keycloak::add-user-to-group <user> <group>

# Secret management
just vault::put <path> <key>=<value>          # Store secret (OIDC auth)
just vault::get <path> <field>                # Retrieve secret

# Database
just postgres::create-db <name>               # Create database
just postgres::psql                           # PostgreSQL shell

# Testing/validation
kubectl --context <host>-oidc get nodes       # Test OIDC auth
```

## Architecture & Key Patterns

### Module Organization

- **Justfiles**: Each module has its own justfile with focused recipes
- **TypeScript Scripts**: `/keycloak/scripts/` contains Keycloak Admin API automation
- **Templates**: `*.gomplate.yaml` files use environment variables from `.env.local`
- **Custom Extensions**: `custom.just` can be created for additional workflows

### Authentication Flow

1. Keycloak provides OIDC identity for all services
2. Vault uses Keycloak for authentication via OIDC
3. Kubernetes API server validates tokens against Keycloak
4. All OIDC users automatically get cluster-admin role

### Environment Variables

The `.env.local` file (created by `just env::setup`) contains critical configuration:

- `LOCAL_K8S_HOST`: Internal SSH hostname
- `EXTERNAL_K8S_HOST`: External FQDN for k8s API
- `KEYCLOAK_HOST`: Keycloak FQDN
- `VAULT_HOST`: Vault FQDN
- `KEYCLOAK_REALM`: Realm name (default: buunstack)

### TypeScript Utilities

All scripts in `/keycloak/scripts/` follow this pattern:

- Use `@keycloak/keycloak-admin-client` for API operations
- Validate environment with `tiny-invariant`
- Load config from `.env.local` using `@dotenvx/dotenvx`
- Execute with `tsx` runtime

### Credential Storage Pattern

The credential storage approach depends on whether External Secrets Operator is available:

**When External Secrets is available** (determined by `helm status external-secrets -n ${EXTERNAL_SECRETS_NAMESPACE}`):

- Credentials are generated and stored in Vault using `just vault::put` commands
- Vault commands are used for secret management

```bash
# Example: PostgreSQL superuser password (only when External Secrets is available)
just vault::get secret/postgres/superuser password
```

**When External Secrets is NOT available**:

- Credentials are stored directly as Kubernetes Secrets
- Vault commands are NOT used

#### Secret Management Rules

1. **Environment File**: Do NOT write to `.env.local` directly for secrets. Use it only for configuration values.

2. **Vault and External Secrets Integration**:
   - When Vault and External Secrets are available, ALWAYS:
     - Store secrets in Vault
     - Create ExternalSecret resources to sync secrets from Vault to Kubernetes
     - Let External Secrets Operator create the actual Secret resources
   - Check availability with:

     ```bash
     if helm status external-secrets -n ${EXTERNAL_SECRETS_NAMESPACE} &>/dev/null; then
         # Use Vault + External Secrets pattern
     fi
     ```

3. **Fallback Pattern**: Only create Kubernetes Secrets directly when Vault/External Secrets are not available.

4. **Helm Values Secret References**:
   - When Helm charts support referencing external Secrets (via `existingSecret`, `secretName`, etc.), ALWAYS use this pattern
   - Create the Secret using External Secrets (preferred) or directly as Kubernetes Secret
   - Reference the Secret in Helm values instead of embedding credentials

5. **Keycloak Client Configuration**:
   - Prefer creating Public clients (without client secret) when possible
   - Public clients are suitable for browser-based applications and native apps
   - Only use confidential clients (with secret) when required by the service

6. **Password Generation**:
   - Use `just utils::random-password` whenever possible to generate random passwords
   - Avoid using `openssl rand -base64 32` or other direct methods
   - This ensures consistent password generation across all modules

### Important Considerations

1. **Root Token**: Vault root token is required for initial setup.

2. **OIDC Configuration**: When creating services that need authentication:
   - Create Keycloak client with `just keycloak::create-client`
   - Configure service to use `https://${KEYCLOAK_HOST}/realms/${KEYCLOAK_REALM}`

3. **Cloudflare Tunnel**: Required hostnames must be configured with "no TLS verify" for self-signed certificates:
   - `ssh.domain` → SSH localhost:22
   - `vault.domain` → HTTPS localhost:443
   - `auth.domain` → HTTPS localhost:443
   - `k8s.domain` → HTTPS localhost:6443

4. **Helm Values**: All Helm charts use gomplate templates for dynamic configuration based on environment variables.

5. **Cleanup Operations**: Most modules provide cleanup recipes (e.g., `just keycloak::delete-user`) with confirmation prompts.

## Testing and Validation

After setup, validate the stack:

```bash
# Test Kubernetes OIDC auth
kubectl --context <host>-oidc get nodes

# Test Vault OIDC auth
vault login -method=oidc
vault kv get secret/test

# Check service health
kubectl get pods -A
```

## Development Workflow

When adding new services:

1. Create module directory with justfile
2. Add gomplate templates for Helm values if needed
3. Store credentials in Vault using established patterns
4. Create Keycloak client if authentication required
5. Import module in main justfile

### Helm Chart Installation Guidelines

1. **Helm Values Modification**:
   - ALWAYS check official documentation and values.yaml definitions before modifying Helm values
   - Understand the chart's structure and available configuration options
   - Test changes in a safe environment when possible

2. **Resource Creation Consistency**:
   - When creating Secret/ExternalSecret/ConfigMap resources, follow patterns from existing modules
   - Maintain consistent naming conventions and label structures
   - Use the same YAML formatting and organization as other modules

3. **Core Component Protection**:
   - Keycloak, PostgreSQL, and Vault are core components
   - NEVER restart or reinstall these components without explicit user approval
   - These services are critical to the entire stack's operation

## Code Style

- Indent lines with 4 spaces
- Do not use trailing whitespace
- It must pass the command: `just --fmt --check --unstable`
- Follow existing Justfile patterns
- Only write code comments when necessary, as the code should be self-explanatory
  (Avoid trivial comment for each code block)
- Write output messages and code comments in English
- Omit trailing spaces at the end of lines
