# Trino

Fast distributed SQL query engine for big data analytics with Keycloak authentication.

## Overview

This module deploys Trino using the official Helm chart with:

- **Keycloak OAuth2 authentication** for Web UI access
- **Password authentication** for programmatic clients (Metabase, Querybook, etc.)
- **Access control with user impersonation** for multi-user query attribution
- **PostgreSQL catalog** for querying PostgreSQL databases
- **Iceberg catalog** with Lakekeeper (optional)
- **TPCH catalog** with sample data for testing
- **Traefik integration** with proper header forwarding

## Prerequisites

- Kubernetes cluster (k3s)
- Keycloak installed and configured
- PostgreSQL cluster (CloudNativePG)
- MinIO (optional, for Iceberg catalog storage backend)
- Lakekeeper (optional, required before enabling Iceberg catalog for Trino)
- External Secrets Operator (optional, for Vault integration)

## Installation

### Basic Installation

```bash
just trino::install
```

You will be prompted for:

1. **Trino host (FQDN)**: e.g., `trino.example.com`
2. **PostgreSQL catalog setup**: Recommended for production use
3. **Iceberg catalog setup**: Optional, enables Iceberg REST catalog via Lakekeeper with MinIO storage

### What Gets Installed

- Trino coordinator (1 instance)
- Trino workers (2 instances by default)
- OAuth2 client in Keycloak
- Password authentication for JDBC/Querybook access
- Traefik Middleware for X-Forwarded-* header injection
- Access control with impersonation rules (admin can impersonate any user)
- PostgreSQL catalog (if selected)
- Iceberg catalog with Lakekeeper (if Iceberg catalog selected)
    - Keycloak service account enabled for OAuth2 client credentials flow
    - `lakekeeper` client scope added to Trino client
    - MinIO credentials configured for storage backend
- TPCH catalog with sample data

**Note**: Trino runs HTTP-only internally. HTTPS is provided by Traefik Ingress, which handles TLS termination.

## Configuration

Environment variables (set in `.env.local` or override):

```bash
TRINO_NAMESPACE=trino                   # Kubernetes namespace
TRINO_CHART_VERSION=1.41.0              # Helm chart version
TRINO_IMAGE_TAG=477                     # Trino version
TRINO_COORDINATOR_MEMORY=4Gi            # Coordinator memory
TRINO_COORDINATOR_CPU=2                 # Coordinator CPU
TRINO_WORKER_MEMORY=4Gi                 # Worker memory
TRINO_WORKER_CPU=2                      # Worker CPU
TRINO_WORKER_COUNT=2                    # Number of workers
```

### Memory Configuration

Trino has a three-layer memory architecture that must be properly configured:

#### Memory Layers

1. **Kubernetes Memory** (`TRINO_WORKER_MEMORY`, `TRINO_COORDINATOR_MEMORY`)
   - Physical memory allocated to the pod by Kubernetes
   - Example: `1500Mi`, `2Gi`, `4Gi`
   - This is the total memory limit for the entire container

2. **JVM Heap** (`TRINO_WORKER_JVM_HEAP`, `TRINO_COORDINATOR_JVM_HEAP`)
   - Memory available to the Java process
   - Example: `1500M`, `2G`, `4G`
   - Typically 70-80% of Kubernetes memory
   - Must be less than Kubernetes memory to leave room for off-heap memory

3. **Query Memory Per Node** (currently hardcoded to `1GB`)
   - Memory Trino can use for query execution on each node
   - Configured in `config.properties` as `query.max-memory-per-node`
   - Must be significantly less than JVM heap to allow for heap headroom

#### Memory Relationship

```
Kubernetes Memory (e.g., 1500Mi)
  └─ JVM Heap (e.g., 1500M, ~100%)
      └─ Query Memory (1GB) + Heap Headroom (~365MB)
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         This sum must be less than JVM Heap
```

#### Calculating Memory Requirements

**Rule of thumb:**

- Query Memory + Heap Headroom ≤ JVM Heap
- Heap Headroom is approximately 30% of JVM Heap
- Therefore: Query Memory ≤ 70% of JVM Heap

**Examples:**

