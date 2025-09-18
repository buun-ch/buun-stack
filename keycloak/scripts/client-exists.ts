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
    // Find the client by clientId
    const clients = await kcAdminClient.clients.find({ realm, clientId });

    if (clients.length > 0) {
      console.log(`Client '${clientId}' exists in realm '${realm}'`);
      process.exit(0); // Success - client exists
    } else {
      console.log(`Client '${clientId}' does not exist in realm '${realm}'`);
      process.exit(1); // Client doesn't exist
    }
  } catch (error) {
    console.error(`Error checking client existence: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);