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
  const roleName = process.env.KEYCLOAK_ROLE_NAME!;

  invariant(realm, "KEYCLOAK_REALM is required");
  invariant(username, "USERNAME is required");
  invariant(clientId, "KEYCLOAK_CLIENT_ID is required");
  invariant(roleName, "KEYCLOAK_ROLE_NAME is required");

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

  const role = await kcAdminClient.clients.findRole({
    realm,
    id: client.id!,
    roleName,
  });

  await kcAdminClient.users.delClientRoleMappings({
    realm,
    id: user.id!,
    clientUniqueId: client.id!,
    roles: [
      {
        id: role?.id!,
        name: role?.name!,
      },
    ],
  });

  console.log(
    `✓ Role '${roleName}' removed from user '${username}' for client '${clientId}' in realm '${realm}'`
  );
}

main().catch(console.error);
