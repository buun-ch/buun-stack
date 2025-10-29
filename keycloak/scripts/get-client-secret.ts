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
    const clients = await kcAdminClient.clients.find({ realm, clientId });
    if (clients.length === 0) {
      throw new Error(`Client '${clientId}' not found in realm '${realm}'`);
    }
    const client = clients[0];

    const clientSecret = await kcAdminClient.clients.getClientSecret({
      realm,
      id: client.id!,
    });

    console.log(`Client '${clientId}' secret: ${clientSecret.value}`);
  } catch (error) {
    console.error(`Error retrieving client secret: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
