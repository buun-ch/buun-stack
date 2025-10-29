#!/usr/bin/env tsx

import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

const main = async () => {
  const KEYCLOAK_HOST = process.env.KEYCLOAK_HOST;
  const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER;
  const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD;
  const realm = process.env.KEYCLOAK_REALM;
  const scopeName = process.env.SCOPE_NAME;
  const description = process.env.DESCRIPTION || "";

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

    console.log("Authentication successful.");

    kcAdminClient.setConfig({
      realmName: realm,
    });

    const existingScopes = await kcAdminClient.clientScopes.find();
    const existingScope = existingScopes.find((scope) => scope.name === scopeName);

    if (existingScope) {
      console.log(`Client scope '${scopeName}' already exists.`);
      return;
    }

    const result = await kcAdminClient.clientScopes.create({
      name: scopeName,
      description: description || `${scopeName} scope`,
      protocol: "openid-connect",
      attributes: {
        "include.in.token.scope": "true",
      },
    });

    console.log(`Client scope '${scopeName}' created successfully with ID: ${result.id}`);
  } catch (error) {
    console.error("Error creating client scope:", error);
    process.exit(1);
  }
};

main();
