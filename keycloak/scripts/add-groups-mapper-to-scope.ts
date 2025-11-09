#!/usr/bin/env tsx

import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

const main = async () => {
  const KEYCLOAK_HOST = process.env.KEYCLOAK_HOST;
  invariant(KEYCLOAK_HOST, "KEYCLOAK_HOST environment variable is required");

  const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER;
  invariant(KEYCLOAK_ADMIN_USER, "KEYCLOAK_ADMIN_USER environment variable is required");

  const KEYCLOAK_ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD;
  invariant(KEYCLOAK_ADMIN_PASSWORD, "KEYCLOAK_ADMIN_PASSWORD environment variable is required");

  const realm = process.env.KEYCLOAK_REALM;
  invariant(realm, "KEYCLOAK_REALM environment variable is required");

  const scopeName = process.env.SCOPE_NAME;
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

    const clientScopes = await kcAdminClient.clientScopes.find();
    const scope = clientScopes.find((s) => s.name === scopeName);
    if (!scope) {
      throw new Error(`Client scope '${scopeName}' not found`);
    }

    invariant(scope.id, "Client scope ID is not set");

    const mapperName = "groups";
    const existingMappers = await kcAdminClient.clientScopes.listProtocolMappers({ id: scope.id });

    if (
      existingMappers.some(
        (mapper) => mapper.name === mapperName || mapper.config?.["claim.name"] === "groups"
      )
    ) {
      console.warn(`Groups mapper already exists in scope '${scopeName}'.`);
      return;
    }

    const groupsMapper = {
      name: mapperName,
      protocol: "openid-connect",
      protocolMapper: "oidc-group-membership-mapper",
      config: {
        "claim.name": "groups",
        "full.path": "false",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true",
      },
    };

    await kcAdminClient.clientScopes.addProtocolMapper({ id: scope.id }, groupsMapper);
    console.log(`Groups mapper added to client scope '${scopeName}'.`);
  } catch (error) {
    console.error("Error adding groups mapper to scope:", error);
    process.exit(1);
  }
};

main();
