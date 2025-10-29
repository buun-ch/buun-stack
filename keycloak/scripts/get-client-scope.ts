#!/usr/bin/env tsx

import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

const main = async () => {
  const KEYCLOAK_HOST = process.env.KEYCLOAK_HOST;
  const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER;
  const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD;
  const realm = process.env.KEYCLOAK_REALM;
  const scopeName = process.env.SCOPE_NAME;

  invariant(KEYCLOAK_HOST, "KEYCLOAK_HOST environment variable is required");
  invariant(KEYCLOAK_ADMIN_USER, "KEYCLOAK_ADMIN_USER environment variable is required");
  invariant(KEYCLOAK_ADMIN_PASSWORD, "KEYCLOAK_ADMIN_PASSWORD environment variable is required");
  invariant(realm, "KEYCLOAK_REALM environment variable is required");
  invariant(scopeName, "SCOPE_NAME environment variable is required");

  const kcAdminClient = new KcAdminClient({
    baseUrl: `https://${KEYCLOAK_HOST}`,
    realmName: "master",
  });

  try {
    await kcAdminClient.auth({
      username: KEYCLOAK_ADMIN_USER,
      password: KEYCLOAK_ADMIN_PASSWORD,
      grantType: "password",
      clientId: "admin-cli",
    });

    kcAdminClient.setConfig({
      realmName: realm,
    });

    const clientScopes = await kcAdminClient.clientScopes.find();
    const scope = clientScopes.find((s) => s.name === scopeName);

    if (!scope) {
      console.error(`Client scope '${scopeName}' not found in realm '${realm}'.`);
      process.exit(1);
    }

    invariant(scope.id, "Client scope ID is not set");

    const protocolMappers = await kcAdminClient.clientScopes.listProtocolMappers({ id: scope.id });

    console.log("\n=== Client Scope Details ===");
    console.log(`Name: ${scope.name}`);
    console.log(`ID: ${scope.id}`);
    console.log(`Description: ${scope.description || "(none)"}`);
    console.log(`Protocol: ${scope.protocol}`);
    console.log("\n=== Attributes ===");
    if (scope.attributes && Object.keys(scope.attributes).length > 0) {
      Object.entries(scope.attributes).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    } else {
      console.log("  (none)");
    }

    console.log("\n=== Protocol Mappers ===");
    if (protocolMappers.length > 0) {
      protocolMappers.forEach((mapper, index) => {
        console.log(`\nMapper ${index + 1}:`);
        console.log(`  Name: ${mapper.name}`);
        console.log(`  Protocol: ${mapper.protocol}`);
        console.log(`  Protocol Mapper: ${mapper.protocolMapper}`);
        console.log(`  Config:`);
        if (mapper.config && Object.keys(mapper.config).length > 0) {
          Object.entries(mapper.config).forEach(([key, value]) => {
            console.log(`    ${key}: ${value}`);
          });
        }
      });
    } else {
      console.log("  (none)");
    }

    console.log("\n=== Raw JSON ===");
    console.log(JSON.stringify({ ...scope, protocolMappers }, null, 2));
  } catch (error) {
    console.error("Error retrieving client scope:", error);
    process.exit(1);
  }
};

main();
