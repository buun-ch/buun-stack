"""
Keycloak OIDC authentication backend for Querybook
"""
from app.auth.oauth_auth import OAuthLoginManager, OAUTH_CALLBACK_PATH
from env import QuerybookSettings


class KeycloakLoginManager(OAuthLoginManager):
    @property
    def oauth_config(self):
        return {
            "callback_url": "{}{}".format(
                QuerybookSettings.PUBLIC_URL, OAUTH_CALLBACK_PATH
            ),
            "client_id": QuerybookSettings.OAUTH_CLIENT_ID,
            "client_secret": QuerybookSettings.OAUTH_CLIENT_SECRET,
            "authorization_url": QuerybookSettings.OAUTH_AUTHORIZATION_URL,
            "token_url": QuerybookSettings.OAUTH_TOKEN_URL,
            "profile_url": QuerybookSettings.OAUTH_USER_PROFILE,
            "scope": ["openid", "email", "profile"],
        }

    def _parse_user_profile(self, resp):
        """Parse standard OIDC UserInfo response from Keycloak"""
        user = resp.json()
        # Keycloak returns standard OIDC claims:
        # - preferred_username: username
        # - email: email address
        # - name: full name (optional)
        username = user.get("preferred_username") or user.get("email", "").split("@")[0]
        email = user.get("email", "")
        fullname = user.get("name", username)
        return username, email, fullname


login_manager = KeycloakLoginManager()

ignore_paths = [OAUTH_CALLBACK_PATH]


def init_app(app):
    login_manager.init_app(app)


def login(request):
    return login_manager.login(request)
