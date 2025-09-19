import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

const main = async () => {
  const keycloakHost = process.env.KEYCLOAK_HOST;
  invariant(keycloakHost, "KEYCLOAK_HOST environment variable is required.");

  const adminUsername = process.env.KEYCLOAK_ADMIN_USER;
  invariant(adminUsername, "KEYCLOAK_ADMIN_USER environment variable is required.");

  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
  invariant(adminPassword, "KEYCLOAK_ADMIN_PASSWORD environment variable is required");

  const realmName = process.env.KEYCLOAK_REALM;
  invariant(realmName, "KEYCLOAK_REALM environment variable is required");

  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  invariant(clientId, "KEYCLOAK_CLIENT_ID environment variable is required");

  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

  const redirectUrl = process.env.KEYCLOAK_REDIRECT_URL;
  invariant(redirectUrl, "KEYCLOAK_REDIRECT_URL environment variable is required");

  const redirectUris = redirectUrl.split(',').map(url => url.trim());

  const sessionIdle = process.env.KEYCLOAK_CLIENT_SESSION_IDLE;
  const sessionMax = process.env.KEYCLOAK_CLIENT_SESSION_MAX;
  const directAccessGrants = process.env.KEYCLOAK_CLIENT_DIRECT_ACCESS_GRANTS;
  const pkceMethod = process.env.KEYCLOAK_CLIENT_PKCE_METHOD;

  const kcAdminClient = new KcAdminClient({
    baseUrl: `https://${keycloakHost}`,
    realmName: "master",
  });

  try {
    await kcAdminClient.auth({
      username: adminUsername,
      password: adminPassword,
      grantType: "password",
      clientId: "admin-cli",
    });
    console.log("Authentication successful.");

    kcAdminClient.setConfig({ realmName });

    const existingClients = await kcAdminClient.clients.find({ clientId });
    if (existingClients.length > 0) {
      console.warn(`Client '${clientId}' already exists.`);
      return;
    }

    const isPublicClient = !clientSecret || clientSecret === '';
    const clientConfig: any = {
      clientId: clientId,
      secret: clientSecret,
      enabled: true,
      redirectUris: redirectUris,
      publicClient: isPublicClient,
      directAccessGrantsEnabled: directAccessGrants === 'true',
    };

    // Configure PKCE based on environment variable
    // KEYCLOAK_CLIENT_PKCE_METHOD can be: 'S256', 'plain', or unset/empty (no PKCE)
    clientConfig.attributes = {};

    if (pkceMethod && (pkceMethod === 'S256' || pkceMethod === 'plain')) {
      clientConfig.attributes['pkce.code.challenge.method'] = pkceMethod;
      console.log(`Setting PKCE Code Challenge Method to ${pkceMethod}`);
    } else if (pkceMethod && pkceMethod !== '') {
      console.warn(`Invalid PKCE method '${pkceMethod}'. Valid options: S256, plain, or empty for no PKCE`);
      console.log('Creating client without PKCE');
    } else {
      console.log('Creating client without PKCE');
    }

    // Add session timeout settings if provided
    if (sessionIdle && sessionIdle !== '') {
      clientConfig.attributes['client.session.idle.timeout'] = sessionIdle;
      console.log(`Setting Client Session Idle Timeout: ${sessionIdle}`);
    }

    if (sessionMax && sessionMax !== '') {
      clientConfig.attributes['client.session.max.lifespan'] = sessionMax;
      console.log(`Setting Client Session Max Lifespan: ${sessionMax}`);
    }

    if (directAccessGrants === 'true') {
      console.log('Enabling Direct Access Grants (Resource Owner Password Credentials)');
    }

    const createdClient = await kcAdminClient.clients.create(clientConfig);
    console.log(`Client created successfully with ID: ${createdClient.id}`);
  } catch (error) {
    console.error("An error occurred:", error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
};

main();
