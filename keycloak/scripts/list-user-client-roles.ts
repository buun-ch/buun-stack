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
  const username = process.env.USERNAME!;
  const clientId = process.env.KEYCLOAK_CLIENT_ID!;

  invariant(realm, "KEYCLOAK_REALM is required");
  invariant(username, "USERNAME is required");
  invariant(clientId, "KEYCLOAK_CLIENT_ID is required");

  // Find the user
  const users = await kcAdminClient.users.find({ realm, username });

  if (users.length === 0) {
    throw new Error(`User '${username}' not found in realm '${realm}'`);
  }

  const user = users[0];

  // Find the client
  const clients = await kcAdminClient.clients.find({ realm, clientId });

  if (clients.length === 0) {
    throw new Error(`Client '${clientId}' not found in realm '${realm}'`);
  }

  const client = clients[0];

  try {
    // Get user's client role mappings
    const clientRoles = await kcAdminClient.users.listClientRoleMappings({
      realm,
      id: user.id!,
      clientUniqueId: client.id!,
    });

    console.log(`Client roles for user '${username}' in client '${clientId}':`);

    if (clientRoles.length === 0) {
      console.log("  No client roles assigned");
    } else {
      clientRoles.forEach((role) => {
        console.log(`  - ${role.name}`);
        if (role.description) {
          console.log(`    Description: ${role.description}`);
        }
      });
    }

    // Also show available roles for reference
    const availableRoles = await kcAdminClient.clients.listRoles({
      realm,
      id: client.id!,
    });

    console.log(`\nAvailable client roles in '${clientId}':`);
    availableRoles.forEach((role) => {
      const isAssigned = clientRoles.some((assigned) => assigned.id === role.id);
      const status = isAssigned ? "✓ assigned" : "  available";
      console.log(`  ${status}: ${role.name}`);
    });

  } catch (error) {
    console.error(`Error retrieving client roles: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);