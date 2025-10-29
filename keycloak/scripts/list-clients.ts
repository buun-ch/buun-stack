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

    const clients = await kcAdminClient.clients.find();

    console.log(`Found ${clients.length} clients in realm '${realmName}':`);
    console.log("");

    clients.forEach((client, index) => {
      const clientType = client.publicClient ? "Public" : "Confidential";
      const status = client.enabled ? "Enabled" : "Disabled";
      const protocol = client.protocol || "unknown";

      console.log(`${(index + 1).toString().padStart(2, " ")}. ${client.clientId}`);
      console.log(`    ID: ${client.id}`);
      console.log(`    Type: ${clientType}`);
      console.log(`    Protocol: ${protocol}`);
      console.log(`    Status: ${status}`);

      if (client.redirectUris && client.redirectUris.length > 0) {
        console.log(`    Redirect URIs: ${client.redirectUris.join(", ")}`);
      }

      if (client.webOrigins && client.webOrigins.length > 0) {
        console.log(`    Web Origins: ${client.webOrigins.join(", ")}`);
      }

      console.log("");
    });
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  }
};

main();
