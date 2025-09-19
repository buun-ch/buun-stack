import KcAdminClient from "@keycloak/keycloak-admin-client";
import invariant from "tiny-invariant";

const main = async () => {
  const keycloakHost = process.env.KEYCLOAK_HOST;
  invariant(keycloakHost, "KEYCLOAK_HOST environment variable is required.");

  const adminUsername = process.env.KEYCLOAK_ADMIN_USER;
  invariant(adminUsername, "KEYCLOAK_ADMIN_USER environment variable is required.");

  const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD;
  invariant(adminPassword, "KEYCLOAK_ADMIN_PASSWORD environment variable is required");

  const realmName = process.env.KEYCLOAK_REALM;
  invariant(realmName, "KEYCLOAK_REALM environment variable is required");

  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  invariant(clientId, "KEYCLOAK_CLIENT_ID environment variable is required");

  const kcAdminClient = new KcAdminClient({
    baseUrl: `https://${keycloakHost}`,
    realmName: "master",
  });

  try {
    await kcAdminClient.auth({
      username: adminUsername,
      password: adminPassword,
      grantType: "password",
      clientId: "admin-cli",
    });

    kcAdminClient.setConfig({ realmName });

    const clients = await kcAdminClient.clients.find({ clientId });

    if (clients.length === 0) {
      console.log(`Client '${clientId}' not found in realm '${realmName}'`);
      process.exit(1);
    }

    const client = clients[0];

    console.log(`=== Client Details: ${clientId} ===`);
    console.log(`ID: ${client.id}`);
    console.log(`Client ID: ${client.clientId}`);
    console.log(`Name: ${client.name || 'N/A'}`);
    console.log(`Description: ${client.description || 'N/A'}`);
    console.log(`Enabled: ${client.enabled}`);
    console.log(`Protocol: ${client.protocol}`);
    console.log(`Public Client: ${client.publicClient}`);
    console.log(`Bearer Only: ${client.bearerOnly}`);
    console.log(`Standard Flow Enabled: ${client.standardFlowEnabled}`);
    console.log(`Direct Access Grants Enabled: ${client.directAccessGrantsEnabled}`);
    console.log(`Service Accounts Enabled: ${client.serviceAccountsEnabled}`);
    console.log(`Front Channel Logout: ${client.frontchannelLogout}`);
    console.log(`Always Display in Console: ${client.alwaysDisplayInConsole}`);
    console.log("");

    if (client.rootUrl) {
      console.log(`Root URL: ${client.rootUrl}`);
    }
    if (client.baseUrl) {
      console.log(`Base URL: ${client.baseUrl}`);
    }
    if (client.adminUrl) {
      console.log(`Admin URL: ${client.adminUrl}`);
    }
    console.log("");

    if (client.redirectUris && client.redirectUris.length > 0) {
      console.log("Redirect URIs:");
      client.redirectUris.forEach((uri, index) => {
        console.log(`  ${index + 1}. ${uri}`);
      });
      console.log("");
    }

    if (client.webOrigins && client.webOrigins.length > 0) {
      console.log("Web Origins:");
      client.webOrigins.forEach((origin, index) => {
        console.log(`  ${index + 1}. ${origin}`);
      });
      console.log("");
    }

    if (client.attributes && Object.keys(client.attributes).length > 0) {
      console.log("Attributes:");
      Object.entries(client.attributes).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
      console.log("");
    }

    if (client.defaultClientScopes && client.defaultClientScopes.length > 0) {
      console.log("Default Client Scopes:");
      client.defaultClientScopes.forEach((scope, index) => {
        console.log(`  ${index + 1}. ${scope}`);
      });
      console.log("");
    }

    if (client.optionalClientScopes && client.optionalClientScopes.length > 0) {
      console.log("Optional Client Scopes:");
      client.optionalClientScopes.forEach((scope, index) => {
        console.log(`  ${index + 1}. ${scope}`);
      });
      console.log("");
    }

    // Get protocol mappers
    const protocolMappers = await kcAdminClient.clients.listProtocolMappers({ id: client.id! });
    if (protocolMappers.length > 0) {
      console.log("Protocol Mappers:");
      protocolMappers.forEach((mapper, index) => {
        console.log(`  ${index + 1}. ${mapper.name} (${mapper.protocolMapper})`);
        if (mapper.config) {
          Object.entries(mapper.config).forEach(([key, value]) => {
            console.log(`     ${key}: ${value}`);
          });
        }
      });
      console.log("");
    }

  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  }
};

main();