| JVM Heap | Max Query Memory | Headroom (~30%) | Total Needed | Status |
|----------|------------------|-----------------|--------------|--------|
| 1000M    | 1000M            | 307M            | 1307M        | ❌ Too small |
| 1200M    | 1000M            | 365M            | 1365M        | ❌ Too small |
| 1500M    | 1000M            | 459M            | 1459M        | ✅ OK |
| 2000M    | 1000M            | 612M            | 1612M        | ✅ OK |

#### Recommended Configurations

**Low-resource environment (limited memory):**

```bash
TRINO_WORKER_COUNT=1
TRINO_WORKER_MEMORY=1500Mi
TRINO_WORKER_JVM_HEAP=1500M
# Query memory: 1GB (hardcoded)
```

**Standard environment:**

```bash
TRINO_WORKER_COUNT=2
TRINO_WORKER_MEMORY=4Gi
TRINO_WORKER_JVM_HEAP=4G
# Query memory: 1GB (hardcoded)
```

**Note:** If you need to adjust query memory per node, you must modify `query.max-memory-per-node` in `trino-values.gomplate.yaml`.

#### Common Memory Errors

**Error: Invalid memory configuration**

```
IllegalArgumentException: Invalid memory configuration.
The sum of max query memory per node (1073741824) and heap headroom (382520525)
cannot be larger than the available heap memory (1275068416)
```

**Cause:** JVM heap is too small for the configured query memory.

**Solution:** Either:

- Increase `TRINO_WORKER_JVM_HEAP` to at least 1500M for 1GB query memory
- Or reduce `query.max-memory-per-node` in the values template (requires code change)

**Error: Pod stuck in Pending state**

```
Warning  FailedScheduling  0/1 nodes are available: 1 Insufficient memory.
```

**Cause:** Kubernetes doesn't have enough memory to schedule the pod.

**Solution:** Either:

- Reduce `TRINO_WORKER_MEMORY` (and correspondingly reduce `TRINO_WORKER_JVM_HEAP`)
- Reduce `TRINO_WORKER_COUNT`
- Free up memory by scaling down other services

## Usage

### Web UI Access

1. Navigate to `https://your-trino-host/`
2. Click "Sign in" to authenticate with Keycloak
3. Execute queries in the Web UI

**Note**: OAuth2 authentication works over HTTP internally. Traefik Ingress provides HTTPS to external users, and Trino processes X-Forwarded headers to generate correct HTTPS redirect URLs for OAuth2 flow.

### Get Admin Password

For JDBC/Metabase connections:

```bash
just trino::admin-password
```

Returns the password for username `admin`.

### Claude Code Integration (MCP)

See [MCP.md](./MCP.md) for detailed instructions on integrating Trino with Claude Code using the mcp-trino MCP server.

### Metabase Integration

Metabase connects to Trino using the JDBC driver (Starburst driver). You must use the external hostname with SSL/TLS for authenticated connections.

#### Connection Configuration

1. In Metabase, go to Admin → Databases → Add database
2. Select **Database type**: Starburst
3. Configure connection:

    ```plain
    Host: your-trino-host (e.g., trino.example.com)
    Port: 443
    Username: admin
    Password: [from just trino::admin-password]
    Catalog: postgresql  (or iceberg for Iceberg tables)
    SSL: Yes
    ```

#### Catalog Selection

- Use `postgresql` to query PostgreSQL database tables
- Use `iceberg` to query Iceberg tables via Lakekeeper
- You can create multiple Metabase connections, one for each catalog

### Querybook Integration

#### Connection Configuration

1. In Querybook, create a new Environment and Query Engine
2. Configure the Trino connection:

    ```plain
    Connection String: trino://your-trino-host:443?SSL=true
    Username: admin
    Password: [from just trino::admin-password]
    Catalog: postgresql  (or iceberg for Iceberg tables)
    ```

3. Optional: Configure `Proxy_user_id` to enable user impersonation

#### User Impersonation

Querybook can execute queries as logged-in users via Trino's impersonation feature. Trino is configured with file-based access control that allows the `admin` user to impersonate any user.

**Benefits:**

- Querybook connects as `admin` but executes queries as the actual logged-in user
- Proper query attribution and audit logging
- User-specific access control (when configured)

