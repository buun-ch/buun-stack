#!/usr/bin/env tsx

import KcAdminClient from '@keycloak/keycloak-admin-client';
import invariant from 'tiny-invariant';

const main = async () => {
    const KEYCLOAK_HOST = process.env.KEYCLOAK_HOST;
    const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER;
    const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD;
    const realm = process.env.KEYCLOAK_REALM;
    const clientId = process.env.KEYCLOAK_CLIENT_ID;
    const scopeName = process.env.SCOPE_NAME;

    invariant(KEYCLOAK_HOST, 'KEYCLOAK_HOST environment variable is required');
    invariant(KEYCLOAK_ADMIN_USER, 'KEYCLOAK_ADMIN_USER environment variable is required');
    invariant(KEYCLOAK_ADMIN_PASSWORD, 'KEYCLOAK_ADMIN_PASSWORD environment variable is required');
    invariant(realm, 'KEYCLOAK_REALM environment variable is required');
    invariant(clientId, 'KEYCLOAK_CLIENT_ID environment variable is required');
    invariant(scopeName, 'SCOPE_NAME environment variable is required');

    const kcAdminClient = new KcAdminClient({
        baseUrl: `https://${KEYCLOAK_HOST}`,
        realmName: 'master',
    });

    try {
        await kcAdminClient.auth({
            username: KEYCLOAK_ADMIN_USER,
            password: KEYCLOAK_ADMIN_PASSWORD,
            grantType: 'password',
            clientId: 'admin-cli',
        });

        console.log('Authentication successful.');

        // Set target realm
        kcAdminClient.setConfig({
            realmName: realm,
        });

        // Find the client
        const clients = await kcAdminClient.clients.find({ clientId });
        if (clients.length === 0) {
            throw new Error(`Client '${clientId}' not found`);
        }
        const client = clients[0];

        // Find the client scope
        const clientScopes = await kcAdminClient.clientScopes.find();
        const scope = clientScopes.find(s => s.name === scopeName);
        if (!scope) {
            throw new Error(`Client scope '${scopeName}' not found`);
        }

        // Add scope to client as default scope
        await kcAdminClient.clients.addDefaultClientScope({
            id: client.id!,
            clientScopeId: scope.id!,
        });

        console.log(`Client scope '${scopeName}' added to client '${clientId}' as default scope.`);

    } catch (error) {
        console.error('Error adding scope to client:', error);
        process.exit(1);
    }
};

main();