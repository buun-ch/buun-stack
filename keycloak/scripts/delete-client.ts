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
    console.log("Authentication successful.");

    kcAdminClient.setConfig({ realmName });

    const existingClients = await kcAdminClient.clients.find({ clientId });
    if (existingClients.length === 0) {
      console.warn(`Client '${clientId}' does not exist.`);
      return;
    }

    const client = existingClients[0];
    invariant(client.id, "Client ID is not set");

    await kcAdminClient.clients.del({ id: client.id });
    console.log(`Client '${clientId}' successfully deleted.`);
  } catch (error) {
    console.error("An error occurred:", error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
};

main();
