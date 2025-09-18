import os
import logging
import json
import base64
import requests
from typing import Dict, Any, Optional
from urllib.parse import urljoin
from flask_appbuilder.security.manager import AUTH_OAUTH
from airflow.providers.fab.auth_manager.security_manager.override import FabAirflowSecurityManagerOverride


log = logging.getLogger(__name__)

AUTH_TYPE = AUTH_OAUTH
AUTH_USER_REGISTRATION = True
AUTH_ROLES_SYNC_AT_LOGIN = True
AUTH_USER_REGISTRATION_ROLE = "Viewer"

# Keycloak OIDC configuration
KEYCLOAK_HOST = "{{ .Env.KEYCLOAK_HOST }}"
KEYCLOAK_REALM = "{{ .Env.KEYCLOAK_REALM }}"
OIDC_ISSUER = f"https://{KEYCLOAK_HOST}/realms/{KEYCLOAK_REALM}"

# OAuth Providers configuration
OAUTH_PROVIDERS = [{
    'name': 'keycloak',
    'icon': 'fa-key',
    'token_key': 'access_token',
    'remote_app': {
        'client_id': os.environ.get('AIRFLOW_OAUTH_CLIENT_ID', ''),
        'client_secret': os.environ.get('AIRFLOW_OAUTH_CLIENT_SECRET', ''),
        'server_metadata_url': f'{OIDC_ISSUER}/.well-known/openid-configuration',
        'api_base_url': f'{OIDC_ISSUER}/protocol/openid-connect',
        'access_token_url': f'{OIDC_ISSUER}/protocol/openid-connect/token',
        'authorize_url': f'{OIDC_ISSUER}/protocol/openid-connect/auth',
        'request_token_url': None,
        'client_kwargs': {
            'scope': 'openid profile email'
        }
    }
}]

# Role mappings from Keycloak to Airflow
AUTH_ROLES_MAPPING = {
    "airflow_admin": ["Admin"],
    "airflow_op": ["Op"],
    "airflow_user": ["User"],
    "airflow_viewer": ["Viewer"]
}

# Use the correct claim name for client roles
AUTH_ROLE_CLAIM = "airflow_roles"

# Security Manager Override
class KeycloakSecurityManager(FabAirflowSecurityManagerOverride):
    """Custom Security Manager for Keycloak integration"""

    def __init__(self, appbuilder):
        super().__init__(appbuilder)

    def get_oauth_user_info(self, provider, response):
        """Extract user info and roles from Keycloak token"""
        if provider == "keycloak":
            import jwt
            import requests

            # Get access token
            token = response.get("access_token")
            if not token:
                log.error("No access token found in OAuth response")
                return None

            try:
                # Get JWKS URL from OpenID configuration
                jwks_url = f"{OIDC_ISSUER}/.well-known/openid-configuration"
                oidc_config = requests.get(jwks_url).json()
                jwks_uri = oidc_config["jwks_uri"]

                # Use PyJWT to decode and verify the token
                from jwt import PyJWKClient
                jwks_client = PyJWKClient(jwks_uri)
                signing_key = jwks_client.get_signing_key_from_jwt(token)

                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=["RS256"],
                    audience=["airflow", "account"],  # Keycloak uses both
                    issuer=OIDC_ISSUER,
                    options={"verify_signature": True, "verify_aud": False}  # Relax audience check
                )

                log.info(f"JWT signature verified successfully")
                log.debug(f"Decoded token payload keys: {list(payload.keys())}")
                log.debug(f"Token has preferred_username: {bool(payload.get('preferred_username'))}")
                log.debug(f"Token has email: {bool(payload.get('email'))}")

                # Extract user information
                userinfo = {
                    "username": payload.get("preferred_username"),
                    "email": payload.get("email"),
                    "first_name": payload.get("given_name"),
                    "last_name": payload.get("family_name"),
                }

                log.debug(f"Extracted userinfo keys: {list(userinfo.keys())}")

                # Extract roles from different possible locations
                roles = []

                # Check realm access roles
                realm_access = payload.get("realm_access", {})
                realm_roles = realm_access.get("roles", [])

                # Check resource access (client roles)
                resource_access = payload.get("resource_access", {})
                client_access = resource_access.get("airflow", {})
                client_roles = client_access.get("roles", [])

                # Check airflow_roles claim directly
                direct_roles = payload.get("airflow_roles", [])

                log.info(f"Realm roles: {realm_roles}")
                log.info(f"Client roles: {client_roles}")
                log.info(f"Direct airflow roles: {direct_roles}")

                # Prefer client roles, then direct roles, then realm roles
                if client_roles:
                    roles = client_roles
                    log.info(f"Using client roles: {roles}")
                elif direct_roles:
                    roles = direct_roles
                    log.info(f"Using direct airflow roles: {roles}")
                elif realm_roles:
                    # Map common realm roles to Airflow roles
                    role_mapping = {
                        'admin': 'Admin',
                        'user': 'User',
                        'viewer': 'Viewer'
                    }
                    roles = [role_mapping.get(role.lower(), 'Viewer') for role in realm_roles]
                    log.info(f"Using mapped realm roles: {roles}")
                else:
                    roles = ['Viewer']
                    log.info("No roles found, defaulting to Viewer")

                userinfo["role_keys"] = roles
                log.info(f"User authentication successful for: {userinfo.get('username', 'unknown')}")
                log.debug(f"Final userinfo keys: {list(userinfo.keys())}")

                return userinfo

            except Exception as e:
                log.error(f"Error decoding JWT token: {e}")

        # Fallback to default behavior
        return super().get_oauth_user_info(provider, response)

SECURITY_MANAGER_CLASS = KeycloakSecurityManager
