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
- **Recipe Parameters**: Recipe parameters are passed as **positional arguments**, not named arguments

**Parameter Passing Examples:**

```bash
# CORRECT: Positional arguments
just postgres::create-user-and-db superset superset "password123"

# INCORRECT: Named arguments (will not work)
just postgres::create-user-and-db username=superset db_name=superset password="password123"

# Recipe definition (for reference)
create-user-and-db username='' db_name='' password='':
    just create-db "{{ db_name }}"
    just create-user "{{ username }}" "{{ password }}"
```

**Important Notes:**

- Parameters must be passed in the exact order they appear in the recipe definition
- Named parameter syntax in the recipe definition is only for documentation
- Always quote parameters that contain special characters or spaces

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

### Observability Stack Installation (Optional)

```bash
just prometheus::install       # Install kube-prometheus-stack (Prometheus + Grafana + Alertmanager)
just prometheus::setup-oidc    # Configure Grafana OIDC with Keycloak
# Future: Jaeger and OpenTelemetry Collector
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

# Observability
just prometheus::grafana-password             # Get Grafana admin password
just keycloak::add-user-to-group <user> grafana-admins  # Grant Grafana admin access

# Testing/validation
kubectl --context <host>-oidc get nodes       # Test OIDC auth
```

## Architecture & Key Patterns

### Module Organization

- **Justfiles**: Each module has its own justfile with focused recipes
- **TypeScript Scripts**: `/keycloak/scripts/` contains Keycloak Admin API automation
- **Templates**: `*.gomplate.yaml` files use environment variables from `.env.local`
- **Custom Extensions**: `custom.just` can be created for additional workflows

### Resource Management

All components should have appropriate resource requests and limits configured. See [docs/resource-management.md](docs/resource-management.md) for:

- QoS class selection (Guaranteed vs Burstable)
- Using Goldilocks/VPA for recommendations
- Configuration guidelines and examples
- **Important**: Never set resources below Goldilocks recommendations; always round up to clean values

### Pod Security Standards

All components should be configured with Pod Security Standards set to **restricted** level whenever possible. This ensures the highest level of security by enforcing:

- `runAsNonRoot: true` - Prevents containers from running as root
- `allowPrivilegeEscalation: false` - Blocks privilege escalation
- `seccompProfile.type: RuntimeDefault` - Enables seccomp filtering
- `capabilities.drop: [ALL]` - Drops all Linux capabilities
- `readOnlyRootFilesystem: false` - May be required for applications that need to write temporary files

Only fall back to **baseline** level if the application specifically requires additional privileges. Document the reason when using baseline instead of restricted.

### Gomplate Template Pattern

**Environment Variable Management:**

- Justfile manages environment variables and their default values at the top using `export VAR := env("VAR", "default")`
- Gomplate templates access variables using `{{ .Env.VAR }}`
- **IMPORTANT**: Variables exported at the top of justfile are automatically available to all recipes - do NOT use `export` again inside recipes

**Conditional Rendering Rules:**

- For boolean flags (enabled/disabled features), use simple truthiness check: `{{- if .Env.VAR }}`
- The justfile should set the variable to "true" (or any non-empty value) to enable, or empty string to disable
- **DO NOT use**: `{{- if eq (.Env.VAR | default "false") "true" }}` - this is redundant
- **CORRECT**: `{{- if .Env.VAR }}` - simple and clean

**Example justfile pattern:**

```just
# At the top of justfile - define variables with defaults
export PROMETHEUS_NAMESPACE := env("PROMETHEUS_NAMESPACE", "monitoring")
export GRAFANA_HOST := env("GRAFANA_HOST", "")
export MONITORING_ENABLED := env("MONITORING_ENABLED", "")

# In recipes - use variables directly (already exported at top)
install:
    #!/bin/bash
    set -euo pipefail
    if gum confirm "Enable monitoring?"; then
        MONITORING_ENABLED="true"
    fi
    gomplate -f values.gomplate.yaml -o values.yaml
```

**Example gomplate template:**

```yaml
# values.gomplate.yaml
namespace: {{ .Env.PROMETHEUS_NAMESPACE }}
ingress:
  hosts:
    - {{ .Env.GRAFANA_HOST }}
{{- if eq .Env.MONITORING_ENABLED "true" }}
  monitoring:
    enabled: true
{{- end }}
```

### Prometheus ServiceMonitor Pattern

```just
export MONITORING_ENABLED := env("MONITORING_ENABLED", "")
export PROMETHEUS_NAMESPACE := env("PROMETHEUS_NAMESPACE", "monitoring")

install:
    if helm status kube-prometheus-stack -n ${PROMETHEUS_NAMESPACE} &>/dev/null; then
        if [ -z "${MONITORING_ENABLED}" ]; then
            if gum confirm "Enable Prometheus monitoring?"; then
                MONITORING_ENABLED="true"
            else
                MONITORING_ENABLED="false"
            fi
        fi
    fi
    # ... helm install

    if [ "${MONITORING_ENABLED}" = "true" ]; then
        kubectl label namespace ${NAMESPACE} buun.channel/enable-monitoring=true --overwrite
        gomplate -f servicemonitor.gomplate.yaml | kubectl apply -f -
    fi
```

ServiceMonitor template (`servicemonitor.gomplate.yaml`):

```yaml
{{- if eq .Env.MONITORING_ENABLED "true" }}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-service
  namespace: {{ .Env.NAMESPACE }}
  labels:
    release: kube-prometheus-stack
spec:
  selector:
    matchLabels:
      app: my-service
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
{{- end }}
```

