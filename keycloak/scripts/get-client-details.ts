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

    const clientDetails = await kcAdminClient.clients.findOne({
      realm,
      id: client.id!,
    });

    console.log("=== Client Configuration ===");
    console.log(`Client ID: ${clientDetails?.clientId}`);
    console.log(`Access Type: ${clientDetails?.publicClient ? "public" : "confidential"}`);
    console.log(`Client Authenticator: ${clientDetails?.clientAuthenticatorType}`);
    console.log(`Standard Flow Enabled: ${clientDetails?.standardFlowEnabled}`);
    console.log(`Direct Access Grants: ${clientDetails?.directAccessGrantsEnabled}`);
    console.log(`Service Accounts Enabled: ${clientDetails?.serviceAccountsEnabled}`);
    console.log(`Valid Redirect URIs: ${JSON.stringify(clientDetails?.redirectUris, null, 2)}`);
    console.log(`Base URL: ${clientDetails?.baseUrl || "Not set"}`);
    console.log(`Root URL: ${clientDetails?.rootUrl || "Not set"}`);
    console.log(`Web Origins: ${JSON.stringify(clientDetails?.webOrigins, null, 2)}`);

    if (!clientDetails?.publicClient) {
      try {
        const clientSecret = await kcAdminClient.clients.getClientSecret({
          realm,
          id: client.id!,
        });
        console.log(`Client Secret: ${clientSecret.value}`);
      } catch (error) {
        console.log(`Client Secret: Error retrieving - ${error}`);
      }
    }
  } catch (error) {
    console.error(`Error retrieving client details: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
