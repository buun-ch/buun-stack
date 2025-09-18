#!/usr/bin/env tsx

import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

async function main() {
  const kcAdminClient = new KcAdminClient({
    baseUrl: `https://${process.env.KEYCLOAK_HOST}`,
    realmName: "master",
  });

  await kcAdminClient.auth({
    username: process.env.KEYCLOAK_ADMIN_USER!,
    password: process.env.KEYCLOAK_ADMIN_PASSWORD!,
    grantType: "password",
    clientId: "admin-cli",
  });

  const realm = process.env.KEYCLOAK_REALM!;
  const clientId = process.env.KEYCLOAK_CLIENT_ID!;
  const claimName = process.env.CLAIM_NAME || "client_roles";

  invariant(realm, "KEYCLOAK_REALM is required");
  invariant(clientId, "KEYCLOAK_CLIENT_ID is required");

  kcAdminClient.setConfig({ realmName: realm });

  try {
    // Find the profile client scope
    const clientScopes = await kcAdminClient.clientScopes.find({ realm });
    const profileScope = clientScopes.find(scope => scope.name === 'profile');

    if (!profileScope) {
      throw new Error("Profile client scope not found");
    }

    console.log(`Found profile scope: ${profileScope.id}`);

    // Check existing mappers in profile scope
    const existingMappers = await kcAdminClient.clientScopes.listProtocolMappers({
      realm,
      id: profileScope.id!,
    });

    console.log("Existing mappers in profile scope:");
    existingMappers.forEach(mapper => {
      console.log(`- ${mapper.name} (${mapper.protocolMapper})`);
    });

    // Check if our client roles mapper already exists in profile scope
    const clientRolesMapper = existingMappers.find(m =>
      m.config?.['usermodel.clientRoleMapping.clientId'] === clientId
    );

    if (clientRolesMapper) {
      console.log(`Client roles mapper already exists in profile scope: ${clientRolesMapper.name}`);
    } else {
      console.log(`Adding ${clientId} client roles mapper to profile scope...`);

      // Add client roles mapper to profile scope
      await kcAdminClient.clientScopes.addProtocolMapper(
        { realm, id: profileScope.id! },
        {
          name: `${clientId} Client Roles`,
          protocol: "openid-connect",
          protocolMapper: "oidc-usermodel-client-role-mapper",
          config: {
            "userinfo.token.claim": "true",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "claim.name": claimName,
            "jsonType.label": "String",
            "multivalued": "true",
            "usermodel.clientRoleMapping.clientId": clientId,
          },
        }
      );

      console.log(`✓ Added ${clientId} client roles mapper to profile scope`);
    }

  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);