**Requirements:** (1) Namespace label `buun.channel/enable-monitoring=true`, (2) ServiceMonitor label `release=kube-prometheus-stack`, (3) Deploy after helm install.

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

The credential storage approach depends on the type of secret and whether External Secrets Operator is available:

#### Secret Management Rules

1. **Environment File**: Do NOT write to `.env.local` directly for secrets. Use it only for configuration values.

2. **Two Types of Secrets**:

   **Application Secrets** (Metabase, Querybook, Superset, etc.):
   - When External Secrets Operator is available:
     - Store in Vault using `just vault::put`
     - Create ExternalSecret resources to sync from Vault to Kubernetes
     - Let External Secrets Operator create the actual Secret resources
   - When External Secrets Operator is NOT available:
     - Create Kubernetes Secrets directly
     - Do NOT store in Vault (even if Vault is available)

   ```bash
   if helm status external-secrets -n ${EXTERNAL_SECRETS_NAMESPACE} &>/dev/null; then
       # Store in Vault + create ExternalSecret
       just vault::put app/config key="${value}"
       gomplate -f app-external-secret.gomplate.yaml | kubectl apply -f -
   else
       # Create Kubernetes Secret directly (no Vault)
       kubectl create secret generic app-secret --from-literal=key="${value}"
   fi
   ```

   **Core/Admin Credentials** (PostgreSQL superuser, Keycloak admin, MinIO root, etc.):
   - When External Secrets Operator is available:
     - Store in Vault using `just vault::put` or `just vault::put-root`
     - Create ExternalSecret resources
   - When External Secrets Operator is NOT available:
     - Create Kubernetes Secrets directly
     - ALSO store in Vault if Vault is available (as backup)

   ```bash
   if helm status external-secrets -n ${EXTERNAL_SECRETS_NAMESPACE} &>/dev/null; then
       # Store in Vault + create ExternalSecret
       just vault::put-root postgres/admin username=postgres password="${password}"
       gomplate -f postgres-superuser-external-secret.gomplate.yaml | kubectl apply -f -
   else
       # Create Kubernetes Secret directly
       kubectl create secret generic postgres-cluster-superuser \
           --from-literal=username=postgres --from-literal=password="${password}"
       # ALSO store in Vault if available (backup for admin credentials)
       if helm status vault -n ${K8S_VAULT_NAMESPACE} &>/dev/null; then
           just vault::put-root postgres/admin username=postgres password="${password}"
       fi
   fi
   ```

3. **Helm Values Secret References**:
   - When Helm charts support referencing external Secrets (via `existingSecret`, `secretName`, etc.), ALWAYS use this pattern
   - Create the Secret using External Secrets (preferred) or directly as Kubernetes Secret
   - Reference the Secret in Helm values instead of embedding credentials

4. **Keycloak Client Configuration**:
   - Prefer creating Public clients (without client secret) when possible
   - Public clients are suitable for browser-based applications and native apps
   - Only use confidential clients (with secret) when required by the service

5. **Password Generation**:
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

6. **Trino and Lakekeeper Integration**: When setting up Trino with Lakekeeper (Iceberg REST Catalog):
   - The Keycloak client MUST have service accounts enabled for OAuth2 client credentials flow
   - The `lakekeeper` client scope MUST be added to the Trino client
   - An audience mapper MUST be configured to set `aud: lakekeeper` in JWT tokens
   - Trino REQUIRES `fs.native-s3.enabled=true` to handle `s3://` URIs, regardless of vended credentials
   - When `vended-credentials-enabled=false`, static S3 credentials must be provided via environment variables
   - All these configurations are automatically applied by `just trino::install` when MinIO storage is enabled

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
   - **MANDATORY**: Read the complete official values.yaml file BEFORE making any changes
   - **MANDATORY**: Check template files to understand how configuration values are used
   - **MANDATORY**: Look for existing working examples in the official documentation
   - **MANDATORY**: Test each configuration change incrementally, not all at once
   - When external database integration is needed, search for "external", "existing", "secret"
patterns in values.yaml
   - Never assume configuration structure - always verify against official sources
   - If unsure about a configuration, ask the user to provide official documentation links

2. **Debugging Approach**:
   - When Helm deployments fail, ALWAYS check the generated Secret/ConfigMap contents first
   - Compare expected vs actual configuration values using kubectl describe/get
   - Check pod logs and environment variables to understand what the application is actually
receiving
   - Test database connectivity separately before assuming chart configuration issues

3. **Resource Creation Consistency**:
   - When creating Secret/ExternalSecret/ConfigMap resources, follow patterns from existing modules
   - Maintain consistent naming conventions and label structures
   - Use the same YAML formatting and organization as other modules

4. **Core Component Protection**:
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

### Markdown Style

When writing Markdown documentation:

1. **NEVER use ordered lists as section headers**:
   - Ordered lists indent content and are not suitable for headings
   - Use proper heading levels (####) instead of numbered lists for section titles

   ```markdown
   <!-- INCORRECT: Ordered list used as headers -->
   1. **Setup Instructions:**

   Details here...

   2. **Next Step:**

   More details...

   <!-- CORRECT: Use headings instead -->
   #### Setup Instructions

   Details here...

   #### Next Step

   More details...
   ```

2. **Always validate with markdownlint-cli2**:
   - Run `markdownlint-cli2 <file>` before committing any Markdown files
   - Fix all linting errors to ensure consistent formatting
   - Pay attention to code block language specifications (MD040) and list formatting (MD029)
