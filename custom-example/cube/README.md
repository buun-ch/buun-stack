# Cube.dev Setup

Cube.dev universal semantic layer with Cubestore cache engine.

## Prerequisites

- Keycloak installed and configured
- `oauth2c` tool available via mise
- PostgreSQL or other data source for Cube.dev

## Setup

1. **Configure environment variables**:

   ```bash
   # Required for Ingress
   export CUBE_HOST=cube.your-domain.com

   # Optional: Customize storage and callback port
   export CUBE_STORAGE_SIZE=2Gi
   export CUBE_OIDC_CALLBACK_PORT=9877
   ```

2. **Create Keycloak client**:

   ```bash
   just cube::create-keycloak-client
   ```

3. **Install Cube.dev and Cubestore**:

   ```bash
   just cube::install
   ```

4. **Access Cube Playground**:

   ```bash
   # Via Ingress (if CUBE_HOST is set)
   open https://${CUBE_HOST}

   # Via port-forward (for local development)
   just cube::port-forward
   ```

5. **Get JWT token for authentication**:

   ```bash
   just cube::show-token
   ```

## Authentication Flow

1. Run `just cube::get-token` to authenticate with Keycloak via browser
2. Copy the JWT token to Cube Playground
3. Use the token in Playground > Add Security Context > Token tab

## Architecture

```
Frontend App → Keycloak (OIDC) → JWT Token → Cube.dev API
                                     ↓
                                Cubestore Cache
                                     ↓
                              Data Warehouse
```

## Configuration

- **Namespace**: `cube`
- **Keycloak OIDC Client**: `cube-cli` (public client)
- **JWT Verification**: Uses Keycloak JWKS endpoint
- **Cache**: Cubestore cluster with 2 workers
- **OAuth2c Callback Port**: `9876` (customizable via `CUBE_OIDC_CALLBACK_PORT`)
- **Ingress**: Automatically enabled when `CUBE_HOST` is set
- **Persistent Storage**: `1Gi` PVC for schema files and configuration (customizable via `CUBE_STORAGE_SIZE`)

## Commands

- `just cube::install` - Install Cube.dev and Cubestore
- `just cube::get-token` - Get JWT token via oauth2c
- `just cube::show-token` - Display token for Playground
- `just cube::port-forward` - Access Playground (localhost:4000)
- `just cube::status` - Check installation status
- `just cube::logs` - View Cube.dev logs
- `just cube::test-api` - Test API connection
- `just cube::uninstall` - Remove everything

## Data Sources Configuration

### Option 1: Playground Setup Wizard (Recommended)

1. Access Cube Playground and follow the Setup Wizard
2. Select your database type (PostgreSQL, MySQL, BigQuery, etc.)
3. Enter connection details
4. Test connection and auto-generate schema

### Option 2: Environment Variables

Edit `cube-values.gomplate.yaml` or use kubectl:

```bash
kubectl create configmap cube-db-config -n cube \
  --from-literal=CUBEJS_DB_TYPE=postgres \
  --from-literal=CUBEJS_DB_HOST=your-host \
  --from-literal=CUBEJS_DB_NAME=your-database

kubectl create secret generic cube-db-secret -n cube \
  --from-literal=CUBEJS_DB_USER=your-user \
  --from-literal=CUBEJS_DB_PASS=your-password
```

### Option 3: Multiple Data Sources

Use `cube.js` configuration file for advanced setups with multiple databases.

## Persistent Storage

The PVC stores:

- **Schema files**: Generated data models from Setup Wizard
- **Configuration files**: `cube.js`, custom settings
- **Custom schemas**: Hand-written data models
- **Cache metadata**: Query optimization data

Storage is mounted at `/cube/conf` and persists across pod restarts.

## Security Context

JWT tokens are verified using Keycloak's JWKS endpoint. The security context includes:

- `sub` - User ID
- `realm_access.roles` - User roles
- `email` - User email
- Custom claims as configured in Keycloak
