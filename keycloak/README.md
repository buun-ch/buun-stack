# Keycloak

Identity and Access Management (IAM) solution for Kubernetes:

- **Keycloak Operator**: Manages Keycloak instances via CRDs
- **Keycloak**: Open Source Identity and Access Management
- **PostgreSQL Integration**: Uses CloudNativePG cluster for persistence
- **OIDC Provider**: Centralized authentication for all services

## Prerequisites

- Kubernetes cluster (k3s)
- PostgreSQL (CloudNativePG)
- External Secrets Operator (optional, for Vault integration)
- Vault (optional, for credential storage)

## Installation

```bash
just keycloak::install
```

You will be prompted for:

1. **Keycloak admin username**: Default is `admin`
2. **Keycloak admin password**: Auto-generated if not provided
3. **Keycloak host (FQDN)**: e.g., `auth.example.com`

### What Gets Installed

1. Keycloak Operator and CRDs
2. Keycloak instance with PostgreSQL backend
3. Ingress for external access
4. Admin credentials stored in Kubernetes Secret (and optionally Vault)

The stack uses the official [Keycloak Operator](https://www.keycloak.org/operator/installation).

## Pod Security Standards

The keycloak namespace uses **baseline** Pod Security Standard enforcement.

```bash
pod-security.kubernetes.io/enforce=baseline
```

### Why Baseline Instead of Restricted?

The **Keycloak Operator** (provided by upstream) does not meet the `restricted` Pod Security Standard requirements:

- Missing `allowPrivilegeEscalation: false`
- Missing `securityContext.capabilities.drop: [ALL]`
- Missing `runAsNonRoot: true`
- Missing `seccompProfile`

Since the Operator is deployed via official manifests from GitHub, we cannot modify its security context without maintaining a custom fork.

### Security Measures

While using baseline enforcement at the namespace level, the **Keycloak application Pod** applies restricted-level security contexts via `unsupported.podTemplate`:

**Pod Security Context**:

- `runAsNonRoot: true`
- `runAsUser: 1000`
- `runAsGroup: 1000`
- `fsGroup: 1000`
- `seccompProfile.type: RuntimeDefault`

**Container Security Context**:

- `allowPrivilegeEscalation: false`
- `capabilities.drop: [ALL]`
- `runAsNonRoot: true`
- `seccompProfile.type: RuntimeDefault`

**Note**: `readOnlyRootFilesystem: false` is required because Keycloak needs to write configuration files and cache data.

### Baseline vs Restricted

**Baseline** still provides strong security:

- Prohibits privileged containers
- Prohibits `hostNetwork`, `hostPID`, `hostIPC`
- Prohibits `hostPath` volumes
- Restricts dangerous capabilities

The primary difference is that baseline does not enforce seccomp profiles and capability drops, which the Operator lacks but the Keycloak Pod implements.

## Access

Access Keycloak at `https://your-keycloak-host/`

**Admin Credentials**:

- Username: Retrieved via `just keycloak::admin-username`
- Password: Retrieved via `just keycloak::admin-password`

## Configuration

Environment variables (set in `.env.local` or override):

```bash
KEYCLOAK_NAMESPACE=keycloak              # Kubernetes namespace
KEYCLOAK_OPERATOR_VERSION=26.4.5         # Keycloak Operator version
KEYCLOAK_REALM=                          # Default realm name
KEYCLOAK_HOST=                           # Keycloak FQDN
KEYCLOAK_ADMIN_USER=                     # Admin username
KEYCLOAK_ADMIN_PASSWORD=                 # Admin password
```

## Realm Management

### Create Realm

```bash
just keycloak::create-realm
```

You will be prompted for the realm name. This creates a new realm for your applications.

### Delete Realm

```bash
just keycloak::delete-realm <realm-name>
```

## User Management

### Create User

```bash
just keycloak::create-user
```

Interactive prompts for:

- Username
- Email
- First name
- Last name
- Password
- Realm

### Delete User

```bash
just keycloak::delete-user <username>
```

### Add User to Group

```bash
just keycloak::add-user-to-group <username> <group>
```

### List Users

```bash
just keycloak::list-users
```

## Client Management

### Create OIDC Client

```bash
just keycloak::create-client realm=<realm> client_id=<client-id> redirect_url=<url> client_secret=<secret>
```

This creates a confidential OIDC client with the specified settings.

**For public clients** (e.g., browser-based apps):

```bash
just keycloak::create-public-client realm=<realm> client_id=<client-id> redirect_url=<url>
```

### Delete Client

```bash
just keycloak::delete-client <realm> <client-id>
```

### List Clients

```bash
just keycloak::list-clients
```

## Group Management

### Create Group

```bash
just keycloak::create-group <group-name>
```

### Delete Group

```bash
just keycloak::delete-group <group-name>
```

### List Groups

```bash
just keycloak::list-groups
```

## Common Integration Patterns

### OIDC Authentication for Web Applications

1. **Create OIDC client**:

   ```bash
   just keycloak::create-client \
     realm=myrealm \
     client_id=myapp \
     redirect_url=https://myapp.example.com/callback \
     client_secret=$(just utils::random-password)
   ```

2. **Configure your application**:
   - OIDC Discovery URL: `https://your-keycloak-host/realms/myrealm`
   - Client ID: `myapp`
   - Client Secret: (from step 1)
   - Redirect URI: `https://myapp.example.com/callback`

3. **Create user groups for authorization**:

   ```bash
   just keycloak::create-group myapp-admins
   just keycloak::create-group myapp-users
   ```

4. **Add users to groups**:

   ```bash
   just keycloak::add-user-to-group alice myapp-admins
   just keycloak::add-user-to-group bob myapp-users
   ```

### JWT Token Validation

Applications can validate JWT tokens issued by Keycloak using the public keys from:

```
https://your-keycloak-host/realms/myrealm/protocol/openid-connect/certs
```

### Kubernetes OIDC Authentication

To enable OIDC authentication for Kubernetes API:

```bash
just k8s::setup-oidc-auth
```

This configures k3s to use Keycloak for user authentication.

## Monitoring

Enable Prometheus monitoring for Keycloak:

```bash
just keycloak::enable-monitoring
```

This creates a ServiceMonitor that scrapes metrics from Keycloak's management port (9000).

Metrics are automatically renamed from `vendor_*` to `keycloak_*` for better discoverability.

## Troubleshooting

### Check Keycloak Pod Status

```bash
kubectl get pods -n keycloak
```

### View Keycloak Logs

```bash
kubectl logs -n keycloak keycloak-0
```

### Check Database Connection

Verify PostgreSQL connection:

```bash
kubectl get secret database-config -n keycloak -o yaml
```

### Reset Admin Password

```bash
# Delete existing credentials
kubectl delete secret keycloak-credentials -n keycloak
kubectl delete secret keycloak-bootstrap-admin -n keycloak

# Recreate with new password
just keycloak::create-credentials
```

## Management

### Uninstall Keycloak Instance

```bash
just keycloak::uninstall
```

This removes the Keycloak instance but keeps the Operator installed.

To keep the database:

```bash
just keycloak::uninstall delete-db=false
```

### Uninstall Keycloak Operator

```bash
just keycloak::uninstall-operator
```

This removes the Operator and all CRDs.

## References

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Keycloak Operator](https://www.keycloak.org/operator/installation)
- [Keycloak Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api/)
- [OpenID Connect](https://openid.net/connect/)