The impersonation rules are defined in `trino-values.gomplate.yaml`:

```json
{
  "catalogs": [{"allow": "all"}],
  "impersonation": [
    {
      "original_user": "admin",
      "new_user": ".*"
    }
  ]
}
```

See the [Access Control](#access-control) section for detailed impersonation configuration.

### External Hostname Requirement

Both Metabase and Querybook **require the external hostname with HTTPS** for authenticated connections to Trino. Internal Kubernetes service names will not work.

**Why external hostname is required:**

1. **Client-side HTTPS enforcement**:
   - Metabase JDBC driver enforces HTTPS for authenticated connections
   - Querybook Python Trino client enforces HTTPS when authentication is used
   - Both clients validate SSL/TLS certificates

2. **Trino runs HTTP-only internally**:
   - Trino coordinator listens on HTTP port 8080 inside the cluster
   - No TLS termination within the Trino pods
   - Internal service names (e.g., `trino.trino.svc.cluster.local:8080`) do not provide HTTPS

3. **Traefik provides TLS termination**:
   - External hostname (e.g., `trino.example.com:443`) routes through Traefik Ingress
   - Traefik handles SSL/TLS termination with valid certificates
   - Traefik forwards to Trino's internal HTTP endpoint

**Connection requirements:**

```plain
✅ CORRECT: trino.example.com:443 (HTTPS via Traefik)
❌ WRONG:   trino.trino.svc.cluster.local:8080 (HTTP, no TLS)
```

**Architecture:**

```plain
Client (Metabase/Querybook)
    ↓ HTTPS (port 443)
Traefik Ingress
    ↓ HTTP (port 8080)
Trino Coordinator
```

### Example Queries

**Query TPCH sample data:**

```sql
SELECT * FROM tpch.tiny.customer LIMIT 10;
```

**Query PostgreSQL:**

```sql
SELECT * FROM postgresql.public.pg_tables;
```

**Query Iceberg tables:**

```sql
-- Show schemas in Iceberg catalog
SHOW SCHEMAS FROM iceberg;

-- Show tables in a namespace
SHOW TABLES FROM iceberg.ecommerce;

-- Query Iceberg table
SELECT * FROM iceberg.ecommerce.products LIMIT 10;
```

**Show all catalogs:**

```sql
SHOW CATALOGS;
```

**Show schemas in a catalog:**

```sql
SHOW SCHEMAS FROM postgresql;
SHOW SCHEMAS FROM iceberg;
```

## Catalogs

### TPCH (Always Available)

Sample TPC-H benchmark data for testing:

- `tpch.tiny.*` - Small dataset
- `tpch.sf1.*` - 1GB dataset

Tables: customer, orders, lineitem, part, supplier, nation, region

### PostgreSQL

Queries your CloudNativePG cluster:

- Catalog: `postgresql`
- Default schema: `public`
- Database: `trino`

### Iceberg (Lakekeeper)

Queries Iceberg tables via Lakekeeper REST Catalog:

- **Catalog**: `iceberg`
- **Storage**: MinIO S3-compatible object storage
- **REST Catalog**: Lakekeeper (Apache Iceberg REST Catalog implementation)
- **Authentication**: OAuth2 client credentials flow with Keycloak

#### How It Works

1. Trino authenticates to Lakekeeper using OAuth2 (client credentials flow)
2. Lakekeeper provides Iceberg table metadata from its catalog
3. Trino reads actual data files directly from MinIO using static S3 credentials
4. Vended credentials are disabled; Trino uses pre-configured MinIO access keys

#### Configuration

The following settings are automatically configured when enabling the Iceberg catalog (`just trino::enable-iceberg-catalog`):

- Service account enabled on Trino Keycloak client (for OAuth2 Client Credentials Flow)
- `lakekeeper` Client Scope created in Keycloak with audience mapper
- `lakekeeper` scope added to Trino client as default scope
- Audience mapper in `lakekeeper` scope adds `aud: lakekeeper` to JWT tokens
- S3 file system factory enabled (`fs.native-s3.enabled=true`)
- Static MinIO credentials provided via Kubernetes secrets

#### OAuth2 Scope and Audience

The Iceberg catalog connection to Lakekeeper uses OAuth2 Client Credentials Flow with the following scope configuration:

```properties
iceberg.rest-catalog.oauth2.scope=openid profile lakekeeper
```

#### Purpose of lakekeeper scope

The `lakekeeper` scope controls whether the JWT token includes the audience claim required by Lakekeeper:

1. **Scope-based Control**:
   - The `lakekeeper` Client Scope contains an audience mapper
   - When `scope=lakekeeper` is included in the token request, the mapper is applied
   - Without this scope parameter, the audience claim is not added

2. **Audience Claim**:
   - The audience mapper adds `"aud": "lakekeeper"` to the JWT token
   - This happens only when the `lakekeeper` scope is requested

3. **Token Validation**:
   - Lakekeeper validates incoming JWT tokens and requires `aud` to contain `"lakekeeper"`
   - Tokens without this audience claim are rejected

4. **Security**:
   - Prevents tokens issued for other purposes from accessing Lakekeeper
   - Enforces explicit authorization through scope parameter
   - Defense against token leakage/misuse

#### Authentication Flow

```plain
1. Trino requests token from Keycloak (Client Credentials Flow)
   POST /realms/buunstack/protocol/openid-connect/token
   - client_id: trino
   - client_secret: [from service account]
   - grant_type: client_credentials
   - scope: openid profile lakekeeper

2. Keycloak validates client credentials and generates JWT token
   - Checks that 'lakekeeper' is in the requested scopes
   - Applies the 'lakekeeper' Client Scope
   - Audience mapper (in lakekeeper scope) adds "aud": "lakekeeper" to JWT
   - Includes 'lakekeeper' scope in response

3. Trino sends JWT token to Lakekeeper REST Catalog
   Authorization: Bearer [JWT token]

4. Lakekeeper validates JWT token:
   - Verifies signature using JWKS from Keycloak
   - Checks issuer matches LAKEKEEPER__OPENID_PROVIDER_URI
   - Validates aud claim contains "lakekeeper"
   - Rejects token if audience doesn't match

5. Lakekeeper returns Iceberg table metadata to Trino
```

#### Important Notes

- This OAuth2 authentication is **completely separate** from Trino Web UI OAuth2 authentication
- Web UI OAuth2: User login via browser (Authorization Code Flow)
- Iceberg REST Catalog OAuth2: Service-to-service authentication (Client Credentials Flow)
- The `lakekeeper` scope controls the audience claim:
    - With scope: `scope=openid profile lakekeeper` → JWT includes `"aud": "lakekeeper"`
    - Without scope: `scope=openid profile` → JWT does not include Lakekeeper audience
- The `lakekeeper` scope is only used for Trino→Lakekeeper communication, not for user authentication

#### Example Usage

```sql
-- List all namespaces (schemas)
SHOW SCHEMAS FROM iceberg;

-- Create a namespace
CREATE SCHEMA iceberg.analytics;

-- List tables in a namespace
SHOW TABLES FROM iceberg.ecommerce;

-- Query table
SELECT * FROM iceberg.ecommerce.products LIMIT 10;

-- Create table
CREATE TABLE iceberg.analytics.sales (
    date DATE,
    product VARCHAR,
    amount DECIMAL(10,2)
);
```

## Management

### Upgrade Trino

```bash
just trino::upgrade
```

Updates the Helm deployment with current configuration.

### Uninstall

```bash
# Keep PostgreSQL database
just trino::uninstall false

# Delete PostgreSQL database too
just trino::uninstall true
```

### Cleanup All Resources

```bash
just trino::cleanup
```

Removes:

- PostgreSQL database
- Vault secrets
- Keycloak OAuth client

## Authentication

### Web UI (OAuth2)

- Uses Keycloak for authentication
- Requires valid user in the configured realm
- Automatic redirect to Keycloak login

### JDBC/Metabase/Querybook (Password)

- Username: `admin`
- Password: Retrieved via `just trino::admin-password`
- Stored in Vault at `trino/password`
- Requires external hostname with SSL/TLS

## Access Control

Trino uses file-based system access control managed via Kubernetes ConfigMap. The configuration is defined in Helm values and automatically deployed.

### Configuration Structure

```yaml
accessControl:
  type: configmap              # Store rules in Kubernetes ConfigMap
  refreshPeriod: 60s           # Check for rule changes every 60 seconds
  configFile: "rules.json"     # Rules file name
  rules:
    rules.json: |-
      {
        "catalogs": [
          {
            "allow": "all"     # All users can access all catalogs
          }
        ],
        "impersonation": [
          {
            "original_user": "admin",  # User allowed to impersonate
            "new_user": ".*"           # Regex: can impersonate any user
          }
        ]
      }
```

### Catalog Access

```json
"catalogs": [{"allow": "all"}]
```

- All authenticated users can access all catalogs (postgresql, iceberg, tpch)
- No catalog-level restrictions are enforced
- Can be extended to add user/group-specific catalog access rules

### User Impersonation

```json
"impersonation": [
  {
    "original_user": "admin",
    "new_user": ".*"
  }
]
```

#### What it does

- The `admin` user can execute queries as any other user
- `original_user`: The user performing the impersonation (must be authenticated)
- `new_user`: Regex pattern for allowed target users (`.*` = any user)

#### How it works

1. Client authenticates as `admin` with password
2. Client sends `X-Trino-User: actual_username` header
3. Trino validates impersonation is allowed (admin → actual_username)
4. Query executes with `actual_username` as the principal
5. Audit logs show `actual_username`, not `admin`

#### Example: Querybook Integration

```python
# Querybook connects to Trino
connection = trino.dbapi.connect(
    host="trino.example.com",
    port=443,
    user="admin",           # Authenticate as admin
    http_scheme="https",
    auth=trino.auth.BasicAuthentication("admin", "password")
)

# Execute query as logged-in user
cursor = connection.cursor()
cursor.execute("SELECT * FROM iceberg.sales",
               http_headers={"X-Trino-User": "alice@example.com"})
```

Result: Query runs as `alice@example.com`, appears in Trino logs as executed by `alice@example.com`.

**Use Cases:**

- **Querybook/BI Tools**: Single admin connection, multi-user attribution
- **Audit Logging**: Track which user executed which queries
- **Future Access Control**: Enable per-user data access policies
- **Query Attribution**: Correct usage statistics per user

**Security Considerations:**

- Only the `admin` user can impersonate others
- Regular users cannot impersonate anyone
- Impersonation targets can be restricted with specific regex patterns (e.g., `"new_user": ".*@company\\.com"`)
- Consider adding group-based impersonation rules for finer control

### Configuration Management

- **Storage**: Rules stored in ConfigMap `trino-coordinator-access-control`
- **Refresh**: Trino checks for changes every 60 seconds (no pod restart required)
- **Location**: Mounted at `/etc/trino/access-control/rules.json` in coordinator pod
- **Updates**: Modify Helm values and run `just trino::upgrade` to update rules

### Verify Configuration

```bash
# View current access control rules
kubectl exec -n trino deployment/trino-coordinator -- \
  cat /etc/trino/access-control/rules.json

# Check ConfigMap
kubectl get configmap trino-coordinator-access-control -n trino -o yaml
```

## Architecture

```plain
External Users / Querybook
      ↓
Cloudflare Tunnel (HTTPS)
      ↓
Traefik Ingress (HTTPS → HTTP)
      ├─ TLS Termination
      ├─ Traefik Middleware (X-Forwarded-* headers)
      └─ Backend: HTTP (port 8080)
      ↓
Trino Coordinator (HTTP:8080)
      ├─ OAuth2 → Keycloak (Web UI auth)
      ├─ Password file (JDBC/Querybook auth)
      └─ Access Control (file-based, impersonation rules)
      ↓
Trino Workers (HTTP:8080)
      ↓
Data Sources:
  - PostgreSQL (CloudNativePG)
    └─ Direct SQL connection

  - Iceberg Tables
    ├─ Metadata: Lakekeeper (REST Catalog)
    │   └─ OAuth2 → Keycloak (client credentials)
    └─ Data: MinIO (S3)
        └─ Static credentials
```

### Key Components

- **TLS Termination**: Traefik Ingress handles HTTPS, Trino runs HTTP-only internally
- **Traefik Middleware**: Injects X-Forwarded-Proto, X-Forwarded-Host, X-Forwarded-Port headers for correct URL generation
- **Single Port Configuration**: HTTP (8080) for all communication (Ingress backend, internal clients, Querybook)
- **Access Control**: File-based system with impersonation rules allowing `admin` to impersonate any user
- **Querybook Integration**: Connects via external HTTPS hostname (Traefik provides TLS), uses admin credentials with user impersonation

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n trino
```

### View Coordinator Logs

```bash
kubectl logs -n trino -l app.kubernetes.io/component=coordinator --tail=100
```

### View Worker Logs

```bash
kubectl logs -n trino -l app.kubernetes.io/component=worker --tail=100
```

### Test Authentication

```bash
# From inside coordinator pod
kubectl exec -n trino deployment/trino-coordinator -- \
  curl -u admin:PASSWORD http://localhost:8080/v1/info
```

### Common Issues

#### Querybook Connection Fails

- **Error: "cannot use authentication with HTTP"**
    - Python Trino client requires HTTPS when using authentication (client-side enforcement)
    - Trino runs HTTP-only internally; TLS is provided by Traefik Ingress at the external hostname
    - Solution: Use external hostname with SSL: `trino://your-trino-host:443?SSL=true`
    - Do NOT use internal service names (e.g., `trino.trino.svc.cluster.local:8080`) as they lack TLS

- **Error: "Access Denied: User admin cannot impersonate user X"**
    - Access control rules may not be properly configured
    - Verify rules exist: `kubectl exec -n trino deployment/trino-coordinator -- cat /etc/trino/access-control/rules.json`
    - Check for impersonation section in rules

- **Error: "500 Internal Server Error"**
    - Check Traefik middleware exists: `kubectl get middleware trino-headers -n trino`
    - Verify Ingress annotation references correct middleware: `trino-trino-headers@kubernetescrd`
    - Check Traefik logs: `kubectl logs -n kube-system -l app.kubernetes.io/name=traefik`
    - Verify Ingress backend port is 8080: `kubectl get ingress trino-coordinator -n trino -o yaml | grep "number:"`
    - If Ingress shows port 8443, ensure `server.config.https.enabled: false` in values (Helm chart v1.41.0 auto-selects HTTPS port when enabled)

#### Metabase Sync Fails

- Ensure catalog is specified in connection settings (e.g., `postgresql` or `iceberg`)
- For Iceberg catalog, verify Lakekeeper is running: `kubectl get pods -n lakekeeper`
- Check Trino coordinator logs for errors
- Verify PostgreSQL/Iceberg connectivity
- For Iceberg issues, check OAuth2 token: Service account should be enabled on Trino client

#### OAuth2 Login Fails

- Verify Keycloak OAuth client exists: `just keycloak::list-clients`
- Check redirect URL matches Trino host
- Ensure Keycloak is accessible from Trino pods

#### Password Authentication Fails

- Retrieve current password: `just trino::admin-password`
- Ensure SSL/TLS is enabled in JDBC URL (use external hostname with port 443)
- Python Trino client requires HTTPS for authentication (client-side enforcement)
- Trino coordinator allows password auth over HTTP via `http-server.authentication.allow-insecure-over-http=true`, but clients may refuse to connect without TLS

#### URLs Contain "localhost" Instead of Actual Hostname

- Traefik middleware is not injecting X-Forwarded headers
- Verify middleware exists and is referenced in Ingress annotations
- Check `http-server.process-forwarded=true` is set in Trino configuration

## References

- [Trino Documentation](https://trino.io/docs/current/)
- [Trino Helm Chart](https://github.com/trinodb/charts)
- [OAuth2 Authentication](https://trino.io/docs/current/security/oauth2.html)
- [Password Authentication](https://trino.io/docs/current/security/password-file.html)
- [PostgreSQL Connector](https://trino.io/docs/current/connector/postgresql.html)
- [Iceberg Connector](https://trino.io/docs/current/connector/iceberg.html)
- [Lakekeeper (Iceberg REST Catalog)](https://lakekeeper.io/)
- [Apache Iceberg](https://iceberg.apache.org/)
