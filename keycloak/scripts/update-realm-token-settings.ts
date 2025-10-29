#!/usr/bin/env tsx

import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

const main = async () => {
  const keycloakHost = process.env.KEYCLOAK_HOST;
  const adminUser = process.env.KEYCLOAK_ADMIN_USER;
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
  const realm = process.env.KEYCLOAK_REALM;
  const accessTokenLifespan = parseInt(process.env.ACCESS_TOKEN_LIFESPAN || "3600");
  const refreshTokenLifespan = parseInt(process.env.REFRESH_TOKEN_LIFESPAN || "1800");

  invariant(keycloakHost, "KEYCLOAK_HOST is required");
  invariant(adminUser, "KEYCLOAK_ADMIN_USER is required");
  invariant(adminPassword, "KEYCLOAK_ADMIN_PASSWORD is required");
  invariant(realm, "KEYCLOAK_REALM is required");

  console.log(`Updating token settings for realm: ${realm}`);
  console.log(
    `Access token lifespan: ${accessTokenLifespan} seconds (${accessTokenLifespan / 60} minutes)`
  );
  console.log(
    `Refresh token lifespan: ${refreshTokenLifespan} seconds (${refreshTokenLifespan / 60} minutes)`
  );

  const kcAdminClient = new KcAdminClient({
    baseUrl: `https://${keycloakHost}`,
    realmName: "master",
  });

  try {
    await kcAdminClient.auth({
      username: adminUser,
      password: adminPassword,
      grantType: "password",
      clientId: "admin-cli",
    });

    console.log("✓ Authenticated with Keycloak admin");

    kcAdminClient.setConfig({ realmName: realm });

    const currentRealm = await kcAdminClient.realms.findOne({ realm });
    if (!currentRealm) {
      throw new Error(`Realm ${realm} not found`);
    }

    console.log(`Current settings:`);
    console.log(`  - Access token lifespan: ${currentRealm.accessTokenLifespan} seconds`);
    console.log(`  - Refresh token lifespan: ${currentRealm.ssoSessionMaxLifespan} seconds`);
    console.log(`  - SSO session idle: ${currentRealm.ssoSessionIdleTimeout} seconds`);

    await kcAdminClient.realms.update(
      { realm },
      {
        ...currentRealm,
        // Access token settings
        accessTokenLifespan: accessTokenLifespan,
        accessTokenLifespanForImplicitFlow: accessTokenLifespan,
        // Refresh token settings
        refreshTokenMaxReuse: 0,
        ssoSessionMaxLifespan: refreshTokenLifespan,
        ssoSessionIdleTimeout: Math.min(refreshTokenLifespan, 1800), // Max 30 minutes idle
        // Other token settings
        offlineSessionMaxLifespan: refreshTokenLifespan * 2,
        offlineSessionMaxLifespanEnabled: true,
        // Client session settings
        clientSessionMaxLifespan: accessTokenLifespan,
        clientSessionIdleTimeout: Math.min(accessTokenLifespan, 1800),
      }
    );

    console.log("✓ Realm token settings updated successfully");

    const updatedRealm = await kcAdminClient.realms.findOne({ realm });
    console.log(`Updated settings:`);
    console.log(`  - Access token lifespan: ${updatedRealm?.accessTokenLifespan} seconds`);
    console.log(`  - Refresh token lifespan: ${updatedRealm?.ssoSessionMaxLifespan} seconds`);
    console.log(`  - SSO session idle: ${updatedRealm?.ssoSessionIdleTimeout} seconds`);
  } catch (error) {
    console.error("✗ Failed to update realm token settings:", error);
    process.exit(1);
  }
};

main().catch(console.error);
