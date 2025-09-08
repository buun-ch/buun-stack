"""
Secrets management with user-specific Vault token authentication
"""

from __future__ import annotations

import logging
import os
import warnings
from typing import Any, overload

import hvac

# Suppress SSL warnings for self-signed certificates
warnings.filterwarnings("ignore", message="Unverified HTTPS request")

logger = logging.getLogger("buunstack")
log_level_str = os.getenv("BUUNSTACK_LOG_LEVEL", "warning").upper()
log_level = getattr(logging, log_level_str, logging.WARNING)
logger.setLevel(log_level)

# For Jupyter notebooks, we need to ensure proper logging configuration
# Always add handler if none exists, regardless of conditions
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(log_level)
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    # Disable propagation to avoid root logger interference in notebooks
    logger.propagate = False

    # Debug: Log the handler addition
    if log_level <= logging.DEBUG:
        print(f"DEBUG: Added StreamHandler to buunstack logger (level={log_level})")
        logging.getLogger().setLevel(log_level)

# Additional debug information for troubleshooting
if log_level <= logging.DEBUG:
    print(
        f"DEBUG: buunstack logger initialized - level={logger.level}, handlers={len(logger.handlers)}"
    )


class SecretStore:
    """
    Secure secrets management with JupyterHub API authentication.

    Uses JupyterHub's vault-token API endpoint to obtain Vault tokens
    by exchanging auth_state JWT. Implements singleton pattern for
    consistent state across imports.

    Examples
    --------
    >>> secrets = SecretStore()
    >>> secrets.put('api-keys', openai='sk-123', github='ghp-456')
    >>> openai_key = secrets.get('api-keys', field='openai')
    >>> print(openai_key)
    'sk-123'
    """

    _instance = None
    _initialized = False

    def __new__(cls, *args, **kwargs):
        """Return singleton SecretStore instance."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """
        Initialize SecretStore with JupyterHub API authentication.

        Uses JupyterHub's vault-token API endpoint to exchange
        auth_state JWT for Vault tokens.
        """
        if self._initialized:
            return

        self.username = os.getenv("JUPYTERHUB_USER")
        self.vault_addr = os.getenv("VAULT_ADDR")
        self.base_path = f"jupyter/users/{self.username}"

        # Using pre-acquired Vault token from notebook spawn

        # Initialize Vault client
        self.client = hvac.Client(url=self.vault_addr, verify=False)

        # Attempt authentication
        self._authenticate_vault()

        logger.info(f"SecretStore initialized for user: {self.username}")
        logger.info("Using user-specific Vault token authentication")

        self._initialized = True

    def _authenticate_vault(self):
        """
        Authenticate with Vault using user-specific token from notebook spawn.

        Raises
        ------
        Exception
            If user-specific Vault token is not available.
        """
        vault_token = os.getenv("NOTEBOOK_VAULT_TOKEN")
        if not vault_token:
            raise Exception(
                "No user-specific Vault token available. "
                "Please restart your notebook server."
            )

        self.client.token = vault_token
        logger.info("✅ Using user-specific Vault token from notebook spawn")

    def _ensure_authenticated(self):
        """
        Ensure we have valid Vault authentication with token renewal.
        """
        try:
            if self.client.is_authenticated():
                # Check if token needs renewal (if renewable and close to expiry)
                try:
                    token_info = self.client.auth.token.lookup_self()
                    ttl = token_info.get("data", {}).get("ttl", 0)
                    renewable = token_info.get("data", {}).get("renewable", False)

                    # Renew if TTL < 10 minutes and renewable
                    if renewable and ttl > 0 and ttl < 600:
                        logger.info(f"Renewing Vault token (TTL: {ttl}s)")
                        self.client.auth.token.renew_self()
                        logger.info("✅ Vault token renewed successfully")

                except Exception as e:
                    logger.warning(f"Token renewal check failed: {e}")
                return
        except Exception:
            pass

        # Token expired or invalid - provide helpful error message
        token_ttl = os.getenv("NOTEBOOK_VAULT_TOKEN_TTL", "24h")
        token_max_ttl = os.getenv("NOTEBOOK_VAULT_TOKEN_MAX_TTL", "168h")

        # Try to get token info for more specific error message
        try:
            token_info = self.client.auth.token.lookup_self()
            data = token_info.get("data", {})
            ttl = data.get("ttl", 0)
            renewable = data.get("renewable", False)
            creation_time = data.get("creation_time", 0)

            # Token expired but was renewable - likely hit Max TTL
            if ttl <= 0 and renewable and creation_time:
                import datetime

                created_at = datetime.datetime.fromtimestamp(creation_time)
                age_hours = (
                    datetime.datetime.now() - created_at
                ).total_seconds() / 3600

                error_msg = (
                    f"Vault Token Expired\n\n"
                    f"Your notebook's Vault token has reached its maximum lifetime and cannot be renewed.\n\n"
                    f"Token Details:\n"
                    f"• Created: {created_at.strftime('%Y-%m-%d %H:%M:%S')} ({age_hours:.1f}h ago)\n"
                    f"• TTL (renewal period): {token_ttl}\n"
                    f"• Max TTL (maximum lifetime): {token_max_ttl}\n\n"
                    f"How Token Renewal Works:\n"
                    f"• Your token is automatically renewed every time you use SecretStore\n"
                    f"• Each renewal extends the token for another {token_ttl}\n"
                    f"• However, tokens cannot be renewed beyond {token_max_ttl} from creation\n"
                    f"• Regular usage (within {token_ttl} intervals) keeps your token alive for up to {token_max_ttl}\n\n"
                    f"Solution:\n"
                    f"Please restart your notebook server to get a fresh token with a new {token_max_ttl} lifetime."
                )
            else:
                # Token invalid for other reasons
                error_msg = (
                    "Vault Authentication Failed\n\n"
                    "Your notebook's Vault token is invalid or corrupted.\n\n"
                    "Solution: Please restart your notebook server to get a fresh token."
                )
        except Exception:
            # Cannot get token info - use generic message
            error_msg = (
                f"Vault Authentication Failed\n\n"
                f"Your notebook's Vault token is invalid or has expired.\n\n"
                f"Token Settings:\n"
                f"• TTL (renewal period): {token_ttl}\n"
                f"• Max TTL (maximum lifetime): {token_max_ttl}\n\n"
                f"Tip: Regular usage (within {token_ttl} intervals) keeps your token alive for up to {token_max_ttl}.\n\n"
                f"Solution: Please restart your notebook server to get a fresh token."
            )

        raise Exception(error_msg)

    def put(self, key: str, **kwargs: Any) -> None:
        """
        Store data in your personal secret storage.

        Saves the provided key-value pairs to Vault under the specified key.
        Values must be strings. For complex data types, encode them as JSON strings.

        Parameters
        ----------
        key : Any
            The key/name for the secret. Must be a valid Vault path component.
        **kwargs : str
            Key-value pairs to store as the secret data. All values must be strings.
            For complex types, encode them as JSON strings first.

        Raises
        ------
        ValueError
            If key is empty or contains invalid characters, if no kwargs provided,
            or if any value is not a string.
        ConnectionError
            If unable to connect to Vault server.
        hvac.exceptions.Forbidden
            If authentication fails or insufficient permissions.
        hvac.exceptions.InvalidRequest
            If the data format is invalid.

        Examples
        --------
        >>> import json
        >>> secrets = SecretStore()
        >>> secrets.put('api-keys', openai='sk-123', github='ghp-456')

        >>> # Store complex data as JSON strings
        >>> config_data = {'debug': True, 'max_workers': 4}
        >>> secrets.put('config',
        ...     settings=json.dumps(config_data),
        ...     endpoints=json.dumps(['api.example.com']))
        """
        if not kwargs:
            raise ValueError("At least one key-value pair must be provided")

        # Validate all values are strings
        for field_name, value in kwargs.items():
            if not isinstance(value, str):
                raise ValueError(
                    f"Value for '{field_name}' must be a string. "
                    f"Got {type(value).__name__}. "
                    "For complex types, encode as JSON string first."
                )

        self._ensure_authenticated()

        path = f"{self.base_path}/{key}"
        try:
            self.client.secrets.kv.v2.create_or_update_secret(
                path=path, secret=kwargs, mount_point="secret"
            )
            logger.info(f"Put secret: {key}")
        except Exception as e:
            logger.error(f"Failed to put secret: {e}")
            # Retry once with re-authentication
            self._ensure_authenticated()
            self.client.secrets.kv.v2.create_or_update_secret(
                path=path, secret=kwargs, mount_point="secret"
            )

    @overload
    def get(self, key: str, field: None = None) -> dict[str, Any]: ...

    @overload
    def get(self, key: str, field: str) -> str: ...

    def get(self, key: str, field: str | None = None) -> dict[str, Any] | str:
        """
        Retrieve data from your personal secret storage.

        Loads the data dictionary stored under the specified key from Vault.
        If field is specified, returns only that field's value. Raises KeyError
        if the key doesn't exist or if the specified field is not found.

        Parameters
        ----------
        key : str
            The key/name of the secret to retrieve.
        field : str, optional
            Specific field to retrieve from the secret. If provided, returns
            only the value of this field instead of the entire secret dict.

        Returns
        -------
        dict[str, Any] or str
            - If field is None: The complete stored data dictionary.
            - If field is specified: The value of the specified field.

        Raises
        ------
        KeyError
            If the key doesn't exist or if the specified field is not found.
        ConnectionError
            If unable to connect to Vault server.
        hvac.exceptions.InvalidRequest
            If the key format is invalid.

        Examples
        --------
        >>> secrets = SecretStore()
        >>> # Get entire secret
        >>> api_keys = secrets.get('api-keys')
        >>> if api_keys:
        ...     openai_key = api_keys['openai']
        ...     print(f'OpenAI key: {openai_key}')

        >>> # Get specific field (like vault kv get -field=...)
        >>> openai_key = secrets.get('api-keys', field='openai')
        >>> print(f'OpenAI key: {openai_key}')

        >>> # Handle missing keys or fields
        >>> try:
        ...     config = secrets.get('nonexistent-key')
        ... except KeyError:
        ...     print('Key not found')
        >>> try:
        ...     missing_field = secrets.get('api-keys', field='nonexistent')
        ... except KeyError:
        ...     print('Field not found')
        """
        self._ensure_authenticated()

        path = f"{self.base_path}/{key}"
        try:
            response = self.client.secrets.kv.v2.read_secret_version(
                path=path, mount_point="secret", raise_on_deleted_version=False
            )
            if response and "data" in response and "data" in response["data"]:
                data = response["data"]["data"]
                logger.info(f"Got secret: {key}")

                # Return specific field if requested
                if field is not None:
                    if field not in data:
                        raise KeyError(f"Field '{field}' not found in secret '{key}'")
                    return data[field]

                return data
            else:
                raise KeyError(f"Secret '{key}' not found")
        except Exception as e:
            if "permission denied" in str(e).lower():
                logger.info("Permission denied, re-authenticating...")
                self._ensure_authenticated()
                response = self.client.secrets.kv.v2.read_secret_version(
                    path=path, mount_point="secret", raise_on_deleted_version=False
                )
                if response and "data" in response and "data" in response["data"]:
                    data = response["data"]["data"]
                    if field is not None:
                        if field not in data:
                            raise KeyError(
                                f"Field '{field}' not found in secret '{key}'"
                            )
                        return data[field]
                    return data
                else:
                    raise KeyError(f"Secret '{key}' not found")
            logger.warning(f'Could not get secret "{key}": {e}')
            raise KeyError(f"Secret '{key}' not found") from e

    def delete(self, key: str, field: str | None = None) -> None:
        """
        Delete a secret or a specific field from your personal storage.

        If field is None, permanently removes the entire secret and all its versions.
        If field is specified, removes only that field from the secret.

        Parameters
        ----------
        key : str
            The key/name of the secret to delete or modify.
        field : str, optional
            Specific field to delete from the secret. If None, deletes entire secret.

        Raises
        ------
        KeyError
            If the key or field doesn't exist.
        ConnectionError
            If unable to connect to Vault server.
        hvac.exceptions.Forbidden
            If authentication fails or insufficient permissions.
        hvac.exceptions.InvalidRequest
            If the key format is invalid.

        Examples
        --------
        >>> secrets = SecretStore()
        >>> # Delete entire secret
        >>> secrets.delete('old-api-key')
        >>>
        >>> # Delete only specific field
        >>> secrets.put('credentials', github='token123', aws='secret456')
        >>> secrets.delete('credentials', field='github')
        >>> # Now only 'aws' field remains
        """
        self._ensure_authenticated()

        path = f"{self.base_path}/{key}"

        if field is None:
            # Delete entire secret - first check if it exists
            try:
                # Check if the secret exists first
                response = self.client.secrets.kv.v2.read_secret_version(
                    path=path, mount_point="secret", raise_on_deleted_version=False
                )
                if (
                    not response
                    or "data" not in response
                    or "data" not in response["data"]
                ):
                    raise KeyError(f"Secret '{key}' not found")

                # Now delete it
                self.client.secrets.kv.v2.delete_metadata_and_all_versions(
                    path=path, mount_point="secret"
                )
                logger.info(f"Deleted secret: {key}")
            except KeyError as e:
                logger.error(f"Failed to delete: {e}")
                raise
            except Exception as e:
                # Check if the error is due to the secret not existing
                if "path not found" in str(e).lower() or "not found" in str(e).lower():
                    raise KeyError(f"Secret '{key}' not found") from e
                logger.error(f'Failed to delete secret "{key}": {e}')
                raise
        else:
            # Delete specific field only
            try:
                # First, get the current secret
                response = self.client.secrets.kv.v2.read_secret_version(
                    path=path, mount_point="secret", raise_on_deleted_version=False
                )
                if response and "data" in response and "data" in response["data"]:
                    data = response["data"]["data"]

                    # Check if field exists
                    if field not in data:
                        raise KeyError(f"Field '{field}' not found in secret '{key}'")

                    # Remove the field
                    del data[field]

                    # If no fields remain, delete the entire secret
                    if not data:
                        self.client.secrets.kv.v2.delete_metadata_and_all_versions(
                            path=path, mount_point="secret"
                        )
                        logger.info(f"Deleted secret '{key}' (no fields remaining)")
                    else:
                        # Update the secret without the deleted field
                        self.client.secrets.kv.v2.create_or_update_secret(
                            path=path, secret=data, mount_point="secret"
                        )
                        logger.info(f"Deleted field '{field}' from secret '{key}'")
                else:
                    raise KeyError(f"Secret '{key}' not found")
            except KeyError as e:
                logger.error(f"Failed to delete field: {e}")
                raise
            except Exception as e:
                logger.error(
                    f"Failed to delete field '{field}' from secret '{key}': {e}"
                )
                raise

    def list(self) -> list[str]:
        """
        List all secret keys in your personal storage.

        Returns a list of all secret keys that you have stored in Vault.
        Does not include the actual secret values for security reasons.

        Returns
        -------
        list[str]
            List of secret keys. Empty list if no secrets found or on error.

        Examples
        --------
        >>> secrets = SecretStore()
        >>> keys = secrets.list()
        >>> print(f'You have {len(keys)} secrets: {keys}')
        ['api-keys', 'database-config', 'certificates']
        """
        self._ensure_authenticated()

        try:
            response = self.client.secrets.kv.v2.list_secrets(
                path=self.base_path, mount_point="secret"
            )
            keys = response["data"]["keys"] if response else []
            logger.info(f"Listed {len(keys)} secrets")
            return keys
        except Exception as e:
            # This is expected when no secrets exist yet - just return empty list
            logger.debug(f"No secrets found or error listing: {e}")
            return []

    def list_fields(self, key: str) -> list[str]:
        """
        List all field names in a specific secret.

        Returns a list of all field names (keys) stored in the specified secret.
        Does not include the actual field values for security reasons.

        Parameters
        ----------
        key : str
            The key/name of the secret to list fields for.

        Returns
        -------
        list[str]
            List of field names in the secret. Empty list if the secret doesn't exist.

        Raises
        ------
        KeyError
            If the secret key doesn't exist.
        ConnectionError
            If unable to connect to Vault server.

        Examples
        --------
        >>> secrets = SecretStore()
        >>> secrets.put('api-keys', openai='sk-123', github='ghp-456', azure='az-789')
        >>> fields = secrets.list_fields('api-keys')
        >>> print(f'Fields in api-keys: {fields}')
        ['openai', 'github', 'azure']

        >>> # Check available fields before accessing
        >>> if 'openai' in secrets.list_fields('api-keys'):
        ...     openai_key = secrets.get('api-keys', field='openai')
        """
        self._ensure_authenticated()

        path = f"{self.base_path}/{key}"
        try:
            response = self.client.secrets.kv.v2.read_secret_version(
                path=path, mount_point="secret", raise_on_deleted_version=False
            )
            if response and "data" in response and "data" in response["data"]:
                data = response["data"]["data"]
                fields = list(data.keys())
                logger.info(f"Listed {len(fields)} fields in secret '{key}'")
                return fields
            else:
                raise KeyError(f"Secret '{key}' not found")
        except Exception as e:
            if "permission denied" in str(e).lower():
                logger.info("Permission denied, re-authenticating...")
                self._ensure_authenticated()
                response = self.client.secrets.kv.v2.read_secret_version(
                    path=path, mount_point="secret", raise_on_deleted_version=False
                )
                if response and "data" in response and "data" in response["data"]:
                    data = response["data"]["data"]
                    fields = list(data.keys())
                    logger.info(f"Listed {len(fields)} fields in secret '{key}'")
                    return fields
                else:
                    raise KeyError(f"Secret '{key}' not found")
            logger.warning(f"Could not list fields for secret '{key}': {e}")
            raise KeyError(f"Secret '{key}' not found") from e

    def get_status(self) -> dict[str, Any]:
        """
        Get status information about the SecretStore instance.

        Returns
        -------
        dict[str, Any]
            Status dictionary containing:
            - username: JupyterHub username
            - vault_addr: Vault server address
            - authentication_method: Authentication method used
            - vault_authenticated: Whether Vault client is authenticated

        Examples
        --------
        >>> secrets = SecretStore()
        >>> status = secrets.get_status()
        >>> print(f"User: {status['username']}")
        """
        status = {
            "username": self.username,
            "vault_addr": self.vault_addr,
            "authentication_method": "User-specific Vault token",
        }

        try:
            status["vault_authenticated"] = self.client.is_authenticated()
        except Exception:
            status["vault_authenticated"] = False

        return status


# Utility functions
def get_env_from_secrets(secrets: SecretStore, key: str = "environment") -> list[str]:
    """
    Load environment variables from SecretStore into os.environ.

    Retrieves stored environment variables and sets them in the current
    process's environment. This is useful for loading configuration that
    was previously stored securely.

    Parameters
    ----------
    secrets : SecretStore
        The SecretStore instance to load from.
    key : str, optional
        The key where environment variables are stored, by default "environment".

    Returns
    -------
    list[str]
        List of environment variable names that were loaded and set.
        Empty list if the key doesn't exist or contains no data.

    Examples
    --------
    >>> secrets = SecretStore()
    >>> # First, store some environment variables
    >>> put_env_to_secrets(secrets, {'DEBUG': 'true', 'PORT': '8080'})
    >>> # Later, load them back
    >>> loaded = get_env_from_secrets(secrets)
    >>> print(f'Loaded {len(loaded)} variables: {loaded}')
    ['DEBUG', 'PORT']
    >>> print(os.environ['DEBUG'])  # Now available
    'true'
    """
    env_vars = secrets.get(key)
    if env_vars:
        for name, value in env_vars.items():
            os.environ[name] = str(value)
            logger.info(f"Set environment variable: {name}")
        return list(env_vars.keys())
    return []


def put_env_to_secrets(
    secrets: SecretStore, env_dict: dict, key: str = "environment"
) -> str:
    """
    Store environment variables in SecretStore.

    Saves a dictionary of environment variables to secure storage.
    This is useful for persisting configuration across sessions.

    Parameters
    ----------
    secrets : SecretStore
        The SecretStore instance to save to.
    env_dict : dict[str, Any]
        Dictionary of environment variables to store. Keys should be
        environment variable names, values will be converted to strings.
    key : str, optional
        The key to store environment variables under, by default "environment".

    Returns
    -------
    str
        Full Vault path where the environment variables were stored.

    Examples
    --------
    >>> secrets = SecretStore()
    >>> env_vars = {
    ...     'DATABASE_URL': 'postgresql://localhost:5432/mydb',
    ...     'DEBUG': 'false',
    ...     'MAX_WORKERS': '4'
    ... }
    >>> put_env_to_secrets(secrets, env_vars)
    'jupyter/users/username/environment'

    >>> # Store with custom key
    >>> put_env_to_secrets(secrets, {'API_KEY': 'secret'}, 'production-config')
    'jupyter/users/username/production-config'
    """
    # Convert all values to strings and use **kwargs for put()
    string_env_dict = {k: str(v) for k, v in env_dict.items()}
    secrets.put(key, **string_env_dict)
    logger.info(f"Put {len(env_dict)} environment variables")
    return f"jupyter/users/{secrets.username}/{key}"
