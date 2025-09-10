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
  const roleName = process.env.KEYCLOAK_ROLE_NAME!;

  invariant(realm, "KEYCLOAK_REALM is required");
  invariant(clientId, "KEYCLOAK_CLIENT_ID is required");
  invariant(roleName, "KEYCLOAK_ROLE_NAME is required");

  // Find the client by clientId
  const clients = await kcAdminClient.clients.find({ realm, clientId });

  if (clients.length === 0) {
    throw new Error(`Client '${clientId}' not found in realm '${realm}'`);
  }

  const client = clients[0];

  // Check if role already exists
  try {
    const existingRole = await kcAdminClient.clients.findRole({
      realm,
      id: client.id!,
      roleName,
    });
    if (existingRole) {
      console.log(`Role '${roleName}' already exists for client '${clientId}'`);
      return;
    }
  } catch (error) {
    // Role doesn't exist, continue to create it
    console.log(`Role '${roleName}' doesn't exist, creating it...`);
  }

  // Create the client role
  await kcAdminClient.clients.createRole({
    realm,
    id: client.id!,
    name: roleName,
  });

  console.log(
    `✓ Client role '${roleName}' created for client '${clientId}' in realm '${realm}'`,
  );
}

main().catch(console.error);

