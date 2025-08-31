#!/usr/bin/env tsx

import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

const main = async () => {
    // Environment variables
    const keycloakHost = process.env.KEYCLOAK_HOST;
    const adminUser = process.env.KEYCLOAK_ADMIN_USER;
    const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
    const realm = process.env.KEYCLOAK_REALM;

    invariant(keycloakHost, "KEYCLOAK_HOST is required");
    invariant(adminUser, "KEYCLOAK_ADMIN_USER is required");
    invariant(adminPassword, "KEYCLOAK_ADMIN_PASSWORD is required");
    invariant(realm, "KEYCLOAK_REALM is required");

    console.log(`Checking token settings for realm: ${realm}`);

    // Initialize Keycloak admin client
    const kcAdminClient = new KcAdminClient({
        baseUrl: `https://${keycloakHost}`,
        realmName: "master",
    });

    try {
        // Authenticate
        await kcAdminClient.auth({
            username: adminUser,
            password: adminPassword,
            grantType: "password",
            clientId: "admin-cli",
        });

        console.log("✓ Authenticated with Keycloak admin");

        // Set the target realm
        kcAdminClient.setConfig({ realmName: realm });

        // Get current realm settings
        const currentRealm = await kcAdminClient.realms.findOne({ realm });
        if (!currentRealm) {
            throw new Error(`Realm ${realm} not found`);
        }

        console.log(`\n=== Current Token Settings for Realm: ${realm} ===`);
        console.log(`Access Token Lifespan: ${currentRealm.accessTokenLifespan || 'not set'} seconds (${(currentRealm.accessTokenLifespan || 0)/60} minutes)`);
        console.log(`Access Token Lifespan (Implicit): ${currentRealm.accessTokenLifespanForImplicitFlow || 'not set'} seconds`);
        console.log(`SSO Session Max Lifespan: ${currentRealm.ssoSessionMaxLifespan || 'not set'} seconds (${(currentRealm.ssoSessionMaxLifespan || 0)/60} minutes)`);
        console.log(`SSO Session Idle Timeout: ${currentRealm.ssoSessionIdleTimeout || 'not set'} seconds (${(currentRealm.ssoSessionIdleTimeout || 0)/60} minutes)`);
        console.log(`Client Session Max Lifespan: ${currentRealm.clientSessionMaxLifespan || 'not set'} seconds`);
        console.log(`Client Session Idle Timeout: ${currentRealm.clientSessionIdleTimeout || 'not set'} seconds`);
        console.log(`Offline Session Max Lifespan: ${currentRealm.offlineSessionMaxLifespan || 'not set'} seconds`);
        console.log(`Refresh Token Max Reuse: ${currentRealm.refreshTokenMaxReuse || 0}`);

        // Also check specific client settings if JupyterHub client exists
        try {
            const clients = await kcAdminClient.clients.find({ clientId: 'jupyterhub' });
            if (clients.length > 0) {
                const jupyterhubClient = clients[0];
                console.log(`\n=== JupyterHub Client Settings ===`);
                console.log(`Client ID: ${jupyterhubClient.clientId}`);
                console.log(`Access Token Lifespan: ${jupyterhubClient.attributes?.['access.token.lifespan'] || 'inherit from realm'}`);
            }
        } catch (clientError) {
            console.log(`\n⚠️  Could not retrieve JupyterHub client settings: ${clientError}`);
        }

        console.log(`\n=== Keycloak Default Values (for reference) ===`);
        console.log(`Default Access Token Lifespan: 300 seconds (5 minutes)`);
        console.log(`Default SSO Session Max: 36000 seconds (10 hours)`);
        console.log(`Default SSO Session Idle: 1800 seconds (30 minutes)`);

    } catch (error) {
        console.error("✗ Failed to retrieve realm token settings:", error);
        process.exit(1);
    }
};

main().catch(console.error);