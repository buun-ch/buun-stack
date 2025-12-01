#!/usr/bin/env tsx

import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

const formatDuration = (seconds: number): string => {
  if (seconds >= 86400) {
    return `${seconds}s (${seconds / 86400}d)`;
  } else if (seconds >= 3600) {
    return `${seconds}s (${seconds / 3600}h)`;
  } else {
    return `${seconds}s (${seconds / 60}m)`;
  }
};

const main = async () => {
  const keycloakHost = process.env.KEYCLOAK_HOST;
  const adminUser = process.env.KEYCLOAK_ADMIN_USER;
  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
  const realm = process.env.KEYCLOAK_REALM;

  // Token settings with defaults suitable for development/personal use
  const accessTokenLifespan = parseInt(process.env.ACCESS_TOKEN_LIFESPAN || "43200"); // 12 hours
  const ssoSessionIdleTimeout = parseInt(process.env.SSO_SESSION_IDLE_TIMEOUT || "86400"); // 1 day
  const ssoSessionMaxLifespan = parseInt(process.env.SSO_SESSION_MAX_LIFESPAN || "604800"); // 7 days

  invariant(keycloakHost, "KEYCLOAK_HOST is required");
  invariant(adminUser, "KEYCLOAK_ADMIN_USER is required");
  invariant(adminPassword, "KEYCLOAK_ADMIN_PASSWORD is required");
  invariant(realm, "KEYCLOAK_REALM is required");

  console.log(`Updating token settings for realm: ${realm}`);
  console.log(`  Access Token Lifespan: ${formatDuration(accessTokenLifespan)}`);
  console.log(`  SSO Session Idle Timeout: ${formatDuration(ssoSessionIdleTimeout)}`);
  console.log(`  SSO Session Max Lifespan: ${formatDuration(ssoSessionMaxLifespan)}`);

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
    console.log(`  - Access Token Lifespan: ${formatDuration(currentRealm.accessTokenLifespan || 0)}`);
    console.log(`  - SSO Session Idle Timeout: ${formatDuration(currentRealm.ssoSessionIdleTimeout || 0)}`);
    console.log(`  - SSO Session Max Lifespan: ${formatDuration(currentRealm.ssoSessionMaxLifespan || 0)}`);

    await kcAdminClient.realms.update(
      { realm },
      {
        ...currentRealm,
        // Access token settings
        accessTokenLifespan: accessTokenLifespan,
        accessTokenLifespanForImplicitFlow: accessTokenLifespan,
        // SSO session settings
        ssoSessionIdleTimeout: ssoSessionIdleTimeout,
        ssoSessionMaxLifespan: ssoSessionMaxLifespan,
        // Refresh token settings
        refreshTokenMaxReuse: 0,
        // Offline session settings
        offlineSessionMaxLifespan: ssoSessionMaxLifespan * 2,
        offlineSessionMaxLifespanEnabled: true,
        // Client session settings (inherit from SSO session)
        clientSessionMaxLifespan: ssoSessionMaxLifespan,
        clientSessionIdleTimeout: ssoSessionIdleTimeout,
      }
    );

    console.log("✓ Realm token settings updated successfully");

    const updatedRealm = await kcAdminClient.realms.findOne({ realm });
    console.log(`Updated settings:`);
    console.log(`  - Access Token Lifespan: ${formatDuration(updatedRealm?.accessTokenLifespan || 0)}`);
    console.log(`  - SSO Session Idle Timeout: ${formatDuration(updatedRealm?.ssoSessionIdleTimeout || 0)}`);
    console.log(`  - SSO Session Max Lifespan: ${formatDuration(updatedRealm?.ssoSessionMaxLifespan || 0)}`);
  } catch (error) {
    console.error("✗ Failed to update realm token settings:", error);
    process.exit(1);
  }
};

main().catch(console.error);
