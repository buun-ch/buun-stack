# Coder

Provisions [Coder](https://github.com/coder/coder) on buun-stack: self-hosted remote development
environments. Workspaces run as Pods in the cluster, so a laptop only needs a terminal and the
`coder` CLI — useful when working away from home over Cloudflare Tunnel.

The control plane (`coderd`) is a single Go binary backed by PostgreSQL. Workspaces are defined as
Terraform templates and provisioned into a separate namespace.

## Prerequisites

- `just postgres::install` — the control plane database
- `just keycloak::install` — only when OIDC is enabled
- Vault — credentials are stored at `coder/database` and `coder/oidc`
- External Secrets Operator (recommended) — syncs those into Kubernetes Secrets
- A DNS/Cloudflare Tunnel hostname pointing at the cluster for `CODER_HOST`
- The `coder` CLI, for `login` and `push-template` only — `install` does not need it. It is
  deliberately left out of `mise.toml` so that a stack without this module stays lean; install it
  on demand at a version matching the server:

  ```bash
  mise use -g coder@2.35.4    # match CODER_CHART_VERSION
  ```

## Usage

```bash
just coder::install                # Namespaces + database + secrets + Helm release
just coder::build-image            # Build and push the workspace image
just coder::create-ducklake-secret # Expose DuckLake credentials to workspaces
just coder::push-template          # Register the Kubernetes workspace template
just coder::login                  # Authenticate the local coder CLI
just coder::show-config            # Show current configuration
just coder::upgrade                # Re-render values and upgrade the release
just coder::uninstall              # Remove everything (database removal is opt-out)
```

## Configuration

| Variable                    | Default            | Description                                       |
| --------------------------- | ------------------ | ------------------------------------------------- |
| `CODER_NAMESPACE`           | `coder`            | Control plane namespace                           |
| `CODER_WORKSPACE_NAMESPACE` | `coder-workspaces` | Namespace for workspace Pods                      |
| `CODER_WORKSPACE_PSS`       | `restricted`       | Pod Security Standard for the workspace namespace |
| `CODER_HOST`                | (prompted)         | Public FQDN                                       |
| `CODER_CHART_VERSION`       | `2.35.4`           | Helm chart version                                |
| `CODER_DB_NAME`             | `coder`            | PostgreSQL database                               |
| `CODER_DB_USER`             | `coder`            | PostgreSQL user                                   |
| `CODER_CPU_REQUEST`         | `100m`             | coderd CPU request                                |
| `CODER_CPU_LIMIT`           | `2`                | coderd CPU limit                                  |
| `CODER_MEMORY_REQUEST`      | `512Mi`            | coderd memory request                             |
| `CODER_MEMORY_LIMIT`        | `2Gi`              | coderd memory limit                               |
| `CODER_OIDC_ENABLED`        | `""`               | Set to `true` to authenticate with Keycloak       |

## First user

**Install with OIDC disabled first.** Coder has no bootstrap account: the first user is created
through the web UI, and enabling OIDC before that leaves no way in.

1. `just coder::install` with `CODER_OIDC_ENABLED` unset
2. Open `https://${CODER_HOST}` and create the owner account with email and password
3. Set `CODER_OIDC_ENABLED=true` and run `just coder::create-keycloak-client`, then
   `just coder::upgrade`
4. **Convert the owner account to OIDC.** Sign in with the password, then:
   account icon (top right) → **Account** → **Security** in the left menu → **Sign in with
   Keycloak** at the bottom of the page → enter the current password under **Confirm your
   password** in the dialog → **Update**.
   (The button carries whatever `CODER_OIDC_SIGN_IN_TEXT` is set to in the values.)
5. Sign out and sign in again with Keycloak

Step 4 is not optional. Coder matches OIDC logins to existing users by email, but it will not
silently change an account's login type — signing in with Keycloak before converting fails with
*"Attempting to use login type 'oidc', but the user has the login type 'password'"*. The account is
found, just not switched.

The email on both sides must match exactly, and Keycloak must report it as verified — Coder
rejects unverified addresses unless `CODER_OIDC_IGNORE_EMAIL_VERIFIED=true` is set. Compare
`coder users list` against the user's **Email** and **Email verified** fields in the Keycloak admin
console (Users → the user) before enabling OIDC. If the addresses differ, a Keycloak sign-in
creates a *second*, non-owner account instead of linking to the existing one.

`CODER_DISABLE_PASSWORD_AUTH=true` can be added to the values afterwards, but keep password login
available until OIDC has been verified — otherwise a broken OIDC configuration locks everyone out.
Note that it also removes the password prompt that the conversion flow above depends on.

## Namespaces and Pod Security Standards

The control plane namespace is `restricted`. The chart runs coderd as non-root with
`allowPrivilegeEscalation: false` and `seccompProfile: RuntimeDefault`, but it does not drop
capabilities, so `coder-values.gomplate.yaml` adds `capabilities.drop: [ALL]` to
`coder.securityContext`. Without it, PodSecurity rejects the Deployment's Pods and the release
never becomes ready.

Workspaces live in their own namespace so their Pod Security Standard can be relaxed without
weakening the control plane. The default is also `restricted`, and the bundled template sets the
container fields required to satisfy it. Workspace images that need `sudo` or runtime package
installation require `CODER_WORKSPACE_PSS=baseline` — re-run `just coder::create-namespace` after
changing it.

## Workspace templates

`templates/kubernetes/` holds the workspace definition, adapted from the upstream Kubernetes
example. Register or update it with:

```bash
just coder::push-template
```

The template takes `namespace`, `image`, `ducklake_secret` and `use_kubeconfig` variables;
`use_kubeconfig` stays `false` because coderd runs in the same cluster and uses its own
ServiceAccount.

Because workspaces run inside the cluster, they can reach `postgres-cluster-rw.postgres` and the
S3 endpoint directly — which is the point of running dbt against DuckLake from a workspace rather
than from a laptop.

## Workspace image

`images/coder-datastack/` builds the default workspace image, which carries `duckdb` (with the
ducklake, postgres and httpfs extensions), `dbt-duckdb`, clients for the buun-stack components
(`psql`, `mc`, `clickhouse-client`, `redis-cli`, `nats`, `vault`), Kubernetes tooling (`kubectl`,
`k9s`, `stern`, `kubectx`, `helm`), `just` and `gomplate` for running buun-stack recipes, and a
Python 3.12 environment with duckdb/pyarrow/polars/ipython.

```bash
just coder::build-image      # builds on ssh://${LOCAL_K8S_HOST}, pushes to localhost:30500
just coder::push-template    # points the template at the new tag
coder update <workspace>     # rebuilds an existing workspace on the new version
```

Versions shared with buun-stack's own `mise.toml` (helm, just, gomplate, vault, uv) are pinned to
the same values so recipes behave identically inside and outside a workspace.

**Nothing may be installed under `/home/coder`.** The template mounts the home PVC there at
runtime, which masks anything baked into that path in the image. Tools live in `/opt/mise`,
`/opt/venv` and `/opt/uv`, and `PATH` is set with `ENV` so it reaches the agent and its children
without relying on shell startup files. The agent's startup script seeds an empty home from
`/etc/skel` and installs the DuckDB extensions, which live under `$HOME` on the PVC.

## DuckLake access from a workspace

```bash
just coder::create-ducklake-secret
```

This syncs Vault's `ducklake/catalog` and `ducklake/storage` into a `ducklake-credentials` Secret
in the workspace namespace, which the template exposes as environment variables
(`DUCKLAKE_CATALOG_*`, `DUCKLAKE_S3_*`, `DUCKLAKE_DATA_PATH`). A dbt profile can then reference
them with `env_var()` instead of storing connection details on disk:

```yaml
      type: duckdb
      path: ":memory:"
      extensions: [ducklake, postgres, httpfs]
      secrets:
        - type: s3
          key_id: "{{ env_var('DUCKLAKE_S3_ACCESS_KEY') }}"
          secret: "{{ env_var('DUCKLAKE_S3_SECRET_KEY') }}"
          endpoint: "{{ env_var('DUCKLAKE_S3_ENDPOINT') | replace('http://', '') }}"
          url_style: path
          use_ssl: false
      attach:
        - path: "ducklake:postgres:host={{ env_var('DUCKLAKE_CATALOG_HOST') }} ..."
          alias: lake
          options:
            data_path: "{{ env_var('DUCKLAKE_DATA_PATH') }}/"
      database: lake
      schema: dbt_demo
```

Two fields deserve attention:

`database: lake` redirects models into the attached DuckLake catalog. Without it dbt-duckdb
derives the database name from `path` and creates every model there instead — **silently**, with
a successful run and no tables in the lake.

`path` is the DuckDB database the adapter itself connects to; DuckLake is attached on top of that
connection. Since every model lands in the lake, `:memory:` is the honest setting: nothing is
written locally, and there is no database file for a second concurrent `dbt` invocation to lock.

> **Caveat for `external` materializations.** dbt-duckdb registers each externally materialized
> file as a view in the *local* database, and those views only get created by the run that writes
> the file. With `path: ":memory:"` they are gone on the next invocation, so running a subset of
> models that reference them fails. If you use external materializations, either point `path` at a
> file under `$HOME` (the PVC — `/tmp` is ephemeral and lost on workspace restart), or register
> them at the start of every run:
>
> ```yaml
> on-run-start:
>   - "{{ register_upstream_external_models() }}"
> ```

## Secrets

| Vault path       | Keys                                      |
| ---------------- | ----------------------------------------- |
| `coder/database` | `username`, `password`, `database`, `url` |
| `coder/oidc`     | `client_id`, `client_secret`              |

With External Secrets Operator present, these are synced to the `coder-db-url` and `coder-oidc`
Secrets. Without it, the Secrets are created directly.

## Notes

- The chart defaults `coder.service.type` to `LoadBalancer`. This module sets `ClusterIP` so that
  k3s ServiceLB does not claim ports 80/443; traffic arrives through the Traefik Ingress.
- `coder.ingress.wildcardHost` is intentionally unset. It only serves workspace apps on
  subdomains and would require wildcard DNS.
- coderd fetches Terraform providers from `registry.terraform.io` when a template is pushed, so
  the cluster needs outbound HTTPS.
- `coder ssh` runs over a WireGuard-based tailnet. Behind Cloudflare Tunnel there is no direct UDP
  path, so traffic is relayed through coderd's embedded DERP server.
