#!/usr/bin/env tsx

import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

async function main() {
  const keycloakHost = process.env.KEYCLOAK_HOST;
  invariant(keycloakHost, "KEYCLOAK_HOST environment variable is required.");

  const adminUsername = process.env.KEYCLOAK_ADMIN_USER;
  invariant(adminUsername, "KEYCLOAK_ADMIN_USER environment variable is required.");

  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
  invariant(adminPassword, "KEYCLOAK_ADMIN_PASSWORD environment variable is required");

  const realmName = process.env.KEYCLOAK_REALM;
  invariant(realmName, "KEYCLOAK_REALM environment variable is required");

  const clientId = process.env.CLIENT_ID;
  invariant(clientId, "CLIENT_ID environment variable is required");

  const mapperName = process.env.MAPPER_NAME || `${clientId} client roles`;
  const claimName = process.env.CLAIM_NAME || "client_roles";

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

    // Set realm to work with
    kcAdminClient.setConfig({
      realmName,
    });

    // Find the client
    const clients = await kcAdminClient.clients.find({ clientId });
    if (clients.length === 0) {
      throw new Error(`Client '${clientId}' not found in realm '${realmName}'`);
    }

    const client = clients[0];
    const clientInternalId = client.id!;

    // Check if the mapper already exists
    const mappers = await kcAdminClient.clients.listProtocolMappers({ id: clientInternalId });
    const existingMapper = mappers.find((mapper) => mapper.name === mapperName);

    if (existingMapper) {
      console.log(`Client roles mapper '${mapperName}' already exists for client '${clientId}'`);
      return;
    }

    // Create the client roles protocol mapper
    await kcAdminClient.clients.addProtocolMapper(
      { id: clientInternalId },
      {
        name: mapperName,
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

    console.log(`✓ Client roles mapper '${mapperName}' created for client '${clientId}' in realm '${realmName}'`);
    console.log(`  Claim name: ${claimName}`);
    console.log(`  Maps client roles from '${clientId}' to JWT token`);
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  }
}

main().catch(console.error);