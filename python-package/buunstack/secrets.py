"""
Secrets management for JupyterHub with Vault backend
"""

import logging
import os
import threading
import warnings
from datetime import datetime, timedelta
from typing import Any, overload

import hvac
import jwt
import requests

# Suppress SSL warnings for self-signed certificates
warnings.filterwarnings("ignore", message="Unverified HTTPS request")

# Set up logging (disabled by default)
logger = logging.getLogger("buunstack")
logger.addHandler(logging.NullHandler())  # Default to no output


class SecretStore:
    """
    Simple secrets management for JupyterHub with Vault backend.

    SecretStore provides a secure interface for managing secrets in JupyterHub
    environments using HashiCorp Vault as the backend storage. It supports
    automatic OIDC token refresh via Keycloak integration and provides both
    manual and background token management options.

    This class implements the singleton pattern to ensure only one instance
    exists per user session, preventing duplicate background refresh threads.

    Attributes
    ----------
    auto_token_refresh : bool
        Whether automatic token refresh is enabled.
    refresh_buffer_seconds : int
        Seconds before token expiry to trigger refresh.
    background_refresh_interval : int
        Seconds between background refresh checks.
    username : str or None
        JupyterHub username from environment.
    vault_addr : str or None
        Vault server address from environment.
    base_path : str
        Base path for user's secrets in Vault.

    Examples
    --------
    >>> secrets = SecretStore()
    >>> secrets.put('api-keys', openai='sk-123', github='ghp-456')
    >>> data = secrets.get('api-keys')
    >>> print(data['openai'])
    'sk-123'
    >>> # Or get specific field directly
    >>> openai_key = secrets.get('api-keys', field='openai')
    >>> print(openai_key)
    'sk-123'
    """

    _instance = None
    _initialized = False

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(
        self,
        auto_token_refresh: bool = True,
        refresh_buffer_seconds: int = 300,
        background_refresh_interval: int = 1800,
    ):
        """
        Initialize SecretStore with authentication and configuration.

        Note: Due to singleton pattern, parameters are only used on the first
        instantiation. Subsequent calls return the existing instance with
        its original configuration.

        Parameters
        ----------
        auto_token_refresh : bool, optional
            Enable automatic token refresh using Keycloak OIDC, by default True.
            Requires KEYCLOAK_HOST, KEYCLOAK_REALM, and JUPYTERHUB_OIDC_REFRESH_TOKEN
            environment variables. Only used on first instantiation.
        refresh_buffer_seconds : int, optional
            Seconds before token expiry to trigger refresh, by default 300.
            Only used when auto_token_refresh is True. Only used on first instantiation.
        background_refresh_interval : int, optional
            Seconds between background refresh checks, by default 1800.
            Only used when background refresh is started. Only used on first instantiation.

        Raises
        ------
        ValueError
            If required environment variables are missing:
            - JUPYTERHUB_USER: JupyterHub username
            - VAULT_ADDR: Vault server address
            - JUPYTERHUB_OIDC_ACCESS_TOKEN: Initial access token
            - KEYCLOAK_HOST, KEYCLOAK_REALM: Required for auto_token_refresh
        ConnectionError
            If unable to connect to Vault server or authenticate.

        Examples
        --------
        >>> # Basic usage with auto-refresh
        >>> secrets = SecretStore()

        >>> # Manual token management
        >>> secrets = SecretStore(auto_token_refresh=False)

        >>> # Custom timing
        >>> secrets = SecretStore(
        ...     refresh_buffer_seconds=600,
        ...     background_refresh_interval=3600
        ... )
        """
        if self._initialized:
            return

        self.auto_token_refresh = auto_token_refresh
        self.refresh_buffer_seconds = refresh_buffer_seconds
        self.background_refresh_interval = background_refresh_interval

        self.username = os.getenv("JUPYTERHUB_USER")
        self.vault_addr = os.getenv("VAULT_ADDR")

        if self.auto_token_refresh:
            self.keycloak_host = os.getenv("KEYCLOAK_HOST")
            self.keycloak_realm = os.getenv("KEYCLOAK_REALM")
            self.keycloak_client_id = os.getenv("KEYCLOAK_CLIENT_ID", "jupyterhub")
            self.refresh_token = os.getenv("JUPYTERHUB_OIDC_REFRESH_TOKEN")

        self.access_token = os.getenv("JUPYTERHUB_OIDC_ACCESS_TOKEN")
        self.token_expiry = (
            self._get_token_expiry(self.access_token) if self.access_token else None
        )

        self.client = hvac.Client(url=self.vault_addr, verify=False)

        self._background_refresher = None

        self._authenticate_vault()

        self.base_path = f"jupyter/users/{self.username}"

        logger.info(f"SecretStore initialized for user: {self.username}")
        logger.info(
            f"Auto token refresh: {'enabled' if self.auto_token_refresh else 'disabled'}"
        )

        if self.auto_token_refresh and self.token_expiry:
            logger.info(f"Token expires at: {self.token_expiry}")

        self._initialized = True

    def _get_token_expiry(self, token: str) -> datetime | None:
        """Extract expiry time from JWT token"""
        if not token:
            return None

        try:
            payload = jwt.decode(token, options={"verify_signature": False})
            exp = payload.get("exp")
            if exp:
                return datetime.fromtimestamp(exp)

            # Fallback to iat + 1 hour
            iat = payload.get("iat")
            if iat:
                return datetime.fromtimestamp(iat + 3600)
        except Exception as e:
            logger.warning(f"Could not decode token expiry: {e}")

        return datetime.now() + timedelta(hours=1)

    def _is_token_valid(self) -> bool:
        """Check if current token is still valid"""
        if not self.auto_token_refresh or not self.token_expiry:
            return True  # Assume valid if refresh is disabled

        time_until_expiry = (self.token_expiry - datetime.now()).total_seconds()
        return time_until_expiry > self.refresh_buffer_seconds

    def _refresh_keycloak_tokens(self) -> bool:
        """Refresh tokens using Keycloak refresh token"""
        if not self.auto_token_refresh:
            return False

        if not self.refresh_token or not self.keycloak_host or not self.keycloak_realm:
            logger.error("Missing refresh token or Keycloak configuration")
            return False

        token_url = f"https://{self.keycloak_host}/realms/{self.keycloak_realm}/protocol/openid-connect/token"

        try:
            logger.info("Refreshing tokens from Keycloak...")
            response = requests.post(
                token_url,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": self.refresh_token,
                    "client_id": self.keycloak_client_id,
                },
                verify=False,
            )

            if response.status_code == 200:
                tokens = response.json()

                # Update tokens
                self.access_token = tokens["access_token"]
                if "refresh_token" in tokens:
                    self.refresh_token = tokens["refresh_token"]

                # Update environment variables
                os.environ["JUPYTERHUB_OIDC_ACCESS_TOKEN"] = self.access_token
                if "refresh_token" in tokens:
                    os.environ["JUPYTERHUB_OIDC_REFRESH_TOKEN"] = self.refresh_token

                # Update token expiry
                self.token_expiry = self._get_token_expiry(self.access_token)

                logger.info("✅ Tokens refreshed successfully")
                return True
            else:
                logger.error(
                    f"Token refresh failed: {response.status_code} - {response.text}"
                )
                return False

        except Exception as e:
            logger.error(f"Exception during token refresh: {e}")
            return False

    def _authenticate_vault(self):
        """Authenticate with Vault using current access token"""
        if not self.access_token:
            raise ValueError("No access token available")

        try:
            self.client.auth.jwt.jwt_login(
                role="jupyter-token", jwt=self.access_token, path="jwt"
            )
            logger.info("✅ Authenticated with Vault successfully")
        except Exception as e:
            logger.error(f"Vault authentication failed: {e}")
            raise

    def _ensure_authenticated(self):
        """Ensure we have valid tokens and Vault authentication"""
        if self.auto_token_refresh and not self._is_token_valid():
            logger.info("Token invalid or expiring soon")

            if self._refresh_keycloak_tokens():
                self._authenticate_vault()
            else:
                raise Exception(
                    "Failed to refresh tokens. Manual re-authentication required."
                )

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

    def delete(self, key: str) -> None:
        """
        Delete a secret from your personal storage.

        Permanently removes the secret and all its versions from Vault.
        This operation cannot be undone.

        Parameters
        ----------
        key : str
            The key/name of the secret to delete.

        Raises
        ------
        ConnectionError
            If unable to connect to Vault server.
        hvac.exceptions.Forbidden
            If authentication fails or insufficient permissions.
        hvac.exceptions.InvalidRequest
            If the key format is invalid.

        Examples
        --------
        >>> secrets = SecretStore()
        >>> secrets.delete('old-api-key')
        >>> # Secret is permanently removed
        """
        self._ensure_authenticated()

        path = f"{self.base_path}/{key}"
        try:
            self.client.secrets.kv.v2.delete_metadata_and_all_versions(
                path=path, mount_point="secret"
            )
            logger.info(f"Deleted secret: {key}")
        except Exception as e:
            logger.error(f'Failed to delete secret "{key}": {e}')
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
            logger.warning(f"Could not list secrets: {e}")
            return []

    def get_status(self) -> dict[str, Any]:
        """
        Get comprehensive status information about the SecretStore instance.

        Returns detailed information about configuration, authentication status,
        token validity, and background refresh status.

        Returns
        -------
        dict[str, Any]
            Status dictionary containing:
            - username: JupyterHub username
            - auto_token_refresh: Whether auto-refresh is enabled
            - has_access_token: Whether access token is available
            - vault_addr: Vault server address
            - has_refresh_token: Whether refresh token is available (if auto_token_refresh=True)
            - keycloak_configured: Whether Keycloak settings are configured (if auto_token_refresh=True)
            - token_expires_at: Token expiration time (if available)
            - token_expires_in_seconds: Seconds until token expires (if available)
            - background_refresher_running: Whether background refresher is active

        Examples
        --------
        >>> secrets = SecretStore()
        >>> status = secrets.get_status()
        >>> print(f"User: {status['username']}")
        >>> print(f"Token expires in: {status.get('token_expires_in_seconds', 'N/A')} seconds")
        """
        status = {
            "username": self.username,
            "auto_token_refresh": self.auto_token_refresh,
            "has_access_token": bool(self.access_token),
            "vault_addr": self.vault_addr,
        }

        if self.auto_token_refresh:
            status.update(
                {
                    "has_refresh_token": bool(self.refresh_token),
                    "keycloak_configured": bool(
                        self.keycloak_host and self.keycloak_realm
                    ),
                }
            )

            if self.token_expiry:
                time_remaining = (self.token_expiry - datetime.now()).total_seconds()
                status.update(
                    {
                        "token_valid": self._is_token_valid(),
                        "token_expiry": self.token_expiry.isoformat(),
                        "seconds_remaining": max(0, time_remaining),
                        "minutes_remaining": max(0, time_remaining / 60),
                    }
                )

        return status

    def start_background_refresh(self) -> "BackgroundRefresher":
        """
        Start automatic background token refreshing.

        Begins a background thread that periodically checks and refreshes
        the access token before it expires. Only available when
        auto_token_refresh is enabled.

        Returns
        -------
        BackgroundRefresher
            The background refresher instance that can be used to monitor
            or control the refresh process.

        Raises
        ------
        ValueError
            If auto_token_refresh is False. Background refresh requires
            automatic token refresh to be enabled.

        Examples
        --------
        >>> secrets = SecretStore(auto_token_refresh=True)
        >>> refresher = secrets.start_background_refresh()
        >>> status = refresher.get_status()
        >>> print(f"Background refresh running: {status['running']}")
        """
        if not self.auto_token_refresh:
            raise ValueError("Background refresh requires auto_token_refresh=True")

        if self._background_refresher is None:
            self._background_refresher = BackgroundRefresher(
                self, interval_seconds=self.background_refresh_interval
            )

        self._background_refresher.start()
        return self._background_refresher

    def stop_background_refresh(self) -> None:
        """
        Stop the background token refresher.

        Stops the background thread that was refreshing tokens automatically.
        It's safe to call this method even if no background refresher is running.

        Examples
        --------
        >>> secrets = SecretStore()
        >>> refresher = secrets.start_background_refresh()
        >>> # ... do some work ...
        >>> secrets.stop_background_refresh()
        """
        if self._background_refresher:
            self._background_refresher.stop()


