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

  const users = await kcAdminClient.users.find({ realm, username });
  if (users.length === 0) {
    throw new Error(`User '${username}' not found in realm '${realm}'`);
  }
  const user = users[0];

  const clients = await kcAdminClient.clients.find({ realm, clientId });
  if (clients.length === 0) {
    throw new Error(`Client '${clientId}' not found in realm '${realm}'`);
  }
  const client = clients[0];

  try {
    console.log(`Getting token for user '${username}' with client '${clientId}'...`);

    const clientSecret = await kcAdminClient.clients.getClientSecret({
      realm,
      id: client.id!,
    });

    const userClient = new KcAdminClient({
      baseUrl: `https://${process.env.KEYCLOAK_HOST}`,
      realmName: realm,
    });

    // Note: This requires the user's actual password or impersonation capability
    console.log("To get actual user token, you need:");
    console.log("1. User's password, or");
    console.log("2. Impersonation permissions");
    console.log("\nAlternatively, check the browser's Network tab:");
    console.log("1. Open DevTools -> Network tab");
    console.log("2. Try to trigger a DAG in Airflow");
    console.log("3. Look for the request with 403 error");
    console.log("4. Check Authorization header: 'Bearer <token>'");
    console.log("5. Decode at https://jwt.io");

    // Show client configuration that affects tokens
    console.log("\n=== Client Configuration ===");
    console.log(`Client ID: ${client.clientId}`);
    console.log(`Client Name: ${client.name}`);
    console.log(`Protocol: ${client.protocol}`);
    console.log(`Public Client: ${client.publicClient}`);

    const mappers = await kcAdminClient.clients.listProtocolMappers({
      realm,
      id: client.id!,
    });

    console.log("\n=== Protocol Mappers ===");
    mappers.forEach((mapper) => {
      console.log(`- ${mapper.name} (${mapper.protocolMapper})`);
      if (mapper.config) {
        console.log(`  Claim: ${mapper.config["claim.name"] || "N/A"}`);
        console.log(`  Access Token: ${mapper.config["access.token.claim"] || "false"}`);
        console.log(`  ID Token: ${mapper.config["id.token.claim"] || "false"}`);
      }
    });

    const clientRoles = await kcAdminClient.users.listClientRoleMappings({
      realm,
      id: user.id!,
      clientUniqueId: client.id!,
    });

    console.log("\n=== User's Client Roles ===");
    if (clientRoles.length === 0) {
      console.log("No client roles assigned");
    } else {
      clientRoles.forEach((role) => {
        console.log(`- ${role.name} (${role.id})`);
      });
    }
  } catch (error) {
    console.error(`Error: ${error}`);
  }
}

main().catch(console.error);
