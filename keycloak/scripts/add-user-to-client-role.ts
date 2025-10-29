#!/usr/bin/env tsx

import KcAdminClient from "@keycloak/keycloak-admin-client";
import RoleRepresentation from "@keycloak/keycloak-admin-client/lib/defs/roleRepresentation";
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

  let role: RoleRepresentation | null;
  try {
    role = await kcAdminClient.clients.findRole({
      realm,
      id: client.id!,
      roleName,
    });
  } catch (error) {
    // If role not found, try to list all roles for debugging
    const allRoles = await kcAdminClient.clients.listRoles({
      realm,
      id: client.id!,
    });
    console.error(
      `Available roles for client '${clientId}':`,
      allRoles.map((r) => r.name)
    );
    throw new Error(
      `Role '${roleName}' not found for client '${clientId}' in realm '${realm}'. Available roles: ${allRoles.map((r) => r.name).join(", ")}`
    );
  }

  if (!role) {
    throw new Error(`Role '${roleName}' not found for client '${clientId}' in realm '${realm}'`);
  }

  const existingRoles = await kcAdminClient.users.listClientRoleMappings({
    realm,
    id: user.id!,
    clientUniqueId: client.id!,
  });
  const hasRole = existingRoles.some((r) => r.name === roleName);
  if (hasRole) {
    console.log(`User '${username}' already has role '${roleName}' for client '${clientId}'`);
    return;
  }

  await kcAdminClient.users.addClientRoleMappings({
    realm,
    id: user.id!,
    clientUniqueId: client.id!,
    roles: [
      {
        id: role.id!,
        name: role.name!,
      },
    ],
  });

  console.log(
    `✓ Role '${roleName}' assigned to user '${username}' for client '${clientId}' in realm '${realm}'`
  );
}

main().catch(console.error);