class BackgroundRefresher:
    """
    Background token refresher for automatic token management.

    This class runs in a separate daemon thread and periodically checks if
    the access token needs to be refreshed, automatically handling the refresh
    process to maintain uninterrupted access to Vault.

    Attributes
    ----------
    secret_store : SecretStore
        The SecretStore instance to refresh tokens for.
    interval_seconds : int
        Seconds between refresh checks.
    refresh_count : int
        Number of successful refreshes performed.
    last_refresh : datetime or None
        Timestamp of the last successful refresh.

    Examples
    --------
    >>> secrets = SecretStore(auto_token_refresh=True)
    >>> refresher = secrets.start_background_refresh()
    >>> # Refresher runs automatically in background
    >>> status = refresher.get_status()
    >>> print(f"Refreshes performed: {status['refresh_count']}")
    """

    def __init__(self, secret_store: SecretStore, interval_seconds: int = 1800):
        """
        Initialize the background refresher.

        Parameters
        ----------
        secret_store : SecretStore
            The SecretStore instance to manage tokens for.
        interval_seconds : int, optional
            Seconds between refresh checks, by default 1800 (30 minutes).
        """
        self.secret_store = secret_store
        self.interval_seconds = interval_seconds
        self._stop_event = threading.Event()
        self._thread = None
        self.refresh_count = 0
        self.last_refresh = None

    def start(self) -> None:
        """
        Start the background refresh thread.

        Creates and starts a daemon thread that will periodically check
        and refresh tokens. Safe to call multiple times.
        """
        if self._thread is None or not self._thread.is_alive():
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._refresh_loop, daemon=True)
            self._thread.start()
            logger.info(
                f"Started background refresher (interval: {self.interval_seconds}s)"
            )

    def stop(self) -> None:
        """
        Stop the background refresh thread.

        Signals the refresh thread to stop and waits up to 5 seconds
        for it to finish gracefully.
        """
        if self._thread and self._thread.is_alive():
            self._stop_event.set()
            self._thread.join(timeout=5)
            logger.info("Stopped background refresher")

    def _refresh_loop(self):
        while not self._stop_event.is_set():
            if self._stop_event.wait(self.interval_seconds):
                break

            try:
                if self.secret_store._refresh_keycloak_tokens():
                    self.secret_store._authenticate_vault()
                    self.refresh_count += 1
                    self.last_refresh = datetime.now()
                    logger.info(
                        f"✅ Background refresh #{self.refresh_count} successful"
                    )
                else:
                    logger.error("❌ Background refresh failed")
            except Exception as e:
                logger.error(f"Exception in background refresh: {e}")

    def get_status(self) -> dict[str, Any]:
        """
        Get the current status of the background refresher.

        Returns
        -------
        dict[str, Any]
            Status dictionary containing:
            - running: Whether the refresh thread is active
            - refresh_count: Number of successful refreshes performed
            - last_refresh: ISO timestamp of last successful refresh (or None)
            - interval_seconds: Configured refresh interval

        Examples
        --------
        >>> refresher = secrets.start_background_refresh()
        >>> status = refresher.get_status()
        >>> print(f"Running: {status['running']}, Count: {status['refresh_count']}")
        """
        return {
            "running": self._thread and self._thread.is_alive(),
            "refresh_count": self.refresh_count,
            "last_refresh": self.last_refresh.isoformat()
            if self.last_refresh
            else None,
            "interval_seconds": self.interval_seconds,
        }


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
    'jupyter/users/username/environment'
    """
    # Convert all values to strings and use **kwargs for put()
    string_env_dict = {k: str(v) for k, v in env_dict.items()}
    secrets.put(key, **string_env_dict)
    logger.info(f"Put {len(env_dict)} environment variables")
    return f"jupyter/users/{secrets.username}/{key}"
