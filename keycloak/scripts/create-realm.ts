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

  // Token lifespan settings (with defaults suitable for development/personal use)
  const accessTokenLifespan = parseInt(process.env.ACCESS_TOKEN_LIFESPAN || "43200"); // 12 hours
  const ssoSessionIdleTimeout = parseInt(process.env.SSO_SESSION_IDLE_TIMEOUT || "86400"); // 1 day
  const ssoSessionMaxLifespan = parseInt(process.env.SSO_SESSION_MAX_LIFESPAN || "604800"); // 7 days

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

    const existingRealms = await kcAdminClient.realms.find();
    const realmExists = existingRealms.some((realm) => realm.realm === realmName);
    if (realmExists) {
      console.warn(`Realm '${realmName}' already exists.`);
      return;
    }

    await kcAdminClient.realms.create({
      realm: realmName,
      enabled: true,
      // Token lifespan settings
      accessTokenLifespan: accessTokenLifespan,
      accessTokenLifespanForImplicitFlow: accessTokenLifespan,
      // SSO session settings
      ssoSessionMaxLifespan: ssoSessionMaxLifespan,
      ssoSessionIdleTimeout: ssoSessionIdleTimeout,
      // Refresh token settings
      refreshTokenMaxReuse: 0,
      // Offline session settings
      offlineSessionMaxLifespan: ssoSessionMaxLifespan * 2,
      offlineSessionMaxLifespanEnabled: true,
      // Client session settings (inherit from SSO session)
      clientSessionMaxLifespan: ssoSessionMaxLifespan,
      clientSessionIdleTimeout: ssoSessionIdleTimeout,
    });
    console.log(`Realm '${realmName}' created successfully with token settings:`);
    console.log(
      `  - Access Token Lifespan: ${accessTokenLifespan}s (${accessTokenLifespan / 3600}h)`
    );
    console.log(
      `  - SSO Session Idle Timeout: ${ssoSessionIdleTimeout}s (${ssoSessionIdleTimeout / 3600}h)`
    );
    console.log(
      `  - SSO Session Max Lifespan: ${ssoSessionMaxLifespan}s (${ssoSessionMaxLifespan / 86400}d)`
    );
  } catch (error) {
    console.error("An error occurred:", error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
};

main();
