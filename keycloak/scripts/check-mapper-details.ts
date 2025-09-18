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

  invariant(realm, "KEYCLOAK_REALM is required");
  invariant(clientId, "KEYCLOAK_CLIENT_ID is required");

  try {
    // Find the client
    const clients = await kcAdminClient.clients.find({ realm, clientId });
    if (clients.length === 0) {
      throw new Error(`Client '${clientId}' not found in realm '${realm}'`);
    }

    const client = clients[0];

    // Get all protocol mappers with full details
    const mappers = await kcAdminClient.clients.listProtocolMappers({
      realm,
      id: client.id!,
    });

    console.log(`=== All Protocol Mappers for client '${clientId}' ===`);
    mappers.forEach((mapper, index) => {
      console.log(`\n${index + 1}. ${mapper.name}`);
      console.log(`   Protocol: ${mapper.protocol}`);
      console.log(`   Type: ${mapper.protocolMapper}`);
      console.log(`   Config:`);
      if (mapper.config) {
        Object.entries(mapper.config).forEach(([key, value]) => {
          console.log(`     ${key}: ${value}`);
        });
      }
    });

    // Check client scope assignments
    console.log(`\n=== Client Scope Assignments ===`);

    // Get default client scopes
    const defaultScopes = await kcAdminClient.clients.listDefaultClientScopes({
      realm,
      id: client.id!,
    });

    console.log(`Default scopes: ${defaultScopes.map(s => s.name).join(', ')}`);

    // Get optional client scopes
    const optionalScopes = await kcAdminClient.clients.listOptionalClientScopes({
      realm,
      id: client.id!,
    });

    console.log(`Optional scopes: ${optionalScopes.map(s => s.name).join(', ')}`);

  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);