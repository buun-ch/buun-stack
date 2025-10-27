#!/usr/bin/env tsx

import KcAdminClient from '@keycloak/keycloak-admin-client';
import invariant from 'tiny-invariant';

const main = async () => {
    const KEYCLOAK_HOST = process.env.KEYCLOAK_HOST;
    const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER;
    const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD;
    const realm = process.env.KEYCLOAK_REALM;
    const scopeName = process.env.SCOPE_NAME;
    const audience = process.env.KEYCLOAK_AUDIENCE;

    invariant(KEYCLOAK_HOST, 'KEYCLOAK_HOST environment variable is required');
    invariant(KEYCLOAK_ADMIN_USER, 'KEYCLOAK_ADMIN_USER environment variable is required');
    invariant(KEYCLOAK_ADMIN_PASSWORD, 'KEYCLOAK_ADMIN_PASSWORD environment variable is required');
    invariant(realm, 'KEYCLOAK_REALM environment variable is required');
    invariant(scopeName, 'SCOPE_NAME environment variable is required');
    invariant(audience, 'KEYCLOAK_AUDIENCE environment variable is required');

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

        // Find the client scope
        const clientScopes = await kcAdminClient.clientScopes.find();
        const scope = clientScopes.find(s => s.name === scopeName);
        if (!scope) {
            throw new Error(`Client scope '${scopeName}' not found`);
        }

        invariant(scope.id, 'Client scope ID is not set');

        // Check if mapper already exists
        const mapperName = `aud-mapper-${audience}`;
        const existingMappers = await kcAdminClient.clientScopes.listProtocolMappers({ id: scope.id });

        if (existingMappers.some((mapper) => mapper.name === mapperName)) {
            console.warn(`Audience mapper '${mapperName}' already exists in scope '${scopeName}'.`);
            return;
        }

        // Create audience mapper
        const audienceMapper = {
            name: mapperName,
            protocol: 'openid-connect',
            protocolMapper: 'oidc-audience-mapper',
            config: {
                'included.client.audience': audience,
                'id.token.claim': 'false',
                'access.token.claim': 'true',
            },
        };

        await kcAdminClient.clientScopes.addProtocolMapper({ id: scope.id }, audienceMapper);
        console.log(`Audience mapper '${mapperName}' added to client scope '${scopeName}'.`);

    } catch (error) {
        console.error('Error adding audience mapper to scope:', error);
        process.exit(1);
    }
};

main();
