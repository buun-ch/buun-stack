# JupyterHub pre_spawn_hook
# Sets up user environment and creates user-specific Vault tokens

import hvac
import os

{{- if eq .Env.JUPYTERHUB_VAULT_INTEGRATION_ENABLED "true" }}
def get_vault_token():
    """Read Vault token from file"""
    token_file = '/vault/secrets/vault-token'
    try:
        with open(token_file, 'r') as f:
            token = f.read().strip()
            if token:
                return token
    except FileNotFoundError:
        print(f"Token file not found: {token_file}")
    except Exception as e:
        print(f"Error reading token file {token_file}: {e}")

    return None
{{- end }}

async def pre_spawn_hook(spawner):
    """Set essential environment variables for spawned containers"""
    # PostgreSQL configuration
    spawner.environment["POSTGRES_HOST"] = "postgres-cluster-rw.postgres"
    spawner.environment["POSTGRES_PORT"] = "5432"

    # JupyterHub API configuration
    spawner.environment["JUPYTERHUB_API_URL"] = "http://hub:8081/hub/api"

    # Logging configuration
    spawner.environment["BUUNSTACK_LOG_LEVEL"] = "{{ .Env.JUPYTER_BUUNSTACK_LOG_LEVEL }}"

    {{- if eq .Env.JUPYTERHUB_VAULT_INTEGRATION_ENABLED "true" }}
    # Create user-specific Vault token directly
    try:
        username = spawner.user.name

        # Step 1: Initialize admin Vault client with file-based token
        vault_addr = os.environ.get("VAULT_ADDR", "{{ .Env.VAULT_ADDR }}")
        vault_token = get_vault_token()

        spawner.log.info(f"pre_spawn_hook starting for {username}")
        spawner.log.info(f"Vault address: {vault_addr}")
        spawner.log.info(f"Vault token source: {'file' if os.path.exists('/vault/secrets/vault-token') else 'env'}")
        spawner.log.info(f"Vault token present: {bool(vault_token)}, length: {len(vault_token) if vault_token else 0}")

        if not vault_token:
            raise Exception("No Vault token available from file or environment")

        vault_client = hvac.Client(url=vault_addr, verify=False)
        vault_client.token = vault_token

        if not vault_client.is_authenticated():
            raise Exception("Admin token is not authenticated")

        # Step 2: Create user-specific policy
        user_policy_name = "jupyter-user-{}".format(username)

        # Read policy template from file
        policy_template_path = "/srv/jupyterhub/user_policy.hcl"
        with open(policy_template_path, 'r') as f:
            policy_template = f.read()

        # Replace {username} placeholder with actual username
        user_policy = policy_template.replace("{username}", username)

        # Write user-specific policy
        try:
            vault_client.sys.create_or_update_policy(user_policy_name, user_policy)
            spawner.log.info("✅ Created policy: {}".format(user_policy_name))
        except Exception as policy_e:
            spawner.log.warning("Policy creation failed (may already exist): {}".format(policy_e))

        # Step 3: Create user-specific token
        # Get TTL settings from environment variables
        user_token_ttl = os.environ.get("NOTEBOOK_VAULT_TOKEN_TTL", "24h")
        user_token_max_ttl = os.environ.get("NOTEBOOK_VAULT_TOKEN_MAX_TTL", "168h")

        token_response = vault_client.auth.token.create_orphan(
            policies=[user_policy_name],
            ttl=user_token_ttl,
            renewable=True,
            display_name="notebook-{}".format(username),
            explicit_max_ttl=user_token_max_ttl
        )

        user_vault_token = token_response["auth"]["client_token"]
        lease_duration = token_response["auth"].get("lease_duration", 3600)

        # Set user-specific Vault token as environment variable
        spawner.environment["NOTEBOOK_VAULT_TOKEN"] = user_vault_token

        spawner.log.info("✅ User-specific Vault token created for {} (TTL: {}s, renewable, max TTL: {})".format(username, lease_duration, user_token_max_ttl))

    except Exception as e:
        spawner.log.error("Failed to create user-specific Vault token for {}: {}".format(spawner.user.name, e))
        import traceback
        spawner.log.error("Full traceback: {}".format(traceback.format_exc()))
    {{- end }}

# Set the hook
c.KubeSpawner.pre_spawn_hook = pre_spawn_hook