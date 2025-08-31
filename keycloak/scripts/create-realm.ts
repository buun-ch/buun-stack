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

  // Token lifespan settings (with defaults suitable for JupyterHub)
  const accessTokenLifespan = parseInt(process.env.ACCESS_TOKEN_LIFESPAN || "3600"); // 1 hour
  const refreshTokenLifespan = parseInt(process.env.REFRESH_TOKEN_LIFESPAN || "14400"); // 4 hours - changed from 30min
  const ssoSessionMaxLifespan = parseInt(process.env.SSO_SESSION_MAX_LIFESPAN || refreshTokenLifespan.toString()); // Use refreshTokenLifespan
  const ssoSessionIdleTimeout = parseInt(process.env.SSO_SESSION_IDLE_TIMEOUT || "7200"); // 2 hours

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
      ssoSessionMaxLifespan: ssoSessionMaxLifespan,
      ssoSessionIdleTimeout: Math.min(ssoSessionMaxLifespan, ssoSessionIdleTimeout),
      // Refresh token settings
      refreshTokenMaxReuse: 0,
      // Offline session settings
      offlineSessionMaxLifespan: ssoSessionMaxLifespan * 2,
      offlineSessionMaxLifespanEnabled: true,
      // Client session settings
      clientSessionMaxLifespan: accessTokenLifespan,
      clientSessionIdleTimeout: Math.min(accessTokenLifespan, ssoSessionIdleTimeout),
    });
    console.log(`Realm '${realmName}' created successfully with token settings:`);
    console.log(`  - Access Token Lifespan: ${accessTokenLifespan} seconds (${accessTokenLifespan/60} minutes)`);
    console.log(`  - Refresh Token Lifespan: ${refreshTokenLifespan} seconds (${refreshTokenLifespan/60} minutes)`);
    console.log(`  - SSO Session Max: ${ssoSessionMaxLifespan} seconds (${ssoSessionMaxLifespan/60} minutes)`);
    console.log(`  - SSO Session Idle: ${ssoSessionIdleTimeout} seconds (${ssoSessionIdleTimeout/60} minutes)`);
  } catch (error) {
    console.error("An error occurred:", error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
};

main();
